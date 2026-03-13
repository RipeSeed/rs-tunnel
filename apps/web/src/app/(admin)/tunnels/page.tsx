import Link from 'next/link';

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
import { StatusPill } from '../../../components/status-pill';
import { listAdminTunnels } from '../../../lib/api';
import { requireProtectedAdminState } from '../../../lib/auth';
import { formatBytes, formatDateTime, formatNumber } from '../../../lib/format';

export const dynamic = 'force-dynamic';

export default async function TunnelsPage() {
  const state = await requireProtectedAdminState();
  const tunnels = await listAdminTunnels(state.browserSession.accessToken);

  return (
    <>
      <Card className="overflow-hidden border-border/60 bg-[linear-gradient(140deg,hsla(0,0%,100%,0.84)_0%,hsla(46,36%,97%,0.72)_100%)]">
        <CardHeader className="gap-4 p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Tunnel registry</div>
          <CardTitle className="text-4xl">Track every hostname the instance has served.</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            The registry joins user ownership, current live metrics, and lease state. It is the operational source of
            truth for what the instance is serving right now.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>All tunnels</CardTitle>
            <CardDescription>{formatNumber(tunnels.length)} records returned</CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/">Back to overview</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hostname</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Forwarding</TableHead>
                <TableHead>Live</TableHead>
                <TableHead>Lease expiry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tunnels.map((tunnel) => (
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
                  <TableCell className="font-mono text-xs">localhost:{tunnel.requestedPort}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span>{formatNumber(tunnel.live.requests)} req</span>
                      <span className="text-xs text-muted-foreground">
                        {formatNumber(tunnel.live.opn)} open / {formatBytes(tunnel.live.bytes)}
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
    </>
  );
}
