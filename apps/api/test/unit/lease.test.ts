import { describe, expect, it } from 'vitest';

import { createLeaseExpiry, isLeaseExpired } from '../../src/utils/lease.js';

describe('lease logic', () => {
  it('creates lease expiry 60 seconds in the future', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    const expiresAt = createLeaseExpiry(now, 60);

    expect(expiresAt.toISOString()).toBe('2025-01-01T00:01:00.000Z');
  });

  it('detects expired leases', () => {
    const now = new Date('2025-01-01T00:01:01.000Z');
    const expiresAt = new Date('2025-01-01T00:01:00.000Z');

    expect(isLeaseExpired(expiresAt, now)).toBe(true);
  });
});
