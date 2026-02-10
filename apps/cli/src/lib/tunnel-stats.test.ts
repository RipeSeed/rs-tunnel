import { describe, expect, it } from 'vitest';

import { TunnelStats } from './tunnel-stats.js';

describe('TunnelStats', () => {
  it('returns n/a metrics as null when no requests are recorded', () => {
    const stats = new TunnelStats();
    stats.updateConnections({ totalConnections: 0, openConnections: 0 });

    const snapshot = stats.getSnapshot(1000);

    expect(snapshot.ttl).toBe(0);
    expect(snapshot.opn).toBe(0);
    expect(snapshot.rt1Ms).toBeNull();
    expect(snapshot.rt5Ms).toBeNull();
    expect(snapshot.p50Ms).toBeNull();
    expect(snapshot.p90Ms).toBeNull();
  });

  it('evicts old samples from rolling windows', () => {
    const stats = new TunnelStats();

    stats.updateConnections({ totalConnections: 5, openConnections: 1 });
    stats.recordRequest({ startedAtEpochMs: 0, durationMs: 5 });
    stats.recordRequest({ startedAtEpochMs: 240_000, durationMs: 40 });

    const beforeFiveMinuteCutoff = stats.getSnapshot(300_000);
    expect(beforeFiveMinuteCutoff.ttl).toBe(5);
    expect(beforeFiveMinuteCutoff.opn).toBe(1);
    expect(beforeFiveMinuteCutoff.rt1Ms).toBe(40);
    expect(beforeFiveMinuteCutoff.rt5Ms).toBe(22.5);

    const afterFiveMinuteCutoff = stats.getSnapshot(300_001);
    expect(afterFiveMinuteCutoff.rt1Ms).toBeNull();
    expect(afterFiveMinuteCutoff.rt5Ms).toBe(40);
    expect(afterFiveMinuteCutoff.p50Ms).toBe(40);
    expect(afterFiveMinuteCutoff.p90Ms).toBe(40);
  });

  it('calculates rt1, rt5, p50, and p90 deterministically', () => {
    const stats = new TunnelStats();

    const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    for (const durationMs of durations) {
      stats.recordRequest({ startedAtEpochMs: 10_000, durationMs });
    }

    const snapshot = stats.getSnapshot(10_500);

    expect(snapshot.rt1Ms).toBe(55);
    expect(snapshot.rt5Ms).toBe(55);
    expect(snapshot.p50Ms).toBe(50);
    expect(snapshot.p90Ms).toBe(90);
  });
});
