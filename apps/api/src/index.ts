import { env } from './config/env.js';
import { pool } from './db/client.js';
import { repository } from './db/repository.js';
import { logger } from './lib/logger.js';
import { buildApp } from './app.js';
import { AuthService } from './services/auth.service.js';
import { CleanupService } from './services/cleanup.service.js';
import { CloudflareService } from './services/cloudflare.service.js';
import { TokenService } from './services/token.service.js';
import { TunnelService } from './services/tunnel.service.js';
import { ReaperWorker } from './workers/reaper.worker.js';

async function start(): Promise<void> {
  const tokenService = new TokenService(env);
  const cloudflareService = new CloudflareService(env);
  const tunnelService = new TunnelService(env, repository, cloudflareService);
  const authService = new AuthService(env, repository, tokenService);
  const cleanupService = new CleanupService(repository, tunnelService);

  const app = buildApp({
    env,
    services: {
      authService,
      tunnelService,
      tokenService,
    },
  });

  const reaper = new ReaperWorker(cleanupService, env.REAPER_INTERVAL_SEC);
  if (env.NODE_ENV !== 'test') {
    reaper.start();
  }

  app.addHook('onClose', async () => {
    reaper.stop();
    await pool.end();
  });

  await app.listen({
    host: '0.0.0.0',
    port: env.PORT,
  });

  logger.info(`API listening on port ${env.PORT}`);
}

start().catch((error) => {
  logger.error('API start failed', error);
  process.exit(1);
});
