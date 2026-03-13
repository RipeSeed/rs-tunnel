import Link from 'next/link';
import { ArrowRight, LockKeyhole, ShieldCheck, Slack } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { getAdminBootstrapStatus } from '../../lib/api';

export const dynamic = 'force-dynamic';

type LoginPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

function getErrorCopy(error?: string): string | null {
  switch (error) {
    case 'missing-login-code':
      return 'The Slack callback did not include a login code. Start the sign-in flow again.';
    case 'exchange-failed':
      return 'Admin sign-in could not be completed. Start the Slack flow again.';
    default:
      return null;
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const bootstrap = await getAdminBootstrapStatus();
  const params = searchParams ? await searchParams : undefined;
  const errorCopy = getErrorCopy(params?.error);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 md:px-6 lg:px-8">
      <div className="grid w-full gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="relative overflow-hidden border-border/60 bg-[linear-gradient(140deg,hsla(0,0%,100%,0.84)_0%,hsla(46,36%,97%,0.72)_100%)]">
          <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--primary),transparent)]" />
          <CardHeader className="gap-6 p-8 md:p-10">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="rounded-full bg-secondary/80 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-secondary-foreground">
                self-hosted control surface
              </Badge>
              <Badge
                className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-muted-foreground"
                variant="outline"
              >
                v1 read only
              </Badge>
            </div>
            <div className="max-w-2xl space-y-4">
              <CardTitle className="max-w-3xl text-5xl leading-none md:text-6xl">
                Bring your instance under command.
              </CardTitle>
              <CardDescription className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                The admin panel turns a self-hosted rs-tunnel deployment into an owner-operated operations room for
                traffic, tunnels, cleanup pressure, and workspace-wide visibility.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 p-8 pt-0 md:grid-cols-3 md:p-10 md:pt-0">
            {[
              {
                icon: Slack,
                title: 'Slack OpenID gate',
                body: 'Reuse the API-owned Slack flow without moving secrets into the browser app.',
              },
              {
                icon: ShieldCheck,
                title: 'Single owner seat',
                body: 'The first successful admin login claims ownership and keeps the console owner-only in v1.',
              },
              {
                icon: LockKeyhole,
                title: 'Read-only ops view',
                body: 'The first release prioritizes visibility, not mutation, to keep rollout risk low.',
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

        <Card className="border-border/60">
          <CardHeader className="p-8">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Admin bootstrap</div>
            <CardTitle className="text-3xl">Claim the owner seat</CardTitle>
            <CardDescription className="text-sm leading-6">
              Slack sign-in still enforces the configured email-domain and workspace restrictions on the API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-8 pt-0">
            <div className="rounded-[calc(var(--radius)-0.25rem)] border border-border/60 bg-muted/35 p-5">
              <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Owner status</div>
              <div className="mt-3 text-2xl font-semibold text-foreground">
                {bootstrap.ownerExists ? 'Owner already configured' : 'No owner claimed yet'}
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {bootstrap.firstLoginClaimsOwner
                  ? 'The first successful admin-panel Slack login will claim ownership of this instance.'
                  : 'Only the existing owner can sign in to the admin panel.'}
              </p>
            </div>

            {errorCopy ? (
              <div className="rounded-[calc(var(--radius)-0.25rem)] border border-destructive/20 bg-destructive/10 p-4 text-sm leading-6 text-destructive">
                {errorCopy}
              </div>
            ) : null}

            <Button asChild className="w-full justify-between" size="lg">
              <Link href="/api/auth/slack/start">
                Continue with Slack
                <ArrowRight className="size-4" />
              </Link>
            </Button>

            <p className="text-sm leading-6 text-muted-foreground">
              Existing CLI and API behavior stays unchanged. This owner gate applies only to the web admin panel.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
