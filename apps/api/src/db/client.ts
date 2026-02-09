import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadEnvFiles } from '../config/load-env.js';

loadEnvFiles();
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is missing. Define it in apps/api/.env or repo-root .env before running API commands.',
  );
}

export const pool = new Pool({
  connectionString: databaseUrl,
});

export const db = drizzle(pool);
