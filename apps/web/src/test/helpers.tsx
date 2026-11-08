import type { ReactElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import type { AccountDto } from '@agentic-hub/shared';
import type { UiTarget } from '@/lib/api';

const themeBootstrap = readFileSync(resolve(import.meta.dirname, '../../public/theme-init.js'), 'utf8');

/** Run the shipped controller, rather than a test-only theme implementation. */
export function initializeTheme(): void {
  runInNewContext(themeBootstrap, { window, document });
}

/** Match the layout's real breakpoint while allowing a test to cross it. */
export function mockViewport(initialWidth: number) {
  let width = initialWidth;
  const queries = new Map<string, { media: MediaQueryList; listeners: Set<(event: MediaQueryListEvent) => void> }>();
  const matches = (query: string) => {
    const minimum = /min-width:\s*(\d+)px/.exec(query);
    return minimum ? width >= Number(minimum[1]) : false;
  };
  vi.stubGlobal('innerWidth', width);
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const existing = queries.get(query);
    if (existing) return existing.media;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const media = {
      get matches() { return matches(query); },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
      addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
      dispatchEvent: () => false,
    } as MediaQueryList;
    queries.set(query, { media, listeners });
    return media;
  });
  return {
    resize(nextWidth: number) {
      const previous = new Map([...queries].map(([query]) => [query, matches(query)]));
      width = nextWidth;
      vi.stubGlobal('innerWidth', width);
      queries.forEach(({ media, listeners }, query) => {
        if (media.matches !== previous.get(query)) {
          const event = { matches: media.matches, media: query } as MediaQueryListEvent;
          listeners.forEach((listener) => listener(event));
        }
      });
      window.dispatchEvent(new Event('resize'));
    },
  };
}

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
