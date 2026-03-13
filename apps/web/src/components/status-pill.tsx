import { type TunnelStatus, tunnelStatusSchema } from '@ripeseed/shared';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function StatusPill({ status }: { status: TunnelStatus }) {
  const normalizedStatus = tunnelStatusSchema.parse(status);
  const toneClassName = {
    active: 'border-emerald-600/20 bg-emerald-600/10 text-emerald-700',
    creating: 'border-sky-600/20 bg-sky-600/10 text-sky-700',
    stopping: 'border-amber-600/20 bg-amber-600/10 text-amber-700',
    stopped: 'border-slate-500/20 bg-slate-500/10 text-slate-700',
    failed: 'border-rose-600/20 bg-rose-600/10 text-rose-700',
  }[normalizedStatus];

  return (
    <Badge
      className={cn(
        'rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]',
        toneClassName,
      )}
      variant="outline"
    >
      {normalizedStatus}
    </Badge>
  );
}
