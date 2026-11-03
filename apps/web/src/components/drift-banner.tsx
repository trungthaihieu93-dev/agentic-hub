import { AlertTriangle } from 'lucide-react';
import type { AccountDto, LiveDto } from '@agentic-hub/shared';
import { Button } from '@/components/ui/button';

interface DriftBannerProps {
  active: AccountDto | null;
  live: LiveDto | null;
  onCaptureAs: () => void;
  onSwitchBack: () => void;
}

/** Shown when the watcher saw the live login stop matching the active account. */
export function DriftBanner({ active, live, onCaptureAs, onSwitchBack }: DriftBannerProps) {
  const liveText = live?.loggedIn ? live.email ?? 'an unknown account' : 'nobody (logged out)';
  return (
    <div role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <p>
            <span className="font-semibold">Login drift: </span>
            the live login is now {liveText}
            {active ? `, not the active account "${active.label}"` : ''}. A running session may have written
            another account back.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={onCaptureAs}>
              Capture as…
            </Button>
            {active && (
              <Button size="sm" variant="outline" onClick={onSwitchBack}>
                Switch back to {active.label}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
