import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/** The three dashboard routes. The server falls back to index.html for unknown paths. */
export type RoutePath = '/' | '/login' | '/audit';

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

function getPath(): string {
  return window.location.pathname;
}

export function navigate(to: RoutePath, opts: { replace?: boolean } = {}): void {
  if (window.location.pathname === to) return;
  if (opts.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  listeners.forEach((l) => l());
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, getPath, () => '/');
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: RoutePath };

/** Client-side link; modified clicks (new tab, etc.) keep the browser default. */
export function Link({ to, onClick, children, ...props }: LinkProps) {
  const pathname = usePathname();
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} aria-current={pathname === to ? 'page' : undefined} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
