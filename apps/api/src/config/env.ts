import { z } from 'zod';
import { DEFAULT_ALLOWED_EMAIL_DOMAIN } from '@ripeseed/shared';
import { loadEnvFiles } from './load-env.js';

loadEnvFiles();

function normalizeEmailDomain(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return normalized;
  }

  return normalized.startsWith('@') ? normalized : `@${normalized}`;
}

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
  ALLOWED_EMAIL_DOMAIN: z
    .string()
    .min(3)
    .transform((value) => normalizeEmailDomain(value)),
  ALLOWED_SLACK_TEAM_ID: z.string().min(1),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_ZONE_ID: z.string().min(1),
  CLOUDFLARE_API_TOKEN: z.string().min(1),
  CLOUDFLARE_BASE_DOMAIN: z.string().default('tunnel.example.com'),
  MAX_ACTIVE_TUNNELS: z.coerce.number().int().positive().default(5),
  HEARTBEAT_INTERVAL_SEC: z.coerce.number().int().positive().default(20),
  LEASE_TIMEOUT_SEC: z.coerce.number().int().positive().default(60),
  REAPER_INTERVAL_SEC: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

const envInput = {
  ...process.env,
  ALLOWED_EMAIL_DOMAIN:
    process.env.ALLOWED_EMAIL_DOMAIN ?? process.env.RIPSEED_EMAIL_DOMAIN ?? DEFAULT_ALLOWED_EMAIL_DOMAIN,
  ALLOWED_SLACK_TEAM_ID: process.env.ALLOWED_SLACK_TEAM_ID ?? process.env.RIPSEED_SLACK_TEAM_ID,
};

export const env = envSchema.parse(envInput);
