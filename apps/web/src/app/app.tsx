import { useEffect, useState } from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { errorMessage, isUnauthorized } from '@/lib/api';
import { queryKeys, useMe } from '@/lib/queries';
import { AccountsPage } from '@/pages/accounts-page';
import { AuditPage } from '@/pages/audit-page';
import { LoginPage } from '@/pages/login-page';
import { Layout } from './layout';
import { navigate, usePathname, type RoutePath } from './router';

/**
 * Any 401 marks the session as signed out, which sends the router to /login.
 * Data is refetched on window focus and after mutations, never on an interval.
 */
export function createQueryClient(): QueryClient {
  const onError = (err: unknown) => {
    if (isUnauthorized(err)) client.setQueryData(queryKeys.me, { authenticated: false });
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: true,
        refetchInterval: false,
        staleTime: 5_000,
        retry: (count, err) => !isUnauthorized(err) && count < 2,
      },
      mutations: { retry: false },
    },
  });
  return client;
}

function Routes() {
  const pathname = usePathname();
  const me = useMe();
  const authenticated = me.data?.authenticated === true;
  const signedOut = me.data?.authenticated === false || isUnauthorized(me.error);

  let route: RoutePath | null = null;
  if (authenticated) route = pathname === '/audit' ? '/audit' : '/';
  else if (signedOut) route = '/login';

  useEffect(() => {
    if (route && pathname !== route) navigate(route, { replace: true });
  }, [route, pathname]);

  if (route === '/login') return <LoginPage />;
  if (route === '/') return <Layout><AccountsPage /></Layout>;
  if (route === '/audit') return <Layout><AuditPage /></Layout>;

  if (me.isError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-sm">
        <p role="alert">Could not reach the ah server: {errorMessage(me.error)}</p>
        <Button variant="outline" onClick={() => void me.refetch()}>
          Retry
        </Button>
      </main>
    );
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-4 text-sm text-muted-foreground">
      <p role="status">Loading…</p>
    </main>
  );
}

export function App({ client }: { client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <Routes />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
