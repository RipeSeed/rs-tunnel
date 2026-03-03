import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_API_BASE_URL,
  ensureApiBaseUrlConfigured,
  getCliConfig,
  getCliConfigPath,
  setApiBaseUrlOverride,
} from './config.js';

const originalEnv = { ...process.env };
let tempHomeDir = '';

beforeEach(async () => {
  tempHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rs-tunnel-cli-config-'));
  vi.spyOn(os, 'homedir').mockReturnValue(tempHomeDir);
});

afterEach(async () => {
  process.env = { ...originalEnv };
  setApiBaseUrlOverride(undefined);
  vi.restoreAllMocks();

  if (tempHomeDir) {
    await fs.rm(tempHomeDir, { recursive: true, force: true });
  }
});

describe('cli config', () => {
  it('uses RS_TUNNEL_API_URL when configured', () => {
    process.env.RS_TUNNEL_API_URL = 'https://api.selfhosted.example.com/';
    process.env.RS_TUNNEL_API_BASE_URL = 'https://legacy.example.com';

    const config = getCliConfig();

    expect(config.apiBaseUrl).toBe('https://api.selfhosted.example.com');
  });

  it('falls back to RS_TUNNEL_API_BASE_URL for backwards compatibility', () => {
    delete process.env.RS_TUNNEL_API_URL;
    process.env.RS_TUNNEL_API_BASE_URL = 'https://legacy.example.com/';

    const config = getCliConfig();

    expect(config.apiBaseUrl).toBe('https://legacy.example.com');
  });

  it('uses the default API URL when env vars are absent', () => {
    delete process.env.RS_TUNNEL_API_URL;
    delete process.env.RS_TUNNEL_API_BASE_URL;

    const config = getCliConfig();

    expect(config.apiBaseUrl).toBe(DEFAULT_API_BASE_URL);
  });

  it('supports command-level domain overrides', () => {
    process.env.RS_TUNNEL_API_URL = 'https://api.default.example.com';

    setApiBaseUrlOverride('https://api.override.example.com/');
    const config = getCliConfig();

    expect(config.apiBaseUrl).toBe('https://api.override.example.com');
  });

  it('rejects invalid command-level domain overrides', () => {
    expect(() => setApiBaseUrlOverride('not-a-valid-url')).toThrow(/Invalid API base URL/);
  });

  it('loads API URL from persisted local config when env vars are absent', async () => {
    delete process.env.RS_TUNNEL_API_URL;
    delete process.env.RS_TUNNEL_API_BASE_URL;

    await fs.mkdir(path.dirname(getCliConfigPath()), { recursive: true });
    await fs.writeFile(
      getCliConfigPath(),
      JSON.stringify(
        {
          apiBaseUrl: 'https://persisted.example.com/',
        },
        null,
        2,
      ),
    );

    const config = getCliConfig();

    expect(config.apiBaseUrl).toBe('https://persisted.example.com');
  });

  it('persists command-level --domain for future commands', async () => {
    delete process.env.RS_TUNNEL_API_URL;
    delete process.env.RS_TUNNEL_API_BASE_URL;

    await ensureApiBaseUrlConfigured('https://saved.example.com/');
    setApiBaseUrlOverride(undefined);

    const config = getCliConfig();
    expect(config.apiBaseUrl).toBe('https://saved.example.com');
  });
});
