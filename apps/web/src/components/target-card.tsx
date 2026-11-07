import { Activity, Info, Plus, Save } from 'lucide-react';
import { TARGET_INFO, type AccountDto } from '@agentic-hub/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountRow } from '@/components/account-row';
import { DriftBanner } from '@/components/drift-banner';
import { ProviderMark } from '@/components/provider-mark';
import { UnsavedList } from '@/components/unsaved-list';
import type { UiTarget } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

interface TargetCardProps {
  target: UiTarget;
  onSwitch: (account: AccountDto) => void;
  onCapture: () => void;
  onAddEmpty: () => void;
}

export function TargetCard({ target, onSwitch, onCapture, onAddEmpty }: TargetCardProps) {
  const info = TARGET_INFO[target.target];
  const isDesktop = info.kind === 'desktop';
  const enabled = target.enabled !== false;
  const titleId = `target-${target.target}-title`;

  return (
    <Card aria-labelledby={titleId} className={cn('min-w-0', !enabled && 'opacity-80')} role="region">
      <CardHeader>
        <ProviderMark info={info} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle id={titleId}>{info.displayName}</CardTitle>
            <Badge variant="outline">{isDesktop ? 'Desktop app' : 'CLI'}</Badge>
            {!enabled && <Badge variant="secondary">Unavailable</Badge>}
          </div>
          <CardDescription>
            {info.provider} · {target.accounts.length} saved {target.accounts.length === 1 ? 'account' : 'accounts'}
          </CardDescription>
        </div>
      </CardHeader>

      {!enabled ? (
        <CardContent>
          <p className="flex items-start gap-2 rounded-md border bg-muted p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {target.disabledReason ?? 'This target is not available on this machine.'}
          </p>
        </CardContent>
      ) : (
        <>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm [overflow-wrap:anywhere]">
              <dt className="text-muted-foreground">Active</dt>
              <dd className="min-w-0">
                {target.active ? (
                  <>
                    <span className="font-medium">{target.active.label}</span>
                    <IdentityText email={target.active.email} org={target.active.orgName} />
                  </>
                ) : (
                  <span className="text-muted-foreground">No saved account is active</span>
                )}
              </dd>
              <dt className="text-muted-foreground">Live login</dt>
              <dd className="min-w-0">
                {!target.live ? (
                  <span className="text-muted-foreground">Not checked yet</span>
                ) : target.live.loggedIn ? (
                  <>
                    <span>{target.live.email ?? 'Signed in (unknown email)'}</span>
                    <IdentityText org={target.live.orgName} />
                    <span className="ml-2 text-xs text-muted-foreground">
                      checked {formatRelative(target.live.checkedAt)}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Not logged in</span>
                )}
              </dd>
            </dl>

            {target.drift && (
              <DriftBanner
                active={target.active}
                live={target.live}
                onCaptureAs={onCapture}
                onSwitchBack={() => target.active && onSwitch(target.active)}
              />
            )}

            {target.runningProcesses.length > 0 && (
              <section aria-label="Running processes" className="flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Activity className="size-3.5" aria-hidden="true" />
                  Running:
                </span>
                {target.runningProcesses.map((p) => (
                  <Badge key={p.pid} variant="warning" title={p.cmdline}>
                    {p.name} <span className="font-normal">pid {p.pid}</span>
                  </Badge>
                ))}
              </section>
            )}

            <section aria-label="Saved accounts" className="space-y-1.5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Saved accounts</h3>
              {target.accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet. Capture the current login to start.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {target.accounts.map((a) => (
                    <AccountRow key={a.id} account={a} onSwitch={onSwitch} />
                  ))}
                </ul>
              )}
            </section>

            <UnsavedList target={target.target} versions={target.unsaved} />

            <section aria-label="Add another account" className="space-y-1 text-xs text-muted-foreground">
              <h3 className="font-medium uppercase tracking-wide">Add another account</h3>
              {isDesktop ? (
                <p>
                  Use <span className="text-foreground">Add empty account</span>, switch to it, then sign in inside{' '}
                  {info.displayName}. Capture it again afterwards if you sign in to a different account.
                </p>
              ) : (
                <p>
                  Run{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{info.loginHint}</code> in a
                  terminal, then use <span className="text-foreground">Capture current login</span>.
                </p>
              )}
            </section>

            {isDesktop && (
              <p className="flex items-start gap-2 rounded-md border bg-muted/50 p-2.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Sessions and worktrees belong to each account. The MCP config is shared across all accounts
                  {target.sharedFiles && target.sharedFiles.length > 0 ? (
                    <>
                      {' '}
                      (
                      {target.sharedFiles.map((f, i) => (
                        <span key={f}>
                          {i > 0 && ', '}
                          <code>{f}</code>
                        </span>
                      ))}
                      )
                    </>
                  ) : null}
                  .
                </span>
              </p>
            )}
          </CardContent>
          <CardFooter className="mt-auto flex-wrap gap-2">
            <Button size="sm" onClick={onCapture}>
              <Save aria-hidden="true" />
              Capture current login
            </Button>
            {isDesktop && (
              <Button size="sm" variant="outline" onClick={onAddEmpty}>
                <Plus aria-hidden="true" />
                Add empty account
              </Button>
            )}
          </CardFooter>
        </>
      )}
    </Card>
  );
}

function IdentityText({ email, org }: { email?: string | null; org?: string | null }) {
  const text = [email, org].filter(Boolean).join(' · ');
  if (!text) return null;
  return <span className="ml-2 text-muted-foreground">{text}</span>;
}
