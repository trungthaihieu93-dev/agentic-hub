import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SwitchConfirmDialog } from './switch-confirm-dialog';
import { jsonResponse, mockFetch, personalAccount, renderWithClient } from '@/test/helpers';

const procs = [
  { pid: 101, name: 'claude', cmdline: 'claude --resume abc' },
  { pid: 202, name: 'claude', cmdline: 'claude' },
];

describe('SwitchConfirmDialog', () => {
  it('lists the running sessions on 409 and retries with force on "Switch anyway"', async () => {
    const bodies: unknown[] = [];
    mockFetch((_url, init) => {
      const body = JSON.parse(String(init.body)) as { force?: boolean };
      bodies.push(body);
      if (!body.force) {
        return jsonResponse(
          { outcome: 'refused', warnings: procs, message: 'Sessions are running', needsForce: true, appRunning: false },
          409,
        );
      }
      return jsonResponse({ outcome: 'ok', warnings: [], message: 'Switched', needsForce: false, appRunning: false });
    });
    const onOpenChange = vi.fn();
    renderWithClient(
      <SwitchConfirmDialog open onOpenChange={onOpenChange} target="claude-cli" account={personalAccount} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Switch' }));

    const list = await screen.findByRole('list', { name: 'Running processes' });
    expect(list).toHaveTextContent('pid 101');
    expect(list).toHaveTextContent('pid 202');
    expect(
      screen.getByText(/forced switch can make running sessions write the old account back and may require a re-login/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Switch anyway' }));
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(bodies[1]).toMatchObject({ force: true, accountId: personalAccount.id });
  });

  it('tells the user to quit the app on 423', async () => {
    mockFetch(() =>
      jsonResponse(
        {
          outcome: 'refused',
          warnings: [{ pid: 7, name: 'claude-desktop', cmdline: '/usr/lib/claude-desktop/claude-desktop' }],
          message: 'Claude desktop is running',
          needsForce: false,
          appRunning: true,
        },
        423,
      ),
    );
    renderWithClient(
      <SwitchConfirmDialog
        open
        onOpenChange={vi.fn()}
        target="claude-desktop"
        account={{ ...personalAccount, target: 'claude-desktop' }}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Switch' }));
    expect(await screen.findByText('Quit Claude desktop first.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch anyway' })).not.toBeInTheDocument();
  });

  it('sends relaunch for desktop targets when the box is ticked', async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({ outcome: 'ok', warnings: [], message: 'Switched', needsForce: false, appRunning: false }),
    );
    renderWithClient(
      <SwitchConfirmDialog
        open
        onOpenChange={vi.fn()}
        target="claude-desktop"
        account={{ ...personalAccount, target: 'claude-desktop' }}
      />,
    );
    await userEvent.click(screen.getByLabelText('Relaunch Claude desktop after switching'));
    await userEvent.click(screen.getByRole('button', { name: 'Switch' }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({ relaunch: true });
  });
});
