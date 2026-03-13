'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cable, LayoutDashboard, Users } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/', label: 'Command View', short: 'Overview', icon: LayoutDashboard, code: '00' },
  { href: '/tunnels', label: 'Tunnel Registry', short: 'Tunnels', icon: Cable, code: '01' },
  { href: '/users', label: 'Workspace Roster', short: 'Users', icon: Users, code: '02' },
];

export function SideNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="grid gap-2">
      {LINKS.map((link) => {
        const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
        const Icon = link.icon;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              buttonVariants({ variant: active ? 'secondary' : 'ghost', size: 'lg' }),
              'h-auto justify-between rounded-[calc(var(--radius)-0.25rem)] px-4 py-4',
              active
                ? 'border border-border/70 bg-secondary/70 text-secondary-foreground shadow-sm'
                : 'hover:bg-background/70',
            )}
          >
            <span className="flex items-center gap-3">
              <span
                className={cn(
                  'rounded-full border border-border/60 p-2',
                  active ? 'bg-background/80 text-primary' : 'bg-muted/50 text-muted-foreground',
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="text-left">
                <span className="block text-sm font-semibold text-foreground">{link.short}</span>
                <span className="block text-xs text-muted-foreground">{link.label}</span>
              </span>
            </span>
            <span className="font-mono text-xs text-muted-foreground">{link.code}</span>
          </Link>
        );
      })}
    </nav>
  );
}
