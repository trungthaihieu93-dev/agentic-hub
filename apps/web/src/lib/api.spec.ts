import { describe, expect, it } from 'vitest';
import { api, ApiError } from './api';
import { jsonResponse, mockFetch } from '@/test/helpers';

function headersOf(init: RequestInit): Headers {
  return new Headers(init.headers);
}

describe('api client', () => {
  it('sends X-AH-Request and same-origin credentials on every request', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ authenticated: true }));
    await api.me();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/me');
    expect(headersOf(init).get('X-AH-Request')).toBe('1');
    expect(init.credentials).toBe('same-origin');
  });

  it('sends JSON bodies with a JSON content type', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ ok: true }));
    await api.login('secret');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(headersOf(init).get('Content-Type')).toBe('application/json');
    expect(headersOf(init).get('X-AH-Request')).toBe('1');
    expect(JSON.parse(String(init.body))).toEqual({ password: 'secret' });
  });

  it('turns an error body into an ApiError with status and message', async () => {
    mockFetch(() => jsonResponse({ error: 'unauthorized', message: 'Wrong password' }, 401));
    const err = await api.login('nope').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: 'unauthorized', message: 'Wrong password' });
  });

  it('returns 409 and 423 switch results instead of throwing', async () => {
    const result = { outcome: 'refused', warnings: [], message: 'busy', needsForce: true, appRunning: false };
    mockFetch(() => jsonResponse(result, 409));
    await expect(
      api.switchAccount({ target: 'claude-cli', accountId: '22222222-2222-4222-8222-222222222222' }),
    ).resolves.toEqual({ status: 409, result });
  });

  it('keeps the server-only target fields', async () => {
    mockFetch(() =>
      jsonResponse({
        targets: [
          {
            target: 'codex-desktop',
            active: null,
            live: null,
            drift: false,
            accounts: [],
            unsaved: [],
            runningProcesses: [],
            enabled: false,
            disabledReason: 'Codex desktop is not installed',
          },
        ],
      }),
    );
    const res = await api.accounts();
    expect(res.targets[0]).toMatchObject({ enabled: false, disabledReason: 'Codex desktop is not installed' });
  });

  it('reports a network failure as an ApiError', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(api.me()).rejects.toMatchObject({ status: 0, code: 'network' });
  });
});
