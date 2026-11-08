import { useState } from 'react';
import type { AccountDto, TargetId } from '@agentic-hub/shared';
import { Button } from '@/components/ui/button';
import { CaptureDialog, type CaptureMode } from '@/components/capture-dialog';
import { SwitchConfirmDialog } from '@/components/switch-confirm-dialog';
import { TargetCard } from '@/components/target-card';
import { errorMessage } from '@/lib/api';
import { useAccounts } from '@/lib/queries';

type DialogState =
  | { kind: 'switch'; target: TargetId; account: AccountDto }
  | { kind: 'capture'; target: TargetId; mode: CaptureMode }
  | null;

export function AccountsPage() {
  const accounts = useAccounts();
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = (open: boolean) => !open && setDialog(null);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-lg font-semibold">Accounts</h1>
        <p className="text-xs text-muted-foreground">Refreshes when you return to this tab.</p>
      </div>

      {accounts.isPending && <p className="text-sm text-muted-foreground" role="status">Loading accounts…</p>}

      {accounts.isError && (
        <div role="alert" className="flex items-center gap-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          <span className="flex-1">Could not load accounts: {errorMessage(accounts.error)}</span>
          <Button size="sm" variant="outline" onClick={() => void accounts.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {accounts.data && (
        <div className="grid gap-4 xl:grid-cols-2">
          {accounts.data.targets.map((t) => (
            <TargetCard
              key={t.target}
              target={t}
              onSwitch={(account) => setDialog({ kind: 'switch', target: t.target, account })}
              onCapture={() => setDialog({ kind: 'capture', target: t.target, mode: 'capture' })}
              onAddEmpty={() => setDialog({ kind: 'capture', target: t.target, mode: 'empty' })}
            />
          ))}
        </div>
      )}

      {dialog?.kind === 'switch' && (
        <SwitchConfirmDialog open onOpenChange={close} target={dialog.target} account={dialog.account} />
      )}
      {dialog?.kind === 'capture' && (
        <CaptureDialog open onOpenChange={close} target={dialog.target} mode={dialog.mode} />
      )}
    </div>
  );
}
