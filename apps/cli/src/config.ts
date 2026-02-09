import os from 'node:os';
import path from 'node:path';

import type { CliConfig } from './types.js';

export const DEFAULT_API_BASE_URL = 'https://api-tunnel.internal.ripeseed.io';

export const cliConfig: CliConfig = {
  apiBaseUrl: process.env.RS_TUNNEL_API_BASE_URL ?? DEFAULT_API_BASE_URL,
};

export function getCliHomeDir(): string {
  return path.join(os.homedir(), '.rs-tunnel');
}

export function getFallbackSessionPath(): string {
  return path.join(getCliHomeDir(), 'session.enc');
}

export function getFallbackKeyPath(): string {
  return path.join(getCliHomeDir(), 'session.key');
}

export function getBundledBinDir(): string {
  return path.join(getCliHomeDir(), 'bin');
}
