import { CheckCircle2, CircleAlert, CircleSlash, RotateCcw, Wrench, XCircle } from 'lucide-react';
import { TARGET_INFO, type AuditEntry } from '@agentic-hub/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAudit } from '@/lib/queries';

const OUTCOME: Record<
  AuditEntry['outcome'],
  { text: string; variant: 'success' | 'warning' | 'danger' | 'secondary'; Icon: typeof CheckCircle2 }
> = {
  ok: { text: 'OK', variant: 'success', Icon: CheckCircle2 },
  refused: { text: 'Refused', variant: 'warning', Icon: CircleSlash },
  rolled_back: { text: 'Rolled back', variant: 'warning', Icon: RotateCcw },
  recovered: { text: 'Recovered', variant: 'secondary', Icon: Wrench },
  failed: { text: 'Failed', variant: 'danger', Icon: XCircle },
};

export function AuditPage() {
  const audit = useAudit();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Audit log</h1>

      {audit.isPending && <p className="text-sm text-muted-foreground" role="status">Loading audit log…</p>}

      {audit.isError && (
        <div role="alert" className="flex items-center gap-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          <CircleAlert className="size-4 text-danger" aria-hidden="true" />
          <span className="flex-1">Could not load the audit log: {errorMessage(audit.error)}</span>
          <Button size="sm" variant="outline" onClick={() => void audit.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {audit.data && (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableCaption className="mb-3">The last 50 switch attempts, newest first.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>From → To</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    No switches yet.
                  </TableCell>
                </TableRow>
              ) : (
                audit.data.map((e) => {
                  const o = OUTCOME[e.outcome];
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{TARGET_INFO[e.target].displayName}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {e.fromLabel ?? <span className="text-muted-foreground">none</span>}
                        <span aria-label=" to " className="px-1.5 text-muted-foreground">
                          →
                        </span>
                        {e.toLabel ?? <span className="text-muted-foreground">none</span>}
                      </TableCell>
                      <TableCell className="capitalize">{e.actor}</TableCell>
                      <TableCell>
                        <Badge variant={o.variant}>
                          <o.Icon aria-hidden="true" />
                          {o.text}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md text-muted-foreground">{e.message ?? ''}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
