import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaptureDialog } from './capture-dialog';
import { jsonResponse, mockFetch, renderWithClient, workAccount } from '@/test/helpers';

describe('CaptureDialog', () => {
  it('rejects an invalid label without calling the server', async () => {
    const fetchMock = mockFetch(() => jsonResponse({}));
    renderWithClient(<CaptureDialog open onOpenChange={vi.fn()} target="claude-cli" mode="capture" />);
    await userEvent.type(screen.getByLabelText('Account label'), '.hidden');
    await userEvent.click(screen.getByRole('button', { name: 'Capture' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A label cannot start with a dot');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('captures with a valid label and closes', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ account: workAccount, created: true }));
    const onOpenChange = vi.fn();
    renderWithClient(<CaptureDialog open onOpenChange={onOpenChange} target="claude-cli" mode="capture" />);
    await userEvent.type(screen.getByLabelText('Account label'), 'work');
    await userEvent.click(screen.getByRole('button', { name: 'Capture' }));
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/accounts/capture');
    expect(JSON.parse(String(init.body))).toEqual({ target: 'claude-cli', label: 'work' });
  });
});
