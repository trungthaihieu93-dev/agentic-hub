import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { queryKeys } from '@/lib/queries';
import { jsonResponse, mockFetch, mockViewport, renderWithClient } from '@/test/helpers';
import { Layout } from './layout';
import { navigate, usePathname } from './router';

function RouteContent() {
  const pathname = usePathname();
  return <h1>{pathname === '/audit' ? 'Audit content' : 'Accounts content'}</h1>;
}

function renderLayout(width = 1280) {
  const viewport = mockViewport(width);
  return {
    viewport,
    ...renderWithClient(<><Layout><RouteContent /></Layout><Toaster /></>),
  };
}

describe('desktop sidebar', () => {
  it('shows current route links and the local session controls without inventing an identity', async () => {
    renderLayout();
    const navigation = screen.getByRole('navigation', { name: 'Main' });
    const accounts = within(navigation).getByRole('link', { name: 'Accounts' });
    const audit = within(navigation).getByRole('link', { name: 'Audit log' });
    expect(accounts).toHaveAttribute('href', '/');
    expect(accounts).toHaveAttribute('aria-current', 'page');
    expect(audit).toHaveAttribute('href', '/audit');
    expect(audit).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('button', { name: 'Open navigation menu' })).not.toBeInTheDocument();
    const session = screen.getByRole('region', { name: 'Local session' });
    expect(session).toHaveTextContent('Local admin');
    expect(within(session).getByRole('button', { name: 'Sign out' })).toBeEnabled();
    expect(within(session).getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(session).queryByText(/@/)).not.toBeInTheDocument();

    await userEvent.click(audit);
    expect(window.location.pathname).toBe('/audit');
    expect(audit).toHaveAttribute('aria-current', 'page');
    expect(accounts).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { name: 'Audit content' })).toBeInTheDocument();
    window.history.back();
    await waitFor(() => expect(accounts).toHaveAttribute('aria-current', 'page'));
    window.history.forward();
    await waitFor(() => expect(audit).toHaveAttribute('aria-current', 'page'));
  });
});

describe('mobile navigation drawer', () => {
  it('opens by keyboard, traps focus, and restores the menu trigger on Escape', async () => {
    renderLayout(375);
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    trigger.focus();
    await userEvent.keyboard('{Enter}');

    const drawer = screen.getByRole('dialog', { name: 'Main navigation' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('navigation', { name: 'Main' })).toHaveLength(1);
    const first = within(drawer).getByRole('link', { name: 'Accounts' });
    expect(first).toHaveFocus();
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(within(drawer).getByRole('button', { name: 'Close navigation menu' })).toHaveFocus();
    await userEvent.keyboard('{Tab}');
    expect(first).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('restores the visible menu trigger after an overlay click', async () => {
    const { baseElement } = renderLayout(375);
    const trigger = screen.getByRole('button', { name: 'Open navigation menu' });
    await userEvent.click(trigger);
    const overlay = baseElement.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    await userEvent.click(overlay as HTMLElement);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes the current-route link without creating history and focuses main', async () => {
    renderLayout(375);
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const push = vi.spyOn(window.history, 'pushState');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Accounts' }));

    expect(push).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/');
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('navigates normally, closes, and focuses the newly rendered main content', async () => {
    renderLayout(375);
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Audit log' }));

    expect(window.location.pathname).toBe('/audit');
    expect(screen.getByRole('heading', { name: 'Audit content' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Audit log' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }])(
    'preserves modified-click behavior and keeps the drawer open for %o',
    async (modifier) => {
      renderLayout(375);
      await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
      const audit = within(screen.getByRole('dialog')).getByRole('link', { name: 'Audit log' });
      let preventedByLink: boolean | undefined;
      const preventBrowserNavigation = (event: globalThis.MouseEvent) => {
        preventedByLink = event.defaultPrevented;
        event.preventDefault();
      };
      document.addEventListener('click', preventBrowserNavigation, { once: true });
      fireEvent.click(audit, { button: 0, ...modifier });

      expect(preventedByLink).toBe(false);
      expect(window.location.pathname).toBe('/');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    },
  );

  it('closes on browser back and forward and updates the current link', async () => {
    renderLayout(375);
    act(() => navigate('/audit'));
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    window.history.forward();
    await waitFor(() => expect(window.location.pathname).toBe('/audit'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Audit log' })).toHaveAttribute('aria-current', 'page');
  });

  it('releases the modal at the desktop breakpoint and focuses visible main instead of the hidden trigger', async () => {
    const { viewport } = renderLayout(1023);
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    act(() => viewport.resize(1024));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Open navigation menu' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main' })).toHaveLength(1);
    expect(document.body).not.toHaveStyle({ pointerEvents: 'none' });
    act(() => viewport.resize(1023));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });
});

describe('sidebar sign out', () => {
  it.each([200, 401])('waits for HTTP %s, then clears protected cache, records signed out, and replaces history', async (status) => {
    let respond!: (response: Response) => void;
    const fetch = mockFetch(() => new Promise((resolve) => { respond = resolve; }));
    const { client } = renderLayout();
    client.setQueryData(queryKeys.accounts, { protected: true });
    client.setQueryData(queryKeys.audit, ['protected']);
    client.setQueryData(queryKeys.me, { authenticated: true });
    const clear = vi.spyOn(client, 'clear');
    const setData = vi.spyOn(client, 'setQueryData');
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');

    await userEvent.dblClick(screen.getByRole('button', { name: 'Sign out' }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
    expect(clear).not.toHaveBeenCalled();
    expect(client.getQueryData(queryKeys.accounts)).toEqual({ protected: true });
    expect(window.location.pathname).toBe('/');
    await act(async () => respond(jsonResponse({ ok: true }, status)));

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(client.getQueryData(queryKeys.accounts)).toBeUndefined();
    expect(client.getQueryData(queryKeys.audit)).toBeUndefined();
    expect(client.getQueryData(queryKeys.me)).toEqual({ authenticated: false });
    expect(replace).toHaveBeenCalledWith(null, '', '/login');
    expect(push).not.toHaveBeenCalled();
    const [clearedAt] = clear.mock.invocationCallOrder;
    const [markedAt] = setData.mock.invocationCallOrder;
    const [redirectedAt] = replace.mock.invocationCallOrder;
    if (clearedAt === undefined || markedAt === undefined || redirectedAt === undefined) {
      throw new Error('Sign out must clear cache, record the session, and replace history.');
    }
    expect(clearedAt).toBeLessThan(markedAt);
    expect(markedAt).toBeLessThan(redirectedAt);
  });

  it('keeps protected cache, route, and drawer on failure and shows the server error in a toast', async () => {
    const fetch = mockFetch(() => jsonResponse({ error: 'unavailable', message: 'Try signing out again.' }, 503));
    const { client } = renderLayout(375);
    client.setQueryData(queryKeys.accounts, { protected: true });
    client.setQueryData(queryKeys.me, { authenticated: true });
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('Could not sign out')).toBeInTheDocument();
    expect(screen.getByText('Try signing out again.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(client.getQueryData(queryKeys.accounts)).toEqual({ protected: true });
    expect(client.getQueryData(queryKeys.me)).toEqual({ authenticated: true });
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' })).toBeEnabled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
