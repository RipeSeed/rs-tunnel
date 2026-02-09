import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

let loaded = false;

export function loadEnvFiles(): void {
  if (loaded) {
    return;
  }

  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(dirname, '../../.env'),
    path.resolve(dirname, '../../../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
  ];

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);

    if (!fs.existsSync(candidate)) {
      continue;
    }

    dotenv.config({ path: candidate, override: false });
  }

  loaded = true;
}
