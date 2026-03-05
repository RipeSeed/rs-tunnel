import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createUpDashboard } from './up-dashboard.js';

type FakeTtyStdout = NodeJS.WriteStream & {
  writes: string[];
  columns: number;
  isTTY: true;
};

function createFakeTtyStdout(): FakeTtyStdout {
  const stream = new PassThrough();
  const writes: string[] = [];

  vi.spyOn(stream, 'write').mockImplementation(((chunk: string | Uint8Array): boolean => {
    writes.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    return true;
  }) as typeof stream.write);

  const stdout = stream as unknown as FakeTtyStdout;
  stdout.isTTY = true;
  stdout.columns = 100;
  stdout.writes = writes;

  return stdout;
}

describe('createUpDashboard', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not redraw unchanged tty frames', () => {
    vi.useFakeTimers();

    const stdout = createFakeTtyStdout();
    const dashboard = createUpDashboard({
      account: 'you@example.com',
      version: '0.1.2',
      forwarding: 'https://my-app.tunnel.example.com -> http://localhost:3000',
      verbose: false,
      stdout,
    });

    const initialWriteCount = stdout.writes.length;
    expect(initialWriteCount).toBeGreaterThan(0);

    vi.advanceTimersByTime(2_000);
    expect(stdout.writes.length).toBe(initialWriteCount);

    dashboard.addMessage('proxy connected');
    vi.advanceTimersByTime(300);
    expect(stdout.writes.length).toBeGreaterThan(initialWriteCount);

    dashboard.stop();
  });

  it('ignores empty cloudflared and info lines', () => {
    vi.useFakeTimers();

    const stdout = createFakeTtyStdout();
    const dashboard = createUpDashboard({
      account: 'you@example.com',
      version: '0.1.2',
      forwarding: 'https://my-app.tunnel.example.com -> http://localhost:3000',
      verbose: true,
      stdout,
    });

    const initialWriteCount = stdout.writes.length;

    dashboard.addCloudflaredLine('   ');
    dashboard.addMessage('   ');

    vi.advanceTimersByTime(600);
    expect(stdout.writes.length).toBe(initialWriteCount);

    dashboard.stop();
  });
});
