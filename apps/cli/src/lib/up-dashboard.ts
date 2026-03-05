import http from 'node:http';

import type { ProxyRequestEvent } from './local-proxy.js';
import type { TunnelStatsSnapshot } from './tunnel-stats.js';

export type UpDashboard = {
  setRegion: (region: string | null) => void;
  setMetrics: (metrics: TunnelStatsSnapshot) => void;
  addRequest: (event: ProxyRequestEvent) => void;
  addCloudflaredLine: (line: string) => void;
  addMessage: (line: string) => void;
  stop: () => void;
};

type CreateUpDashboardInput = {
  account: string;
  version: string;
  forwarding: string;
  verbose: boolean;
  stdout?: NodeJS.WriteStream;
};

const HEADER_DIVIDER = '------------';
const MAX_LOG_LINES = 120;

function formatTimestamp(epochMs: number): string {
  const date = new Date(epochMs);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const millis = String(date.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${millis}`;
}

function formatMetric(ms: number | null): string {
  if (ms === null) {
    return 'n/a';
  }

  return `${Math.round(ms)}ms`;
}

function formatStatus(event: ProxyRequestEvent): string {
  const statusText = event.statusMessage || http.STATUS_CODES[event.statusCode] || '';
  const text = `${event.statusCode} ${statusText}`.trim();
  return text.length > 0 ? text : String(event.statusCode);
}

function truncate(value: string, width: number): string {
  if (value.length <= width) {
    return value.padEnd(width, ' ');
  }

  if (width <= 3) {
    return value.slice(0, width);
  }

  return `${value.slice(0, width - 3)}...`;
}

function formatRequestLine(event: ProxyRequestEvent, width: number): string {
  const timestamp = formatTimestamp(event.startedAtEpochMs);
  const method = (event.protocol === 'ws' ? 'WS' : event.method.toUpperCase()).padEnd(6, ' ');
  const pathWidth = Math.max(16, Math.min(48, width - 44));
  const path = truncate(event.path, pathWidth);
  const status = formatStatus(event);
  return `${timestamp} PKT ${method} ${path} ${status}`;
}

function formatConnectionRow(metrics: TunnelStatsSnapshot): string {
  const columns = [
    String(metrics.ttl).padStart(7, ' '),
    String(metrics.opn).padStart(7, ' '),
    formatMetric(metrics.rt1Ms).padStart(7, ' '),
    formatMetric(metrics.rt5Ms).padStart(7, ' '),
    formatMetric(metrics.p50Ms).padStart(7, ' '),
    formatMetric(metrics.p90Ms).padStart(7, ' '),
  ];

  return `Connections   ttl     opn     rt1     rt5     p50     p90\n             ${columns.join('')}`;
}

function isSameMetrics(left: TunnelStatsSnapshot, right: TunnelStatsSnapshot): boolean {
  return (
    left.ttl === right.ttl &&
    left.opn === right.opn &&
    left.rt1Ms === right.rt1Ms &&
    left.rt5Ms === right.rt5Ms &&
    left.p50Ms === right.p50Ms &&
    left.p90Ms === right.p90Ms
  );
}

function buildHeader(input: {
  account: string;
  version: string;
  region: string;
  latency: string;
  forwarding: string;
  metrics: TunnelStatsSnapshot;
}): string {
  return [
    `Account      ${input.account}`,
    `Version      rs-tunnel ${input.version}`,
    `Region       ${input.region}`,
    `Latency      ${input.latency}`,
    `Forwarding   ${input.forwarding}`,
    '',
    formatConnectionRow(input.metrics),
    '',
    'HTTP Requests',
    HEADER_DIVIDER,
  ].join('\n');
}

export function createUpDashboard(input: CreateUpDashboardInput): UpDashboard {
  const stdout = input.stdout ?? process.stdout;
  const isTty = Boolean(stdout.isTTY);

  let region = 'n/a';
  let metrics: TunnelStatsSnapshot = {
    ttl: 0,
    opn: 0,
    rt1Ms: null,
    rt5Ms: null,
    p50Ms: null,
    p90Ms: null,
  };

  const logLines: string[] = [];
  let lastNonTtyMetricsAt = 0;
  let isDirty = true;
  let lastRenderColumns = stdout.columns ?? 100;

  const appendLogLine = (line: string): void => {
    const normalizedLine = line.trimEnd();
    if (normalizedLine.trim().length === 0) {
      return;
    }

    logLines.push(normalizedLine);
    if (logLines.length > MAX_LOG_LINES) {
      logLines.shift();
    }

    isDirty = true;

    if (!isTty) {
      stdout.write(`${normalizedLine}\n`);
    }
  };

  const render = (): void => {
    if (!isTty) {
      return;
    }

    const columns = stdout.columns ?? 100;
    if (!isDirty && columns === lastRenderColumns) {
      return;
    }

    lastRenderColumns = columns;
    const requestLines = logLines.map((line) => truncate(line, Math.max(30, columns - 1))).join('\n');
    const latency = formatMetric(metrics.rt1Ms);

    const body = [
      buildHeader({
        account: input.account,
        version: input.version,
        region,
        latency,
        forwarding: input.forwarding,
        metrics,
      }),
      requestLines,
    ]
      .filter((section) => section.length > 0)
      .join('\n');

    stdout.write('\x1b[2J\x1b[H');
    stdout.write(body);
    stdout.write('\n');
    isDirty = false;
  };

  if (!isTty) {
    const header = buildHeader({
      account: input.account,
      version: input.version,
      region,
      latency: formatMetric(metrics.rt1Ms),
      forwarding: input.forwarding,
      metrics,
    });

    stdout.write(`${header}\n`);
  }

  const renderInterval = isTty ? setInterval(render, 300) : null;
  if (renderInterval) {
    render();
  }

  return {
    setRegion: (nextRegion) => {
      const normalized = nextRegion && nextRegion.trim().length > 0 ? nextRegion.trim() : 'n/a';
      if (normalized === region) {
        return;
      }

      region = normalized;
      isDirty = true;
      if (!isTty) {
        stdout.write(`Region       ${region}\n`);
      }
    },
    setMetrics: (nextMetrics) => {
      if (isSameMetrics(metrics, nextMetrics)) {
        return;
      }

      metrics = nextMetrics;
      isDirty = true;

      if (!isTty) {
        const now = Date.now();
        if (now - lastNonTtyMetricsAt >= 5_000) {
          lastNonTtyMetricsAt = now;
          stdout.write(`${formatConnectionRow(metrics)}\n`);
        }
      }
    },
    addRequest: (event) => {
      appendLogLine(formatRequestLine(event, stdout.columns ?? 100));
    },
    addCloudflaredLine: (line) => {
      if (!input.verbose) {
        return;
      }

      if (line.trim().length === 0) {
        return;
      }

      appendLogLine(`[cloudflared] ${line}`);
    },
    addMessage: (line) => {
      if (line.trim().length === 0) {
        return;
      }

      appendLogLine(`[info] ${line}`);
    },
    stop: () => {
      if (renderInterval) {
        clearInterval(renderInterval);
      }

      if (isTty) {
        render();
      }
    },
  };
}
