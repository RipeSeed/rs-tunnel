import { z } from 'zod';
import { loadEnvFiles } from './load-env.js';

loadEnvFiles();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  API_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  REFRESH_TOKEN_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SLACK_CLIENT_ID: z.string().min(1),
  SLACK_CLIENT_SECRET: z.string().min(1),
  SLACK_REDIRECT_URI: z.string().url(),
  RIPSEED_SLACK_TEAM_ID: z.string().min(1),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_ZONE_ID: z.string().min(1),
  CLOUDFLARE_API_TOKEN: z.string().min(1),
  CLOUDFLARE_BASE_DOMAIN: z.string().default('tunnel.ripeseed.io'),
  MAX_ACTIVE_TUNNELS: z.coerce.number().int().positive().default(5),
  HEARTBEAT_INTERVAL_SEC: z.coerce.number().int().positive().default(20),
  LEASE_TIMEOUT_SEC: z.coerce.number().int().positive().default(60),
  REAPER_INTERVAL_SEC: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
