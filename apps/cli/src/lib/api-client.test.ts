import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from './api-client.js';

describe('ApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('omits JSON content-type for heartbeat requests without a body', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, expiresAt: '2026-01-01T00:00:00.000Z' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('http://localhost:8080');
    await client.heartbeat('runtime-token', 'tunnel-id');

    const requestInit = ((fetchMock.mock.calls as unknown) as Array<[string, RequestInit | undefined]>)[0]?.[1];
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.body).toBeUndefined();
    expect(requestInit?.headers).toMatchObject({
      Authorization: 'Bearer runtime-token',
    });
    expect(requestInit?.headers).not.toMatchObject({
      'Content-Type': 'application/json',
    });
  });

  it('sends JSON content-type when a body is present', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          tunnelId: '11111111-1111-1111-1111-111111111111',
          hostname: 'demo.tunnel.example.com',
          cloudflaredToken: 'cf-token',
          tunnelRunToken: 'runtime-token',
          heartbeatIntervalSec: 20,
          leaseTimeoutSec: 60,
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('http://localhost:8080');
    await client.createTunnel('access-token', { port: 3000, requestedSlug: 'demo' });

    const requestInit = ((fetchMock.mock.calls as unknown) as Array<[string, RequestInit | undefined]>)[0]?.[1];
    expect(requestInit?.headers).toMatchObject({
      Authorization: 'Bearer access-token',
      'Content-Type': 'application/json',
    });
    expect(requestInit?.body).toBe(JSON.stringify({ port: 3000, requestedSlug: 'demo' }));
  });
});
