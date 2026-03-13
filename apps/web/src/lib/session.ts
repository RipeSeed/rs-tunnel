import { type TokenPair, userProfileSchema } from '@ripeseed/shared';
import { z } from 'zod';

export const ADMIN_SESSION_COOKIE_NAME = 'rs_tunnel_admin_session';
const AES_GCM_IV_LENGTH = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const adminBrowserSessionSchema = z
  .object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresAt: z.string(),
    profile: userProfileSchema,
  })
  .strict();

export type AdminBrowserSession = z.infer<typeof adminBrowserSessionSchema>;

function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getSessionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function createAdminBrowserSession(tokenPair: TokenPair): AdminBrowserSession {
  return {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    expiresAt: new Date(Date.now() + tokenPair.expiresInSec * 1000).toISOString(),
    profile: tokenPair.profile,
  };
}

export function isSessionExpiring(session: AdminBrowserSession, headroomMs = 60_000): boolean {
  return new Date(session.expiresAt).getTime() <= Date.now() + headroomMs;
}

export async function encryptAdminBrowserSession(session: AdminBrowserSession, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
  const key = await getSessionKey(secret);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encoder.encode(JSON.stringify(session)),
  );

  const encryptedBytes = new Uint8Array(encrypted);
  const combined = new Uint8Array(iv.length + encryptedBytes.length);
  combined.set(iv, 0);
  combined.set(encryptedBytes, iv.length);

  return toBase64Url(combined);
}

export async function decryptAdminBrowserSession(
  value: string,
  secret: string,
): Promise<AdminBrowserSession | null> {
  try {
    const combined = fromBase64Url(value);
    const iv = combined.slice(0, AES_GCM_IV_LENGTH);
    const cipherText = combined.slice(AES_GCM_IV_LENGTH);
    const key = await getSessionKey(secret);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      cipherText,
    );

    return adminBrowserSessionSchema.parse(JSON.parse(decoder.decode(decrypted)));
  } catch {
    return null;
  }
}

export function getAdminSessionCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
  };
}
