import { describe, expect, it } from 'vitest';

import { assertWithinTunnelLimit } from '../../src/services/quota.js';

describe('tunnel quota', () => {
  it('allows creating a tunnel when user is below the limit', () => {
    expect(() => assertWithinTunnelLimit(4, 5)).not.toThrow();
  });

  it('blocks creating a 6th tunnel when limit is 5', () => {
    expect(() => assertWithinTunnelLimit(5, 5)).toThrowError(/Maximum of 5 active tunnels reached/);
  });
});
