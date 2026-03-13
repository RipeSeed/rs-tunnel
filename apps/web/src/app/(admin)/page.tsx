import Link from 'next/link';
import { Activity, ArrowRight, Cable, Database, Gauge, Users2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MetricChart } from '../../components/metric-chart';
import { StatusPill } from '../../components/status-pill';
import { getAdminDashboard } from '../../lib/api';
import { requireProtectedAdminState } from '../../lib/auth';
import { formatBytes, formatDateTime, formatNumber, formatPercent } from '../../lib/format';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const state = await requireProtectedAdminState();
  const dashboard = await getAdminDashboard(state.browserSession.accessToken);
  const metricCards = [
    ['Total users', formatNumber(dashboard.summary.totalUsers), 'Allowed Slack identities on this instance'],
    ['Active tunnels', formatNumber(dashboard.summary.activeTunnels), 'Currently serving traffic'],
    ['Live open connections', formatNumber(dashboard.summary.liveOpenConnections), 'Open proxy connections now'],
    ['24h requests', formatNumber(dashboard.summary.requestsLast24h), 'Captured request events'],
    ['24h error rate', formatPercent(dashboard.summary.errorRateLast24h), 'Requests marked as errors'],
    ['24h transferred', formatBytes(dashboard.summary.bytesLast24h), 'Summed response bytes'],
    ['Cleanup pressure', formatNumber(dashboard.summary.pendingCleanupJobs), 'Jobs needing reconciliation'],
    [
      'Stopped tunnels',
      formatNumber(dashboard.tunnelStatusBreakdown.find((item) => item.status === 'stopped')?.count ?? 0),
      'Historical stop count still retained',
    ],
  ] as const;

  return (
    <>
      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="overflow-hidden border-border/60 bg-[linear-gradient(140deg,hsla(0,0%,100%,0.84)_0%,hsla(46,36%,97%,0.72)_100%)]">
          <CardHeader className="gap-5 p-8">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="rounded-full bg-secondary/80 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-secondary-foreground">
                Instance command view
              </Badge>
              <Badge className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-muted-foreground" variant="outline">
                owner only
              </Badge>
            </div>
            <div className="space-y-3">
              <CardTitle className="text-4xl md:text-5xl">Org-wide tunnel health at a glance.</CardTitle>
              <CardDescription className="max-w-3xl text-base leading-7 md:text-lg">
                This first release is intentionally read-only: it shows how the instance is behaving right now, who is
                using it, and where operational pressure is building.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 p-8 pt-0 md:grid-cols-3">
            {[
              {
                icon: Gauge,
                title: 'Live telemetry',
                body: `${formatNumber(dashboard.summary.liveOpenConnections)} open connections sampled across active hosts.`,
              },
              {
                icon: Users2,
                title: 'Workspace visibility',
                body: `${formatNumber(dashboard.summary.totalUsers)} allowed users with current tunnel footprint side by side.`,
              },
              {
                icon: Activity,
                title: 'Traffic pressure',
                body: `${formatNumber(dashboard.summary.requestsLast24h)} requests and ${formatPercent(dashboard.summary.errorRateLast24h)} error rate in the last 24h.`,
              },
            ].map(({ icon: Icon, title, body }) => (
              <div className="rounded-[calc(var(--radius)-0.25rem)] border border-border/60 bg-background/65 p-5" key={title}>
                <div className="mb-4 inline-flex rounded-full border border-border/70 bg-background p-2 text-primary">
                  <Icon className="size-4" />
                </div>
                <div className="font-heading text-lg font-semibold">{title}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="text-[11px] uppercase tracking-[0.24em]">Pending cleanup jobs</CardDescription>
            <CardTitle className="text-5xl">{formatNumber(dashboard.summary.pendingCleanupJobs)}</CardTitle>
            <CardDescription className="leading-6">
              Queued, failed, or in-flight Cloudflare cleanup work that still needs reconciliation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                icon: Cable,
                label: 'Active tunnels',
                value: formatNumber(dashboard.summary.activeTunnels),
              },
              {
                icon: Database,
                label: 'Transferred in 24h',
                value: formatBytes(dashboard.summary.bytesLast24h),
              },
              {
                icon: Activity,
                label: 'Captured requests',
                value: formatNumber(dashboard.summary.requestsLast24h),
              },
            ].map(({ icon: Icon, label, value }) => (
              <div className="flex items-center justify-between rounded-[calc(var(--radius)-0.25rem)] border border-border/60 bg-muted/30 px-4 py-3" key={label}>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="rounded-full border border-border/60 bg-background/70 p-2 text-primary">
                    <Icon className="size-4" />
                  </span>
                  {label}
                </div>
                <div className="font-mono text-sm font-medium text-foreground">{value}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(([label, value, meta]) => (
          <Card key={label}>
            <CardHeader className="gap-3">
              <CardDescription className="text-[11px] uppercase tracking-[0.24em]">{label}</CardDescription>
              <CardTitle className="text-4xl">{value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm leading-6 text-muted-foreground">{meta}</CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <MetricChart
          title="24h request flow"
          subtitle="Hourly request volume with error overlay"
          data={dashboard.requestVolume24h}
          primaryKey="requests"
          primaryLabel="Requests"
          primaryColor="var(--chart-2)"
          secondaryKey="errors"
          secondaryLabel="Errors"
          secondaryColor="var(--chart-1)"
        />
        <MetricChart
          title="24h transfer volume"
          subtitle="Hourly downstream bytes captured from request logs"
          data={dashboard.bandwidth24h}
          primaryKey="bytes"
          primaryLabel="Bytes"
          primaryColor="var(--chart-3)"
        />
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {dashboard.tunnelStatusBreakdown.map((item) => (
          <Card key={item.status}>
            <CardHeader className="gap-3">
              <CardDescription className="text-[11px] uppercase tracking-[0.24em]">{item.status}</CardDescription>
              <CardTitle className="text-4xl">{formatNumber(item.count)}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">Tunnels in {item.status} state</CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Live tunnels</CardTitle>
            <CardDescription>Most relevant active and recently updated entries</CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/tunnels">
              Open full registry
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hostname</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Live snapshot</TableHead>
                <TableHead>Lease</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.liveTunnels.map((tunnel) => (
                <TableRow key={tunnel.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Link className="font-medium text-foreground transition-colors hover:text-primary" href={`/tunnels/${tunnel.id}`}>
                        {tunnel.hostname}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">{tunnel.slug}</span>
                    </div>
                  </TableCell>
                  <TableCell>{tunnel.userEmail}</TableCell>
                  <TableCell>
                    <StatusPill status={tunnel.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span>{formatNumber(tunnel.live.opn)} open</span>
                      <span className="text-xs text-muted-foreground">
                        {formatNumber(tunnel.live.requests)} req / {formatBytes(tunnel.live.bytes)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{formatDateTime(tunnel.live.expiresAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Workspace roster</CardTitle>
              <CardDescription>Owner plus the most recently added users</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/users">
                View all users
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Active tunnels</TableHead>
                  <TableHead>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span>{user.email}</span>
                        <span className="font-mono text-xs text-muted-foreground">{user.slackUserId}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em]"
                        variant={user.role === 'owner' ? 'default' : 'outline'}
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatNumber(user.activeTunnelCount)}</TableCell>
                    <TableCell>{formatDateTime(user.lastAuditAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Newest audit events across the instance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.recentActivity.map((event) => (
              <div className="rounded-[calc(var(--radius)-0.25rem)] border border-border/60 bg-muted/25 p-4" key={event.id}>
                <div className="font-medium text-foreground">{event.action}</div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>{event.userEmail ?? 'system'}</span>
                  <span className="font-mono text-xs">{formatDateTime(event.createdAt)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
