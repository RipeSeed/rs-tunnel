import fs from 'node:fs';

let cachedVersion: string | null = null;

export function getCliVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  try {
    const packageJsonUrl = new URL('../../package.json', import.meta.url);
    const packageJsonRaw = fs.readFileSync(packageJsonUrl, 'utf8');
    const packageJson = JSON.parse(packageJsonRaw) as { version?: unknown };
    cachedVersion = typeof packageJson.version === 'string' && packageJson.version.length > 0 ? packageJson.version : 'unknown';
  } catch {
    cachedVersion = 'unknown';
  }

  return cachedVersion;
}
