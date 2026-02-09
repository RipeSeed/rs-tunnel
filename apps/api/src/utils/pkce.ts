import { createHash } from 'node:crypto';

export function createCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
