import http from 'node:http';
import net from 'node:net';

import { describe, expect, it } from 'vitest';

import { startLocalProxy, type ProxyConnectionSnapshot, type ProxyRequestEvent } from './local-proxy.js';

async function listenHttpServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(handler);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error('Failed to bind HTTP server.');
  }

  return {
    server,
    port: address.port,
  };
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

async function reserveUnusedPort(): Promise<number> {
  const reservation = net.createServer();

  await new Promise<void>((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', () => {
      reservation.off('error', reject);
      resolve();
    });
  });

  const address = reservation.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    throw new Error('Failed to reserve port.');
  }

  const port = address.port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  return port;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('startLocalProxy', () => {
  it('forwards HTTP requests, emits request events, and tracks connections', async () => {
    const requestEvents: ProxyRequestEvent[] = [];
    const connectionEvents: ProxyConnectionSnapshot[] = [];

    const backend = await listenHttpServer((req, res) => {
      if (req.url === '/ok') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
        return;
      }

      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    });

    const proxy = await startLocalProxy({
      targetPort: backend.port,
      onRequest: (event) => requestEvents.push(event),
      onConnectionChange: (snapshot) => connectionEvents.push(snapshot),
    });

    try {
      const okResponse = await fetch(`http://127.0.0.1:${proxy.port}/ok`, {
        headers: {
          connection: 'close',
        },
      });
      const notFoundResponse = await fetch(`http://127.0.0.1:${proxy.port}/missing`, {
        headers: {
          connection: 'close',
        },
      });

      expect(okResponse.status).toBe(200);
      expect(await okResponse.text()).toBe('ok');

      expect(notFoundResponse.status).toBe(404);
      expect(await notFoundResponse.text()).toBe('not found');

      await wait(60);

      expect(requestEvents.length).toBe(2);
      expect(requestEvents[0]?.statusCode).toBe(200);
      expect(requestEvents[0]?.path).toBe('/ok');
      expect(requestEvents[1]?.statusCode).toBe(404);
      expect(requestEvents[1]?.path).toBe('/missing');

      const maxOpenConnections = Math.max(...connectionEvents.map((event) => event.openConnections));
      const finalOpenConnections = connectionEvents.at(-1)?.openConnections ?? -1;

      expect(maxOpenConnections).toBeGreaterThan(0);
      expect(finalOpenConnections).toBe(0);
      expect(connectionEvents.at(-1)?.totalConnections).toBeGreaterThanOrEqual(1);
    } finally {
      await proxy.stop();
      await closeServer(backend.server);
    }
  });

  it('returns 502 and emits error events when upstream target is unreachable', async () => {
    const requestEvents: ProxyRequestEvent[] = [];
    const unreachablePort = await reserveUnusedPort();

    const proxy = await startLocalProxy({
      targetPort: unreachablePort,
      onRequest: (event) => requestEvents.push(event),
    });

    try {
      const response = await fetch(`http://127.0.0.1:${proxy.port}/will-fail`, {
        headers: {
          connection: 'close',
        },
      });

      expect(response.status).toBe(502);
      expect(await response.text()).toContain('Bad Gateway');

      await wait(20);

      expect(requestEvents).toHaveLength(1);
      expect(requestEvents[0]?.statusCode).toBe(502);
      expect(requestEvents[0]?.error).toBe(true);
    } finally {
      await proxy.stop();
    }
  });

  it('forwards websocket upgrades', async () => {
    const backendServer = http.createServer((_, res) => {
      res.writeHead(426);
      res.end('upgrade required');
    });

    backendServer.on('upgrade', (_req, socket) => {
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          '\r\n',
      );
      socket.end();
    });

    await new Promise<void>((resolve, reject) => {
      backendServer.once('error', reject);
      backendServer.listen(0, '127.0.0.1', () => {
        backendServer.off('error', reject);
        resolve();
      });
    });

    const backendAddress = backendServer.address();
    if (!backendAddress || typeof backendAddress === 'string') {
      await closeServer(backendServer);
      throw new Error('Backend server failed to bind.');
    }

    const proxy = await startLocalProxy({
      targetPort: backendAddress.port,
    });

    try {
      const rawResponse = await new Promise<string>((resolve, reject) => {
        const socket = net.connect({ host: '127.0.0.1', port: proxy.port });
        let data = '';

        socket.setEncoding('utf8');

        socket.once('connect', () => {
          socket.write(
            'GET /socket HTTP/1.1\r\n' +
              `Host: 127.0.0.1:${proxy.port}\r\n` +
              'Connection: Upgrade\r\n' +
              'Upgrade: websocket\r\n' +
              '\r\n',
          );
        });

        socket.on('data', (chunk: string) => {
          data += chunk;
          if (data.includes('\r\n\r\n')) {
            resolve(data);
            socket.end();
          }
        });

        socket.on('error', reject);
      });

      expect(rawResponse).toContain('101 Switching Protocols');
      expect(rawResponse).toContain('Upgrade: websocket');
    } finally {
      await proxy.stop();
      await closeServer(backendServer);
    }
  });
});
