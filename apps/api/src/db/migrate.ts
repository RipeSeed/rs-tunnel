import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { db, pool } from './client.js';

async function run(): Promise<void> {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(dirname, '../../drizzle');
  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log('Migrations applied');
}

run().catch(async (error) => {
  console.error('Migration failed', error);
  await pool.end();
  process.exit(1);
});
