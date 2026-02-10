import http, { type IncomingMessage } from 'node:http';
import net from 'node:net';

export type ProxyRequestEvent = {
  startedAtEpochMs: number;
  method: string;
  path: string;
  statusCode: number;
  statusMessage: string;
  durationMs: number;
  responseBytes: number | null;
  error: boolean;
  protocol: 'http' | 'ws';
};

export type ProxyConnectionSnapshot = {
  totalConnections: number;
  openConnections: number;
};

export type LocalProxy = {
  port: number;
  stop: () => Promise<void>;
};

type StartLocalProxyInput = {
  targetPort: number;
  targetHost?: string;
  onRequest?: (event: ProxyRequestEvent) => void;
  onConnectionChange?: (snapshot: ProxyConnectionSnapshot) => void;
};

function toDurationMs(startedAtHrTimeNs: bigint): number {
  return Number(process.hrtime.bigint() - startedAtHrTimeNs) / 1_000_000;
}

function getStatusText(statusCode: number): string {
  return http.STATUS_CODES[statusCode] ?? 'Unknown';
}

function emitConnectionSnapshot(
  onConnectionChange: StartLocalProxyInput['onConnectionChange'],
  totalConnections: number,
  openConnections: number,
): void {
  onConnectionChange?.({
    totalConnections,
    openConnections,
  });
}

function buildUpgradeRequest(req: IncomingMessage): string {
  const requestLine = `${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/${req.httpVersion}`;
  let headers = '';

  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const headerName = req.rawHeaders[i];
    const headerValue = req.rawHeaders[i + 1];

    if (!headerName || headerValue === undefined) {
      continue;
    }

    headers += `${headerName}: ${headerValue}\r\n`;
  }

  return `${requestLine}\r\n${headers}\r\n`;
}

export async function startLocalProxy(input: StartLocalProxyInput): Promise<LocalProxy> {
  const targetHost = input.targetHost ?? '127.0.0.1';

  let totalConnections = 0;
  let openConnections = 0;
  const sockets = new Set<net.Socket>();

  const server = http.createServer((req, res) => {
    const startedAtEpochMs = Date.now();
    const startedAtHrTimeNs = process.hrtime.bigint();
    const method = req.method ?? 'GET';
    const path = req.url ?? '/';

    let responseBytes = 0;
    let finalized = false;
    let statusCode = 500;

    const finalize = (event: { statusCode?: number; responseBytes?: number | null; error?: boolean }): void => {
      if (finalized) {
        return;
      }

      finalized = true;
      const finalStatusCode = event.statusCode ?? statusCode;
      const responseBytesValue = event.responseBytes ?? responseBytes;

      input.onRequest?.({
        startedAtEpochMs,
        method,
        path,
        statusCode: finalStatusCode,
        statusMessage: getStatusText(finalStatusCode),
        durationMs: toDurationMs(startedAtHrTimeNs),
        responseBytes: responseBytesValue,
        error: event.error ?? finalStatusCode >= 500,
        protocol: 'http',
      });
    };

    const upstream = http.request(
      {
        host: targetHost,
        port: input.targetPort,
        method,
        path,
        headers: req.headers,
      },
      (upstreamResponse) => {
        statusCode = upstreamResponse.statusCode ?? 502;

        res.writeHead(statusCode, upstreamResponse.statusMessage, upstreamResponse.headers);
        upstreamResponse.on('data', (chunk: Buffer | string) => {
          responseBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        });

        upstreamResponse.pipe(res);
      },
    );

    upstream.on('error', () => {
      statusCode = 502;
      if (!res.headersSent) {
        res.writeHead(statusCode, getStatusText(statusCode));
      }

      res.end('Bad Gateway');
      finalize({
        statusCode,
        error: true,
      });
    });

    req.pipe(upstream);

    res.once('finish', () => {
      finalize({
        statusCode: res.statusCode,
        error: res.statusCode >= 500,
      });
    });

    res.once('close', () => {
      if (!finalized) {
        finalize({
          statusCode: res.statusCode || statusCode,
          error: true,
        });
      }
    });
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    totalConnections += 1;
    openConnections += 1;

    emitConnectionSnapshot(input.onConnectionChange, totalConnections, openConnections);

    socket.on('close', () => {
      sockets.delete(socket);
      openConnections = Math.max(0, openConnections - 1);
      emitConnectionSnapshot(input.onConnectionChange, totalConnections, openConnections);
    });
  });

  server.on('upgrade', (req, clientSocket, head) => {
    const startedAtEpochMs = Date.now();
    const startedAtHrTimeNs = process.hrtime.bigint();
    const method = req.method ?? 'GET';
    const path = req.url ?? '/';

    const upstreamSocket = net.connect({
      host: targetHost,
      port: input.targetPort,
    });

    let finalized = false;
    const finalize = (statusCode: number, isError: boolean): void => {
      if (finalized) {
        return;
      }

      finalized = true;
      input.onRequest?.({
        startedAtEpochMs,
        method,
        path,
        statusCode,
        statusMessage: getStatusText(statusCode),
        durationMs: toDurationMs(startedAtHrTimeNs),
        responseBytes: null,
        error: isError,
        protocol: 'ws',
      });
    };

    upstreamSocket.once('connect', () => {
      upstreamSocket.write(buildUpgradeRequest(req));
      if (head.length > 0) {
        upstreamSocket.write(head);
      }

      clientSocket.pipe(upstreamSocket);
      upstreamSocket.pipe(clientSocket);
      finalize(101, false);
    });

    upstreamSocket.once('error', () => {
      if (!clientSocket.destroyed) {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      }

      clientSocket.destroy();
      finalize(502, true);
    });

    clientSocket.once('error', () => {
      upstreamSocket.destroy();
      finalize(499, true);
    });

    clientSocket.once('close', () => {
      upstreamSocket.destroy();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    throw new Error('Local proxy failed to bind to a TCP port.');
  }

  let stopped = false;

  return {
    port: address.port,
    stop: async (): Promise<void> => {
      if (stopped) {
        return;
      }

      stopped = true;

      for (const socket of sockets) {
        socket.destroy();
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}
