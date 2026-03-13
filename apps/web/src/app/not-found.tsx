import Link from 'next/link';
import { ArrowLeft, SearchX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-8 md:px-6">
      <Card className="w-full">
        <CardHeader className="gap-5 p-8">
          <div className="inline-flex w-fit rounded-full border border-border/70 bg-background/80 p-3 text-primary">
            <SearchX className="size-5" />
          </div>
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Missing record</div>
            <CardTitle className="text-4xl">The requested tunnel was not found.</CardTitle>
            <CardDescription className="text-base leading-7">
              It may have been stopped, cleaned up, or never existed on this instance.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-8 pt-0">
          <Button asChild variant="outline">
            <Link href="/tunnels">
              <ArrowLeft className="size-4" />
              Return to registry
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
