import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queries';

function loginErrorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 401) return 'Wrong password. Try again.';
  return errorMessage(err);
}

export function LoginPage() {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();

  const login = useMutation({
    mutationFn: (pw: string) => api.login(pw),
    onSuccess: () => {
      setPassword('');
      qc.setQueryData(queryKeys.me, { authenticated: true });
    },
    onError: (err) => {
      setError(loginErrorText(err));
      // Back to the field so the user can retype straight away.
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Enter the admin password.');
      inputRef.current?.focus();
      return;
    }
    setError(null);
    login.mutate(password);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <ThemeToggle />
      <form
        onSubmit={onSubmit}
        noValidate
        aria-labelledby="login-title"
        className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-6"
      >
        <div className="space-y-1">
          <h1 id="login-title" className="text-lg font-semibold">
            Sign in to ah
          </h1>
          <p className="text-sm text-muted-foreground">Local Claude and Codex account switcher.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={inputId}>Admin password</Label>
          <Input
            ref={inputRef}
            id={inputId}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          {error && (
            <p id={errorId} role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </main>
  );
}
