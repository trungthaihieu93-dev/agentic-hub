import type { TargetInfo } from '@agentic-hub/shared';
import { cn } from '@/lib/utils';

/**
 * Neutral monogram for a provider. Decorative only: the provider and surface are
 * always spelled out next to it, and no brand art is used.
 */
export function ProviderMark({ info, className }: { info: TargetInfo; className?: string }) {
  const text = info.provider === 'Claude' ? 'Cl' : 'Cx';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-8 shrink-0 select-none items-center justify-center rounded-md border border-input bg-muted font-mono text-xs font-semibold text-muted-foreground',
        className,
      )}
    >
      {text}
    </span>
  );
}
