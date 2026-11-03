import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './login-page';
import { jsonResponse, mockFetch, renderWithClient } from '@/test/helpers';

describe('LoginPage', () => {
  it('shows an error and returns focus to the field on a wrong password', async () => {
    mockFetch(() => jsonResponse({ error: 'unauthorized', message: 'Invalid password' }, 401));
    renderWithClient(<LoginPage />);
    const field = screen.getByLabelText('Admin password');
    expect(field).toHaveFocus();

    await userEvent.type(field, 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong password');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(field).toHaveFocus());
  });

  it('shows the server back-off message on 429', async () => {
    mockFetch(() => jsonResponse({ error: 'rate_limited', message: 'Too many attempts. Wait 30 s.' }, 429));
    renderWithClient(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Admin password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Wait 30 s.');
  });

  it('asks for a password instead of sending an empty one', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ ok: true }));
    renderWithClient(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the admin password');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
