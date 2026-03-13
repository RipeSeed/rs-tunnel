import * as React from 'react';

import { cn } from '@/lib/utils';

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  decorative?: boolean;
  orientation?: 'horizontal' | 'vertical';
}) {
  return (
    <div
      aria-hidden={decorative}
      className={cn(
        'shrink-0 bg-border/70',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
