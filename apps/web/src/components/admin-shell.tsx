import type { ReactNode } from 'react';
import { ShieldCheck, SignalHigh, Workflow } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

import { SideNav } from './side-nav';

export function AdminShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-4 md:px-6 lg:flex-row lg:px-8">
      <aside className="w-full lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:max-w-[320px] lg:flex-shrink-0">
        <Card className="h-full overflow-hidden bg-[linear-gradient(180deg,hsla(0,0%,100%,0.86)_0%,hsla(46,36%,97%,0.76)_100%)]">
          <CardHeader className="gap-4 border-b border-border/60 bg-[radial-gradient(circle_at_top_left,hsla(18,82%,50%,0.12),transparent_48%)]">
            <div className="flex items-center justify-between gap-3">
              <Badge className="rounded-full bg-secondary/80 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-secondary-foreground">
                rs-tunnel owner console
              </Badge>
              <div className="rounded-full border border-border/70 bg-background/70 p-2 text-primary">
                <ShieldCheck className="size-4" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="font-heading text-3xl font-semibold tracking-tight text-foreground">Mission Control</div>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                Single-seat command over traffic, tunnels, and operational drift across the self-hosted instance.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { icon: SignalHigh, label: 'Live ops' },
                { icon: Workflow, label: 'Read only' },
                { icon: ShieldCheck, label: 'Owner gate' },
              ].map(({ icon: Icon, label }) => (
                <div
                  className="rounded-2xl border border-border/70 bg-background/65 px-3 py-3 text-center text-muted-foreground"
                  key={label}
                >
                  <Icon className="mx-auto mb-2 size-4 text-primary" />
                  <div>{label}</div>
                </div>
              ))}
            </div>
          </CardHeader>
          <CardContent className="flex h-full flex-col gap-6 p-4">
            <SideNav />
            <div className="mt-auto space-y-4">
              <div className="rounded-[calc(var(--radius)-0.25rem)] border border-border/60 bg-muted/40 p-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Signed in as owner</div>
                <div className="mt-2 break-all text-sm font-medium text-foreground">{userEmail}</div>
              </div>
              <form action="/logout" method="post">
                <Button className="w-full justify-center" type="submit" variant="outline">
                  End admin session
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </aside>
      <main className="flex-1 space-y-6 pb-6">{children}</main>
    </div>
  );
}
