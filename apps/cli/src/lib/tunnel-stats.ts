import type { ProxyConnectionSnapshot, ProxyRequestEvent } from './local-proxy.js';

const ONE_MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 300_000;

type LatencySample = {
  timestampEpochMs: number;
  durationMs: number;
};

export type TunnelStatsSnapshot = {
  ttl: number;
  opn: number;
  rt1Ms: number | null;
  rt5Ms: number | null;
  p50Ms: number | null;
  p90Ms: number | null;
};

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function percentile(sortedValues: number[], rank: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }

  const index = Math.max(0, Math.ceil(sortedValues.length * rank) - 1);
  return sortedValues[index] ?? null;
}

export class TunnelStats {
  private totalConnections = 0;

  private openConnections = 0;

  private readonly latencySamples: LatencySample[] = [];

  updateConnections(snapshot: ProxyConnectionSnapshot): void {
    this.totalConnections = snapshot.totalConnections;
    this.openConnections = snapshot.openConnections;
  }

  recordRequest(event: Pick<ProxyRequestEvent, 'startedAtEpochMs' | 'durationMs'>): void {
    this.latencySamples.push({
      timestampEpochMs: event.startedAtEpochMs,
      durationMs: Math.max(0, event.durationMs),
    });

    this.prune(event.startedAtEpochMs);
  }

  getSnapshot(nowEpochMs: number = Date.now()): TunnelStatsSnapshot {
    this.prune(nowEpochMs);

    const oneMinuteCutoff = nowEpochMs - ONE_MINUTE_MS;
    const fiveMinuteCutoff = nowEpochMs - FIVE_MINUTES_MS;

    const durationsIn1m = this.latencySamples
      .filter((sample) => sample.timestampEpochMs >= oneMinuteCutoff)
      .map((sample) => sample.durationMs);

    const durationsIn5m = this.latencySamples
      .filter((sample) => sample.timestampEpochMs >= fiveMinuteCutoff)
      .map((sample) => sample.durationMs);

    const sortedIn5m = [...durationsIn5m].sort((a, b) => a - b);

    return {
      ttl: this.totalConnections,
      opn: this.openConnections,
      rt1Ms: average(durationsIn1m),
      rt5Ms: average(durationsIn5m),
      p50Ms: percentile(sortedIn5m, 0.5),
      p90Ms: percentile(sortedIn5m, 0.9),
    };
  }

  private prune(nowEpochMs: number): void {
    const oldestAllowed = nowEpochMs - FIVE_MINUTES_MS;

    while (this.latencySamples.length > 0 && this.latencySamples[0] && this.latencySamples[0].timestampEpochMs < oldestAllowed) {
      this.latencySamples.shift();
    }
  }
}
