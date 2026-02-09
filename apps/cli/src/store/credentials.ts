import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';

import { getCliHomeDir, getFallbackKeyPath, getFallbackSessionPath } from '../config.js';
import type { StoredSession } from '../types.js';

const KEYTAR_SERVICE = 'rs-tunnel';
const KEYTAR_ACCOUNT = 'default';

type KeytarModule = {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

async function loadKeytar(): Promise<KeytarModule | undefined> {
  try {
    const keytar = await import('keytar');
    return keytar.default as KeytarModule;
  } catch {
    return undefined;
  }
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(getCliHomeDir(), { recursive: true, mode: 0o700 });
}

async function getOrCreateFileKey(): Promise<Buffer> {
  await ensureDir();

  const keyPath = getFallbackKeyPath();
  try {
    const existing = await fs.readFile(keyPath, 'utf8');
    return Buffer.from(existing.trim(), 'base64');
  } catch {
    const key = randomBytes(32);
    await fs.writeFile(keyPath, key.toString('base64'), { mode: 0o600 });
    return key;
  }
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}

function decrypt(payload: string, key: Buffer): string {
  const parsed = JSON.parse(payload) as { iv: string; tag: string; data: string };

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

async function writeFallbackSession(session: StoredSession): Promise<void> {
  await ensureDir();
  const key = await getOrCreateFileKey();
  const encrypted = encrypt(JSON.stringify(session), key);
  await fs.writeFile(getFallbackSessionPath(), encrypted, { mode: 0o600 });
}

async function readFallbackSession(): Promise<StoredSession | null> {
  try {
    const key = await getOrCreateFileKey();
    const encrypted = await fs.readFile(getFallbackSessionPath(), 'utf8');
    const decrypted = decrypt(encrypted, key);
    return JSON.parse(decrypted) as StoredSession;
  } catch {
    return null;
  }
}

async function deleteFallbackSession(): Promise<void> {
  await fs.rm(getFallbackSessionPath(), { force: true });
}

export async function saveSession(session: StoredSession): Promise<void> {
  const keytar = await loadKeytar();
  if (keytar) {
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, JSON.stringify(session));
    return;
  }

  await writeFallbackSession(session);
}

export async function loadSession(): Promise<StoredSession | null> {
  const keytar = await loadKeytar();
  if (keytar) {
    const raw = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as StoredSession;
  }

  return readFallbackSession();
}

export async function clearSession(): Promise<void> {
  const keytar = await loadKeytar();
  if (keytar) {
    await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    return;
  }

  await deleteFallbackSession();
}
