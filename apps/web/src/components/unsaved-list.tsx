import { useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import type { TargetId, VersionDto } from '@agentic-hub/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useDeleteUnsaved } from '@/lib/queries';

/** Snapshots of outgoing logins whose owner was unknown, kept so nothing is lost. */
export function UnsavedList({ target, versions }: { target: TargetId; versions: VersionDto[] }) {
  const [pendingDelete, setPendingDelete] = useState<VersionDto | null>(null);
  const del = useDeleteUnsaved();

  if (versions.length === 0) return null;

  const handleDelete = () => {
    if (!pendingDelete) return;
    const { version } = pendingDelete;
    del.mutate(
      { target, version },
      {
        onSuccess: () => {
          toast.success('Deleted unsaved snapshot');
          setPendingDelete(null);
        },
        onError: (err) => toast.error('Could not delete the snapshot', { description: errorMessage(err) }),
      },
    );
  };

  return (
    <section aria-label="Unsaved snapshots" className="space-y-1.5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unsaved snapshots</h3>
      <p className="text-xs text-muted-foreground">
        Logins replaced by a switch that did not match any saved account.
      </p>
      <ul className="divide-y rounded-md border">
        {versions.map((v) => (
          <li key={v.version} className="flex items-center gap-3 px-3 py-1.5">
            <code className="min-w-0 flex-1 truncate text-xs">{v.version}</code>
            <span className="text-xs text-muted-foreground">{formatDateTime(v.capturedAt)}</span>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={`Delete unsaved snapshot ${v.version}`}
              onClick={() => setPendingDelete(v)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete unsaved snapshot?"
        description="These tokens belong to no saved account. Once deleted, that login can only come back by signing in again."
        confirmLabel="Delete snapshot"
        pending={del.isPending}
        onConfirm={handleDelete}
      />
    </section>
  );
}
