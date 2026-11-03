import { useId, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Ban } from 'lucide-react';
import { TARGET_INFO, type AccountDto, type SwitchResult, type TargetId } from '@agentic-hub/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { errorMessage } from '@/lib/api';
import { useSwitch } from '@/lib/queries';

interface SwitchConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: TargetId;
  account: AccountDto;
}

/** Shows the toast for a switch that the server answered with HTTP 200. */
function reportResult(appName: string, label: string, result: SwitchResult) {
  const extra = result.unsavedVersion
    ? ` The previous login matched no saved account and was kept as unsaved snapshot ${result.unsavedVersion}.`
    : '';
  const description = `${result.message}${extra}`;
  switch (result.outcome) {
    case 'ok':
      toast.success(`${appName} switched to "${label}"`, { description });
      break;
    case 'refused':
      toast.warning(`Switch refused`, { description });
      break;
    case 'rolled_back':
      toast.error(`Switch rolled back; ${appName} is unchanged`, { description });
      break;
    case 'failed':
      toast.error(`Switch failed`, { description });
      break;
  }
}

export function SwitchConfirmDialog({ open, onOpenChange, target, account }: SwitchConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <SwitchFlow target={target} account={account} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

type Stage = { kind: 'confirm' } | { kind: 'needsForce'; result: SwitchResult } | { kind: 'appRunning'; result: SwitchResult };

function SwitchFlow({ target, account, onDone }: { target: TargetId; account: AccountDto; onDone: () => void }) {
  const info = TARGET_INFO[target];
  const isDesktop = info.kind === 'desktop';
  const [stage, setStage] = useState<Stage>({ kind: 'confirm' });
  const [relaunch, setRelaunch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const relaunchId = useId();
  const sw = useSwitch();

  const run = (force: boolean) => {
    setError(null);
    sw.mutate(
      { target, accountId: account.id, force: force || undefined, relaunch: isDesktop && relaunch ? true : undefined },
      {
        onSuccess: ({ status, result }) => {
          if (status === 409) setStage({ kind: 'needsForce', result });
          else if (status === 423) setStage({ kind: 'appRunning', result });
          else {
            reportResult(info.displayName, account.label, result);
            onDone();
          }
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Switch {info.displayName}</DialogTitle>
        <DialogDescription>
          Switch {info.displayName} to <span className="font-medium text-foreground">{account.label}</span>
          {account.email ? ` (${account.email})` : ''}. The current login is saved first.
        </DialogDescription>
      </DialogHeader>

      {stage.kind === 'needsForce' && (
        <div role="alert" className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
            {info.displayName} sessions are running
          </p>
          <ProcessList result={stage.result} />
          <p className="text-sm">
            A forced switch can make running sessions write the old account back and may require a re-login.
          </p>
        </div>
      )}

      {stage.kind === 'appRunning' && (
        <div role="alert" className="space-y-2 rounded-md border border-danger/40 bg-danger/10 p-3">
          <p className="flex items-center gap-2 font-medium">
            <Ban className="size-4 text-danger" aria-hidden="true" />
            Quit {info.displayName} first.
          </p>
          <p className="text-sm text-muted-foreground">
            The app's profile cannot be swapped while it runs. Close it, then try again.
          </p>
          <ProcessList result={stage.result} />
        </div>
      )}

      {isDesktop && stage.kind !== 'needsForce' && (
        <div className="flex items-center gap-2">
          <input
            id={relaunchId}
            type="checkbox"
            checked={relaunch}
            onChange={(e) => setRelaunch(e.target.checked)}
            className="size-4 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <label htmlFor={relaunchId} className="cursor-pointer text-sm">
            Relaunch {info.displayName} after switching
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={sw.isPending}>
          Cancel
        </Button>
        {stage.kind === 'needsForce' ? (
          <Button variant="destructive" onClick={() => run(true)} disabled={sw.isPending}>
            {sw.isPending ? 'Switching…' : 'Switch anyway'}
          </Button>
        ) : (
          <Button onClick={() => run(false)} disabled={sw.isPending}>
            {sw.isPending ? 'Switching…' : stage.kind === 'appRunning' ? 'Try again' : 'Switch'}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

function ProcessList({ result }: { result: SwitchResult }) {
  if (result.warnings.length === 0) {
    return result.message ? <p className="text-sm text-muted-foreground">{result.message}</p> : null;
  }
  return (
    <ul aria-label="Running processes" className="space-y-1">
      {result.warnings.map((p) => (
        <li key={p.pid} className="flex gap-2 text-xs">
          <span className="font-medium">{p.name}</span>
          <span className="text-muted-foreground">pid {p.pid}</span>
          <code className="min-w-0 flex-1 truncate text-muted-foreground" title={p.cmdline}>
            {p.cmdline}
          </code>
        </li>
      ))}
    </ul>
  );
}
