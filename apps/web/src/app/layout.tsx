import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Link, navigate } from './router';

const navLink =
  'rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground';

export function Layout({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      toast.error('Could not sign out', { description: errorMessage(err) });
      return;
    }
    qc.clear();
    qc.setQueryData(queryKeys.me, { authenticated: false });
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50"
      >
        Skip to content
      </a>
      <header className="border-b bg-card/60">
        <div className="mx-auto flex h-12 max-w-7xl items-center gap-4 px-4">
          <span className="font-mono text-sm font-semibold">ah</span>
          <nav aria-label="Main" className="flex gap-1">
            <Link to="/" className={cn(navLink)}>
              Accounts
            </Link>
            <Link to="/audit" className={cn(navLink)}>
              Audit log
            </Link>
          </nav>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void logout()}>
            <LogOut aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 outline-none">
        {children}
      </main>
    </div>
  );
}
