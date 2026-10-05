import * as React from 'react';
import { cn } from '../../lib/cn';

type Tone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'muted';

const tones: Record<Tone, string> = {
  default: 'bg-surface-2 text-text border-border',
  brand: 'bg-brand-soft text-brand border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  muted: 'bg-transparent text-muted border-border',
};

export function Badge({ tone = 'default', className, ...rest }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
