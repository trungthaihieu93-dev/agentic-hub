import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { toast } from 'sonner';
import { Menu, X } from 'lucide-react';
import { SidebarContent } from '@/components/sidebar-content';
import { Button } from '@/components/ui/button';
import { DialogOverlay } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queries';
import { navigate, usePathname } from './router';

export function Layout({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  const [signingOut, setSigningOut] = useState(false);
  const logoutPending = useRef(false);
  const closeDestination = useRef<'trigger' | 'main'>('trigger');
  const menuRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    closeDestination.current = 'main';
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 1024px)');
    const update = () => {
      const desktop = media?.matches ?? window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (desktop) {
        closeDestination.current = 'main';
        setDrawerOpen(false);
      }
    };
    update();
    if (media) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const onDrawerNavigate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    closeDestination.current = 'main';
    setDrawerOpen(false);
  };

  const logout = async () => {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setSigningOut(true);
    try {
      await api.logout();
    } catch (err) {
      toast.error('Could not sign out', { description: errorMessage(err) });
      logoutPending.current = false;
      setSigningOut(false);
      return;
    }
    qc.clear();
    qc.setQueryData(queryKeys.me, { authenticated: false });
    navigate('/login', { replace: true });
  };

  return (
    <DialogPrimitive.Root
      open={drawerOpen}
      onOpenChange={(open) => {
        if (open) closeDestination.current = 'trigger';
        setDrawerOpen(open);
      }}
    >
      <div className="min-h-screen lg:flex">
        <a
          href="#main"
          className="sr-only rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50"
        >
          Skip to content
        </a>
        <aside
          aria-label="Dashboard sidebar"
          aria-hidden={!isDesktop}
          inert={!isDesktop}
          className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r bg-card lg:flex"
        >
          <SidebarContent onLogout={() => void logout()} signingOut={signingOut} />
        </aside>
        <div className="min-w-0 flex-1">
          <header
            aria-hidden={isDesktop}
            inert={isDesktop}
            className="flex h-12 items-center gap-3 border-b bg-card px-4 lg:hidden"
          >
            <DialogPrimitive.Trigger asChild>
              <Button ref={menuRef} variant="ghost" size="sm" className="h-11" aria-label="Open navigation menu">
                <Menu aria-hidden="true" />
                Menu
              </Button>
            </DialogPrimitive.Trigger>
            <span className="font-mono text-sm font-semibold">ah</span>
          </header>
          <main ref={mainRef} id="main" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 outline-none">
            {children}
          </main>
        </div>
      </div>
      <DialogPrimitive.Portal>
        <DialogOverlay className="lg:hidden" />
        <DialogPrimitive.Content
          ref={drawerRef}
          className="fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[calc(100vw-2rem)] flex-col border-r bg-card text-card-foreground shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left duration-150 lg:hidden"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const current = drawerRef.current?.querySelector<HTMLAnchorElement>('nav a[aria-current="page"]');
            (current ?? drawerRef.current?.querySelector<HTMLAnchorElement>('nav a'))?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!mainRef.current?.isConnected) return;
            if (closeDestination.current === 'main' || isDesktop) {
              requestAnimationFrame(() => {
                if (mainRef.current?.isConnected) mainRef.current.focus();
              });
            } else {
              menuRef.current?.focus();
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">Main navigation</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Navigate the dashboard and manage your local session.
          </DialogPrimitive.Description>
          <SidebarContent
            onNavigate={onDrawerNavigate}
            onLogout={() => void logout()}
            signingOut={signingOut}
          />
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon" className="absolute right-2 top-2 size-11" aria-label="Close navigation menu">
              <X aria-hidden="true" />
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
