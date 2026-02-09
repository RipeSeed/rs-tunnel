import { addSeconds } from './time.js';

export function createLeaseExpiry(now: Date, timeoutSec: number): Date {
  return addSeconds(now, timeoutSec);
}

export function isLeaseExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
