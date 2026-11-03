import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import type { AccountDto } from '@agentic-hub/shared';
import type { UiTarget } from '@/lib/api';

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Stubs global fetch with a handler and returns the mock for assertions. */
export function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init ?? {})));
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function renderWithClient(ui: ReactElement): RenderResult & { client: QueryClient } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

export const workAccount: AccountDto = {
  id: '11111111-1111-4111-8111-111111111111',
  target: 'claude-cli',
  label: 'work',
  email: 'me@work.example',
  orgName: 'Work Org',
  capturedAt: '2026-11-03T08:00:00.000Z',
  isActive: true,
};

export const personalAccount: AccountDto = {
  ...workAccount,
  id: '22222222-2222-4222-8222-222222222222',
  label: 'personal',
  email: 'me@home.example',
  orgName: null,
  isActive: false,
};

export function makeTarget(overrides: Partial<UiTarget> = {}): UiTarget {
  return {
    target: 'claude-cli',
    active: workAccount,
    live: { loggedIn: true, email: 'me@work.example', orgName: 'Work Org', checkedAt: '2026-11-03T08:05:00.000Z' },
    drift: false,
    accounts: [workAccount, personalAccount],
    unsaved: [],
    runningProcesses: [],
    enabled: true,
    ...overrides,
  };
}
