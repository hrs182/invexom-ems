import * as React from 'react';
import { cn } from '../../lib/cn';
import { Button } from './button';

/**
 * Friendly, illustration-free empty state with the single primary action
 * (SRS UX-04). Never a blank grid.
 */
export function EmptyState({
  title, actionLabel, onAction, hint, className,
}: {
  title: string; actionLabel?: string; onAction?: () => void; hint?: string; className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-faint" aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="16" rx="3" /><path d="M12 8v6M9 11h6" />
        </svg>
      </div>
      <p className="text-[15px] font-medium text-text">{title}</p>
      {hint && <p className="max-w-sm text-[13px] text-muted">{hint}</p>}
      {actionLabel && onAction && <Button onClick={onAction} className="mt-1">{actionLabel}</Button>}
    </div>
  );
}

export function PageHeader({
  title, subtitle, actions, className,
}: {
  title: string; subtitle?: string; actions?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-start justify-between gap-3', className)}>
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label, value, sub, tone = 'default', icon,
}: {
  label: string; value: string; sub?: string;
  tone?: 'default' | 'brand' | 'success' | 'warning' | 'danger';
  icon?: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    default: 'text-text', brand: 'text-brand', success: 'text-success', warning: 'text-warning', danger: 'text-danger',
  };
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {icon && <span className={cn('text-faint', tones[tone])} aria-hidden>{icon}</span>}
      </div>
      <p className={cn('mt-1 text-[28px] leading-9 font-semibold tracking-tight', tones[tone])}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-faint">{sub}</p>}
    </div>
  );
}

export function Alert({ tone = 'brand', title, children, className }: {
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  title?: string; children: React.ReactNode; className?: string;
}) {
  const tones = {
    brand: 'border-brand bg-brand-soft text-text',
    success: 'border-success bg-success-soft text-text',
    warning: 'border-warning bg-warning-soft text-text',
    danger: 'border-danger bg-danger-soft text-text',
  } as const;
  return (
    <div className={cn('rounded-xl border-l-4 px-4 py-3 text-sm', tones[tone], className)} role="alert">
      {title && <p className="font-semibold">{title}</p>}
      <div className="mt-0.5 leading-relaxed">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
