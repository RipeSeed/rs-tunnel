import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MetricChart } from '../../../../components/metric-chart';
import { StatusPill } from '../../../../components/status-pill';
import {
  ApiRequestError,
  getAdminTunnelDetail,
  getAdminTunnelMetrics,
  getAdminTunnelRequests,
} from '../../../../lib/api';
import { requireProtectedAdminState } from '../../../../lib/auth';
import { formatBytes, formatDateTime, formatNumber, formatPercent } from '../../../../lib/format';

export const dynamic = 'force-dynamic';

type TunnelDetailPageProps = {
  params: Promise<{ tunnelId: string }>;
};

export default async function TunnelDetailPage({ params }: TunnelDetailPageProps) {
  const { tunnelId } = await params;
  const state = await requireProtectedAdminState();
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date().toISOString();

  try {
    const [detail, metrics, requests] = await Promise.all([
      getAdminTunnelDetail(state.browserSession.accessToken, tunnelId),
      getAdminTunnelMetrics(state.browserSession.accessToken, tunnelId, from, to),
      getAdminTunnelRequests(state.browserSession.accessToken, tunnelId, undefined, 80),
    ]);

    const metricsChartData = metrics.map((point) => ({
      bucketStart: point.capturedAt,
      openConnections: point.opn,
      requests: point.requests,
    }));

    return (
      <>
        <Card className="overflow-hidden border-border/60 bg-[linear-gradient(140deg,hsla(0,0%,100%,0.84)_0%,hsla(46,36%,97%,0.72)_100%)]">
          <CardHeader className="gap-4 p-8">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="rounded-full bg-secondary/80 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-secondary-foreground">
                Tunnel detail
              </Badge>
              <StatusPill status={detail.tunnel.status} />
            </div>
            <div className="space-y-3">
              <CardTitle className="text-4xl">{detail.tunnel.hostname}</CardTitle>
              <CardDescription className="max-w-3xl text-base leading-7">
                Owned by {detail.tunnel.userEmail}, forwarded to localhost:{detail.tunnel.requestedPort}, and currently
                tracked as a live operational record for this instance.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Last 24h requests', formatNumber(detail.last24h.requests), 'Requests ingested for this tunnel over the last 24 hours.'],
            ['Last 24h error rate', formatPercent(detail.last24h.errorRate), 'Error-marked requests divided by total request volume.'],
            ['Last 24h transfer', formatBytes(detail.last24h.bytes), 'Response bytes captured for this hostname.'],
            [
              'Average duration',
              detail.last24h.averageDurationMs === null ? 'n/a' : `${detail.last24h.averageDurationMs.toFixed(1)} ms`,
              'Mean request duration over the same 24 hour window.',
            ],
          ].map(([label, value, body]) => (
            <Card key={label}>
              <CardHeader className="gap-3">
                <CardDescription className="text-[11px] uppercase tracking-[0.24em]">{label}</CardDescription>
                <CardTitle className="text-4xl">{value}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm leading-6 text-muted-foreground">{body}</CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Owner', detail.tunnel.userEmail],
            ['Region', detail.tunnel.live.region ?? 'n/a'],
            ['Lease expiry', formatDateTime(detail.tunnel.live.expiresAt)],
            ['Live bytes', formatBytes(detail.tunnel.live.bytes)],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardHeader className="gap-3">
                <CardDescription className="text-[11px] uppercase tracking-[0.24em]">{label}</CardDescription>
                <CardTitle className="text-xl">{value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </section>

        <MetricChart
          title="24h live metrics"
          subtitle="Open connections and sampled request counts from telemetry metrics"
          data={metricsChartData}
          primaryKey="openConnections"
          primaryLabel="Open connections"
          primaryColor="var(--chart-2)"
          secondaryKey="requests"
          secondaryLabel="Requests"
          secondaryColor="var(--chart-3)"
          mode="line"
        />

        <Card>
          <CardHeader>
            <CardTitle>Recent request log</CardTitle>
            <CardDescription>Last {formatNumber(requests.length)} captured request events</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Bytes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={`${request.startedAt}-${request.path}-${request.statusCode}`}>
                    <TableCell>{formatDateTime(request.startedAt)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {request.method} {request.path}
                    </TableCell>
                    <TableCell>{request.statusCode}</TableCell>
                    <TableCell>{request.durationMs} ms</TableCell>
                    <TableCell>{formatBytes(request.responseBytes ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}
