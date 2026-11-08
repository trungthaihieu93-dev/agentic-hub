import type { MouseEvent } from 'react';
import { LogOut, ScrollText, UserRound, UsersRound } from 'lucide-react';
import { Link } from '@/app/router';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

const navLink =
  'flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground [&>svg]:size-4';

interface SidebarContentProps {
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onLogout: () => void;
  signingOut: boolean;
}

export function SidebarContent({ onNavigate, onLogout, signingOut }: SidebarContentProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="shrink-0 px-6 py-5 font-mono text-sm font-semibold">ah</div>
      <nav aria-label="Main" className="grid shrink-0 gap-1 px-3 pb-4">
        <Link to="/" onClick={onNavigate} className={navLink}>
          <UsersRound aria-hidden="true" />
          Accounts
        </Link>
        <Link to="/audit" onClick={onNavigate} className={navLink}>
          <ScrollText aria-hidden="true" />
          Audit log
        </Link>
      </nav>
      <section aria-label="Local session" className="mt-auto shrink-0 space-y-3 border-t p-3">
        <p className="flex items-center gap-2 px-3 text-sm font-medium">
          <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
          Local admin
        </p>
        <ThemeToggle />
        <Button variant="ghost" size="sm" className="h-11 w-full justify-start" onClick={onLogout} disabled={signingOut}>
          <LogOut aria-hidden="true" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </section>
    </div>
  );
}
