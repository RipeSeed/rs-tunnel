import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';

import type { CliConfig } from './types.js';

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.replace(/\/+$/, '') : value;
}

function normalizeApiBaseUrl(value: string, source: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Invalid API base URL from ${source}: value is empty.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid API base URL from ${source}: "${value}". Expected absolute URL like https://api.example.com.`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid API base URL from ${source}: protocol must be http or https.`);
  }

  return stripTrailingSlash(parsed.toString());
}

export const DEFAULT_API_BASE_URL = 'http://localhost:8080';
const CLI_CONFIG_FILENAME = 'config.json';

let apiBaseUrlOverride: string | undefined;

export function setApiBaseUrlOverride(value?: string): void {
  apiBaseUrlOverride = value ? normalizeApiBaseUrl(value, '--domain') : undefined;
}

function getApiBaseUrlFromEnv(): string | undefined {
  const apiUrl = process.env.RS_TUNNEL_API_URL;
  if (apiUrl) {
    return normalizeApiBaseUrl(apiUrl, 'RS_TUNNEL_API_URL');
  }

  const legacyApiBaseUrl = process.env.RS_TUNNEL_API_BASE_URL;
  if (legacyApiBaseUrl) {
    return normalizeApiBaseUrl(legacyApiBaseUrl, 'RS_TUNNEL_API_BASE_URL');
  }

  return undefined;
}

type CliLocalConfig = {
  apiBaseUrl?: string;
};

export function getCliConfigPath(): string {
  return path.join(getCliHomeDir(), CLI_CONFIG_FILENAME);
}

function readApiBaseUrlFromLocalConfig(): string | undefined {
  try {
    const raw = fs.readFileSync(getCliConfigPath(), 'utf8');
    const parsed = JSON.parse(raw) as CliLocalConfig;
    if (!parsed.apiBaseUrl) {
      return undefined;
    }

    return normalizeApiBaseUrl(parsed.apiBaseUrl, getCliConfigPath());
  } catch {
    return undefined;
  }
}

async function saveApiBaseUrlToLocalConfig(apiBaseUrl: string): Promise<void> {
  const homeDir = getCliHomeDir();
  await fsPromises.mkdir(homeDir, { recursive: true, mode: 0o700 });

  const payload: CliLocalConfig = { apiBaseUrl };
  await fsPromises.writeFile(getCliConfigPath(), `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
  });
}

export async function ensureApiBaseUrlConfigured(domainOption?: string): Promise<string> {
  if (domainOption) {
    const normalized = normalizeApiBaseUrl(domainOption, '--domain');
    await saveApiBaseUrlToLocalConfig(normalized);
    setApiBaseUrlOverride(normalized);
    return normalized;
  }

  const envApiBaseUrl = getApiBaseUrlFromEnv();
  if (envApiBaseUrl) {
    setApiBaseUrlOverride(envApiBaseUrl);
    return envApiBaseUrl;
  }

  const localApiBaseUrl = readApiBaseUrlFromLocalConfig();
  if (localApiBaseUrl) {
    setApiBaseUrlOverride(localApiBaseUrl);
    return localApiBaseUrl;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'No API domain configured. Re-run with --domain <url> or set RS_TUNNEL_API_URL in your environment.',
    );
  }

  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log('No API domain configured for rs-tunnel.');
    const answer = await prompt.question(
      `Enter your API domain (press Enter for ${DEFAULT_API_BASE_URL}): `,
    );
    const normalized = normalizeApiBaseUrl(answer.trim() || DEFAULT_API_BASE_URL, 'interactive prompt');
    await saveApiBaseUrlToLocalConfig(normalized);
    setApiBaseUrlOverride(normalized);
    console.log(`Saved API domain to ${getCliConfigPath()}`);
    return normalized;
  } finally {
    prompt.close();
  }
}

function resolveApiBaseUrl(): string {
  if (apiBaseUrlOverride) {
    return apiBaseUrlOverride;
  }

  const envApiBaseUrl = getApiBaseUrlFromEnv();
  if (envApiBaseUrl) {
    return envApiBaseUrl;
  }

  const localApiBaseUrl = readApiBaseUrlFromLocalConfig();
  if (localApiBaseUrl) {
    return localApiBaseUrl;
  }

  return DEFAULT_API_BASE_URL;
}

export function getCliConfig(): CliConfig {
  return {
    apiBaseUrl: resolveApiBaseUrl(),
  };
}

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
