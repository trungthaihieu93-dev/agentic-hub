import { StrictMode } from 'react';
import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/theme-toggle';
import { Toaster } from '@/components/ui/sonner';
import { LoginPage } from '@/pages/login-page';
import { initializeTheme, mockFetch, jsonResponse, renderWithClient } from '@/test/helpers';
import { useTheme } from './theme';

function systemTheme(dark: boolean) {
  let matches = dark;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const media = {
    get matches() { return matches; },
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((_type: string, listener: (event: { matches: boolean }) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: (event: { matches: boolean }) => void) => {
      listeners.delete(listener);
    }),
  };
  vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
  return {
    media,
    change(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener({ matches }));
    },
    listenerCount: () => listeners.size,
  };
}

function expectTheme(theme: 'light' | 'dark') {
  expect(window.__AH_THEME__.getTheme()).toBe(theme);
  expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark');
  expect(document.querySelector('meta[name="color-scheme"]')).toHaveAttribute('content', theme);
}

describe('theme bootstrap', () => {
  it.each([
    ['light', true],
    ['light', false],
    ['dark', false],
    ['dark', true],
  ] as const)('uses the saved %s preference with system dark=%s', (saved, dark) => {
    window.localStorage.setItem('ah-theme', saved);
    const system = systemTheme(dark);
    initializeTheme();

    expectTheme(saved);
    expect(system.listenerCount()).toBe(0);
    system.change(!dark);
    expectTheme(saved);
  });

  it.each([
    [null, false], [null, true],
    ['', false], ['', true],
    ['LIGHT', false], ['LIGHT', true],
    ['dark ', false], ['dark ', true],
    ['system', false], ['system', true],
  ] as const)('follows system changes for preference %s with system dark=%s', (saved, dark) => {
    if (saved !== null) window.localStorage.setItem('ah-theme', saved);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const system = systemTheme(dark);
    initializeTheme();

    expectTheme(dark ? 'dark' : 'light');
    expect(system.listenerCount()).toBe(1);
    system.change(true);
    expectTheme('dark');
    system.change(false);
    expectTheme('light');
    expect(write).not.toHaveBeenCalled();
  });

  it('starts dark when the unsaved system preference is dark', () => {
    systemTheme(true);
    initializeTheme();
    expectTheme('dark');
  });

  it.each(['getter', 'read'] as const)('continues to follow the system when the storage %s throws', (failure) => {
    if (failure === 'getter') {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new DOMException('Storage denied', 'SecurityError');
      });
    } else {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Storage denied', 'SecurityError');
      });
    }
    const system = systemTheme(true);
    initializeTheme();

    expectTheme('dark');
    system.change(false);
    expectTheme('light');
    window.__AH_THEME__.setTheme('dark');
    expectTheme('dark');
    system.change(false);
    expectTheme('dark');
  });

  it('falls back to light without matchMedia and still accepts a choice', () => {
    vi.stubGlobal('matchMedia', undefined);
    initializeTheme();

    expectTheme('light');
    window.__AH_THEME__.setTheme('dark');
    expectTheme('dark');
  });

  it('keeps an explicit choice in memory and removes the OS listener when storage writes fail', () => {
    const system = systemTheme(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    initializeTheme();

    window.__AH_THEME__.setTheme('dark');
    expectTheme('dark');
    expect(system.listenerCount()).toBe(0);
    system.change(false);
    expectTheme('dark');
  });

  it('locks an explicit choice even when it matches the current system theme', () => {
    const system = systemTheme(false);
    initializeTheme();
    const listener = vi.fn();
    window.__AH_THEME__.subscribe(listener);

    window.__AH_THEME__.setTheme('light');
    system.change(true);
    expectTheme('light');
    expect(window.localStorage.getItem('ah-theme')).toBe('light');
    expect(listener).not.toHaveBeenCalled();
    expect(system.listenerCount()).toBe(0);
  });

  it('persists a choice for the next initialization against the opposite system setting', () => {
    const system = systemTheme(false);
    initializeTheme();
    window.__AH_THEME__.setTheme('dark');
    expect(window.localStorage.getItem('ah-theme')).toBe('dark');

    system.change(false);
    initializeTheme();
    expectTheme('dark');
    expect(system.listenerCount()).toBe(0);
  });

  it('notifies only on resolved changes and stops notifying unsubscribed listeners', () => {
    const system = systemTheme(false);
    initializeTheme();
    const listener = vi.fn(() => expectTheme('dark'));
    const unsubscribe = window.__AH_THEME__.subscribe(listener);

    system.change(false);
    expect(listener).not.toHaveBeenCalled();
    system.change(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    system.change(false);
    window.__AH_THEME__.setTheme('dark');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('theme consumers', () => {
  it('keeps one live subscription through StrictMode and cleans it up on unmount', () => {
    const controller = window.__AH_THEME__;
    const subscribe = controller.subscribe;
    let activeSubscriptions = 0;
    vi.spyOn(controller, 'subscribe').mockImplementation((listener) => {
      activeSubscriptions += 1;
      const cleanup = subscribe(listener);
      return () => {
        activeSubscriptions -= 1;
        cleanup();
      };
    });
    const { result, unmount } = renderHook(useTheme, { wrapper: StrictMode });

    expect(activeSubscriptions).toBe(1);
    expect(result.current).toBe('light');
    act(() => controller.setTheme('dark'));
    expect(result.current).toBe('dark');
    unmount();
    expect(activeSubscriptions).toBe(0);
  });

  it('keeps labelled controls, the root, and the mounted toaster in agreement without clearing query data', async () => {
    const { client, container } = renderWithClient(<><ThemeToggle /><Toaster /></>);
    client.setQueryData(['theme-survives'], { retained: true });
    const group = screen.getByRole('group', { name: 'Appearance' });
    const light = within(group).getByRole('button', { name: 'Light' });
    const dark = within(group).getByRole('button', { name: 'Dark' });
    act(() => { toast.success('Appearance saved'); });
    await screen.findByText('Appearance saved');
    const toaster = container.querySelector('[data-sonner-toaster]');
    expect(light).toHaveAttribute('aria-pressed', 'true');
    expect(dark).toHaveAttribute('aria-pressed', 'false');
    expect(toaster).toHaveAttribute('data-sonner-theme', 'light');

    await userEvent.click(dark);
    expectTheme('dark');
    expect(dark).toHaveAttribute('aria-pressed', 'true');
    expect(light).toHaveAttribute('aria-pressed', 'false');
    expect(toaster).toHaveAttribute('data-sonner-theme', 'dark');
    expect(container.querySelector('[data-sonner-toaster]')).toBe(toaster);
    expect(client.getQueryData(['theme-survives'])).toEqual({ retained: true });

    await userEvent.click(light);
    expectTheme('light');
    expect(toaster).toHaveAttribute('data-sonner-theme', 'light');
  });

  it('updates the controls and toaster when the unsaved OS preference changes', async () => {
    const system = systemTheme(false);
    initializeTheme();
    const { container } = render(<><ThemeToggle /><Toaster /></>);
    act(() => { toast.error('Example error'); });
    await screen.findByText('Example error');

    act(() => system.change(true));
    expectTheme('dark');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-sonner-toaster]')).toHaveAttribute('data-sonner-theme', 'dark');
  });

  it('keeps the login control outside the form and preserves password focus and submission', async () => {
    const fetch = mockFetch(() => jsonResponse({ ok: true }));
    renderWithClient(<LoginPage />);
    const field = screen.getByLabelText('Admin password');
    const dark = screen.getByRole('button', { name: 'Dark' });
    expect(field).toHaveFocus();
    expect(dark.closest('form')).toBeNull();

    await userEvent.click(dark);
    expect(fetch).not.toHaveBeenCalled();
    expectTheme('dark');
    await userEvent.type(field, 'password');
    await userEvent.keyboard('{Enter}');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
