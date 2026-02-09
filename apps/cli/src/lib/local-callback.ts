import http from 'node:http';
import { URL } from 'node:url';

export type CallbackServer = {
  callbackUrl: string;
  waitForCode: () => Promise<{ code: string; state: string }>;
  close: () => Promise<void>;
};

export async function startCallbackServer(): Promise<CallbackServer> {
  let resolveHandler: ((value: { code: string; state: string }) => void) | undefined;
  let rejectHandler: ((reason?: unknown) => void) | undefined;

  const waitForCodePromise = new Promise<{ code: string; state: string }>((resolve, reject) => {
    resolveHandler = resolve;
    rejectHandler = reject;
  });

  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (requestUrl.pathname !== '/callback') {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');

    if (!code || !state) {
      res.statusCode = 400;
      res.end('Missing code or state');
      rejectHandler?.(new Error('OAuth callback missing code or state'));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Login complete. You can close this tab.');

    resolveHandler?.({ code, state });
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
    throw new Error('Unable to bind local callback server.');
  }

  const timeout = setTimeout(() => {
    rejectHandler?.(new Error('Timed out waiting for Slack OAuth callback.'));
  }, 120_000);

  return {
    callbackUrl: `http://127.0.0.1:${address.port}/callback`,
    waitForCode: async () => {
      try {
        return await waitForCodePromise;
      } finally {
        clearTimeout(timeout);
      }
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      clearTimeout(timeout);
    },
  };
}
