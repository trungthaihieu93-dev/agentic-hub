import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TargetCard } from './target-card';
import { makeTarget, renderWithClient, workAccount } from '@/test/helpers';

function renderCard(overrides: Parameters<typeof makeTarget>[0] = {}) {
  const handlers = { onSwitch: vi.fn(), onCapture: vi.fn(), onAddEmpty: vi.fn() };
  renderWithClient(<TargetCard target={makeTarget(overrides)} {...handlers} />);
  return handlers;
}

describe('TargetCard', () => {
  it('shows the drift banner with its actions when drift is true', async () => {
    const h = renderCard({
      drift: true,
      live: { loggedIn: true, email: 'other@example.com', orgName: null, checkedAt: '2026-11-03T08:05:00.000Z' },
    });
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Login drift');
    expect(banner).toHaveTextContent('other@example.com');

    await userEvent.click(screen.getByRole('button', { name: 'Capture as…' }));
    expect(h.onCapture).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Switch back to work' }));
    expect(h.onSwitch).toHaveBeenCalledWith(workAccount);
  });

  it('hides the drift banner when drift is false', () => {
    renderCard();
    expect(screen.queryByText(/Login drift/)).not.toBeInTheDocument();
  });

  it('marks the active account by text and offers Switch only for others', () => {
    renderCard();
    const saved = within(screen.getByRole('region', { name: 'Saved accounts' }));
    expect(saved.getByText('Active')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Switch' })).toHaveLength(1);
  });

  it('shows the login command for CLI targets and running processes', () => {
    renderCard({ runningProcesses: [{ pid: 4242, name: 'claude', cmdline: 'claude --resume' }] });
    expect(screen.getByText('claude auth login')).toBeInTheDocument();
    expect(screen.getByText('pid 4242')).toBeInTheDocument();
  });

  it('shows the desktop flow and the shared MCP config note', () => {
    renderCard({ target: 'claude-desktop', sharedFiles: ['claude_desktop_config.json'] });
    expect(screen.getByRole('button', { name: 'Add empty account' })).toBeInTheDocument();
    expect(screen.getByText(/MCP config is shared/)).toBeInTheDocument();
    expect(screen.getByText('claude_desktop_config.json')).toBeInTheDocument();
  });

  it('shows the reason and no actions when the target is disabled', () => {
    renderCard({ target: 'codex-desktop', enabled: false, disabledReason: 'Codex desktop is not installed' });
    expect(screen.getByText('Codex desktop is not installed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Capture current login/ })).not.toBeInTheDocument();
  });
});
