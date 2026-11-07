import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queries';
import { jsonResponse, makeTarget, mockFetch, mockViewport, workAccount } from '@/test/helpers';
import { App, createQueryClient } from './app';

const clients: ReturnType<typeof createQueryClient>[] = [];

function renderApp(width = 1280) {
  mockViewport(width);
  const client = createQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retry: false, gcTime: Infinity },
  });
  clients.push(client);
  return { client, ...render(<App client={client} />) };
}

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

describe('App authentication gates', () => {
  it.each([200, 401])('replaces a protected URL with login for a signed-out HTTP %s response', async (status) => {
    window.history.replaceState(null, '', '/audit');
    const replace = vi.spyOn(window.history, 'replaceState');
    const fetch = mockFetch(() => status === 401
      ? jsonResponse({ error: 'unauthorized', message: 'Sign in first.' }, status)
      : jsonResponse({ authenticated: false }));
    renderApp();

    const password = await screen.findByLabelText('Admin password');
    expect(password).toHaveFocus();
    expect(window.location.pathname).toBe('/login');
    expect(replace).toHaveBeenCalledWith(null, '', '/login');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/auth/me']);
  });

  it.each(['light', 'dark'] as const)('keeps %s appearance through loading, retryable auth error, and login', async (theme) => {
    window.__AH_THEME__.setTheme(theme);
    let first = true;
    let respond!: (response: Response) => void;
    mockFetch(() => {
      if (first) {
        first = false;
        return new Promise((resolve) => { respond = resolve; });
      }
      return jsonResponse({ authenticated: false });
    });
    const { container } = renderApp();
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(window.__AH_THEME__.getTheme()).toBe(theme);

    await act(async () => respond(jsonResponse({ error: 'unavailable', message: 'Temporary maintenance.' }, 503)));
    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary maintenance.');
    act(() => { toast.error('Authentication request failed'); });
    await screen.findByText('Authentication request failed');
    expect(container.querySelector('[data-sonner-toaster]')).toHaveAttribute('data-sonner-theme', theme);
    expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark');

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByLabelText('Admin password')).toHaveFocus();
    expect(screen.getByRole('button', { name: theme === 'light' ? 'Light' : 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-sonner-toaster]')).toHaveAttribute('data-sonner-theme', theme);
  });

  it('retains login validation, then shows authenticated Accounts and Audit using the same query client', async () => {
    mockFetch((url, init) => {
      if (url === '/api/auth/me') return jsonResponse({ authenticated: false });
      if (url === '/api/auth/login') {
        const body = JSON.parse(String(init.body)) as { password: string };
        return body.password === 'correct'
          ? jsonResponse({ ok: true })
          : jsonResponse({ error: 'unauthorized', message: 'Invalid password' }, 401);
      }
      if (url === '/api/accounts') return jsonResponse({ targets: [makeTarget()] });
      return jsonResponse({ entries: [] });
    });
    const { client } = renderApp();
    const password = await screen.findByLabelText('Admin password');
    await userEvent.type(password, 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong password');
    expect(password).toHaveFocus();
    await userEvent.clear(password);
    await userEvent.type(password, 'correct');
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Accounts' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Claude Code CLI' })).toBeInTheDocument();
    expect(client.getQueryData(queryKeys.me)).toEqual({ authenticated: true });
    client.setQueryData(['retained'], 'same client');
    await userEvent.click(screen.getByRole('button', { name: 'Dark' }));
    await userEvent.click(screen.getByRole('link', { name: 'Audit log' }));
    expect(await screen.findByRole('heading', { name: 'Audit log' })).toBeInTheDocument();
    expect(await screen.findByText('No switches yet.')).toBeInTheDocument();
    expect(client.getQueryData(['retained'])).toBe('same client');
    expect(window.location.pathname).toBe('/audit');
  });

  it('returns to login when a protected account request expires the session', async () => {
    let expired = false;
    mockFetch((url) => url === '/api/auth/me'
      ? jsonResponse({ authenticated: true })
      : expired
        ? jsonResponse({ error: 'unauthorized', message: 'Session expired.' }, 401)
        : jsonResponse({ targets: [makeTarget()] }));
    const { client } = renderApp();
    await screen.findByRole('region', { name: 'Claude Code CLI' });
    expired = true;
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.accounts }); });

    expect(await screen.findByLabelText('Admin password')).toHaveFocus();
    expect(window.location.pathname).toBe('/login');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

describe('App portals and logout', () => {
  it.each(['light', 'dark'] as const)('keeps a real capture portal and result toast aligned with %s appearance', async (theme) => {
    window.__AH_THEME__.setTheme(theme);
    const fetch = mockFetch((url) => {
      if (url === '/api/auth/me') return jsonResponse({ authenticated: true });
      if (url === '/api/accounts/capture') {
        return jsonResponse({ account: { ...workAccount, label: 'snapshot' }, created: true });
      }
      return jsonResponse({ targets: [makeTarget()] });
    });
    const { container } = renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Capture current login' }));
    const dialog = screen.getByRole('dialog', { name: 'Capture current login' });
    expect(container.contains(dialog)).toBe(false);
    const label = within(dialog).getByLabelText('Account label');
    expect(label).toHaveFocus();
    expect(window.__AH_THEME__.getTheme()).toBe(theme);
    await userEvent.type(label, 'snapshot');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Capture' }));

    expect(await screen.findByText('Saved account "snapshot"')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container.querySelector('[data-sonner-toaster]')).toHaveAttribute('data-sonner-theme', theme);
    expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark');
    expect(fetch.mock.calls.find(([url]) => url === '/api/accounts/capture')?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ target: 'claude-cli', label: 'snapshot' }),
    });
  });

  it('signs out from the drawer without deferred focus stealing the new login field', async () => {
    mockFetch((url) => {
      if (url === '/api/auth/me') return jsonResponse({ authenticated: true });
      if (url === '/api/auth/logout') return jsonResponse({ ok: true });
      return jsonResponse({ targets: [makeTarget()] });
    });
    const { client } = renderApp(375);
    await screen.findByRole('region', { name: 'Claude Code CLI' });
    client.setQueryData(queryKeys.audit, ['protected']);
    const replace = vi.spyOn(window.history, 'replaceState');
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign out' }));

    const password = await screen.findByLabelText('Admin password');
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(password).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(client.getQueryData(queryKeys.accounts)).toBeUndefined();
    expect(client.getQueryData(queryKeys.audit)).toBeUndefined();
    expect(client.getQueryData(queryKeys.me)).toEqual({ authenticated: false });
    expect(replace).toHaveBeenCalledWith(null, '', '/login');
    await waitFor(() => expect(document.body).not.toHaveStyle({ pointerEvents: 'none' }));
  });
});
