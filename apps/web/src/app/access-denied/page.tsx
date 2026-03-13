import Link from 'next/link';
import { ArrowLeft, UserX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default function AccessDeniedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-8 md:px-6">
      <Card className="w-full">
        <CardHeader className="gap-5 p-8">
          <div className="inline-flex w-fit rounded-full border border-border/70 bg-background/80 p-3 text-primary">
            <UserX className="size-5" />
          </div>
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Owner required</div>
            <CardTitle className="text-4xl">This console is already claimed.</CardTitle>
            <CardDescription className="max-w-2xl text-base leading-7">
              Your Slack identity passed the workspace and email checks, but the admin panel only admits the instance
              owner in v1. The first successful admin-panel login has already claimed that seat.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-8 pt-0">
          <div className="rounded-[calc(var(--radius)-0.25rem)] border border-border/60 bg-muted/35 p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Access model</div>
            <div className="mt-3 text-2xl font-semibold text-foreground">Single owner seat</div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              You can still use the existing CLI and API if your workspace and email are allowed; only the admin panel
              is owner-restricted.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/login">
              <ArrowLeft className="size-4" />
              Back to login
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
