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
import { listAdminUsers } from '../../../lib/api';
import { requireProtectedAdminState } from '../../../lib/auth';
import { formatDateTime, formatNumber } from '../../../lib/format';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const state = await requireProtectedAdminState();
  const users = await listAdminUsers(state.browserSession.accessToken);

  return (
    <>
      <Card className="overflow-hidden border-border/60 bg-[linear-gradient(140deg,hsla(0,0%,100%,0.84)_0%,hsla(46,36%,97%,0.72)_100%)]">
        <CardHeader className="gap-4 p-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Workspace roster</div>
          <CardTitle className="text-4xl">Every allowed identity, in one table.</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            This view stays read-only in v1. It gives the owner enough context to understand who is active on the
            instance and how much tunnel footprint each user currently has.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>{formatNumber(users.length)} records returned</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Slack team</TableHead>
                <TableHead>Active tunnels</TableHead>
                <TableHead>Total tunnels</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Last audit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
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
                  <TableCell className="font-mono text-xs">{user.slackTeamId}</TableCell>
                  <TableCell>{formatNumber(user.activeTunnelCount)}</TableCell>
                  <TableCell>{formatNumber(user.totalTunnelCount)}</TableCell>
                  <TableCell>{formatDateTime(user.createdAt)}</TableCell>
                  <TableCell>{formatDateTime(user.lastAuditAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
