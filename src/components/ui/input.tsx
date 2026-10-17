import * as React from 'react';
import { cn } from '../../lib/cn';
import { t } from '../../i18n/index';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ error, className, ...rest }, ref) => (
  <input
    ref={ref}
    className={cn(
      'transition-soft h-10 w-full rounded-xl border bg-surface px-3 text-sm text-text placeholder:text-faint',
      error ? 'border-danger' : 'border-border-strong hover:border-faint',
      'disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-surface-2',
      className,
    )}
    {...rest}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'transition-soft min-h-20 w-full rounded-xl border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-faint hover:border-faint',
        className,
      )}
      {...rest}
    />
  ),
);
Textarea.displayName = 'Textarea';

export function Label({ className, optional, required, children, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement> & { optional?: boolean; required?: boolean }) {
  return (
    <label className={cn('mb-1.5 block text-[13px] font-medium text-text', className)} {...rest}>
      {children}
      {required && <span className="text-danger" aria-hidden> *</span>}
      {optional && <span className="ml-1 font-normal text-faint">({t('common.optional')})</span>}
    </label>
  );
}

/** Label + control + optional hint/error, with comfortable max width. */
export function Field({
  label, hint, error, required, optional, children, className,
}: {
  label: string; hint?: string; error?: string; required?: boolean; optional?: boolean;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('max-w-xl', className)}>
      <Label>
        {label}
        {required && <span className="text-danger" aria-hidden> *</span>}
        {optional && <span className="ml-1 font-normal text-faint">({t('common.optional')})</span>}
      </Label>
      {children}
      {error ? <p className="mt-1 text-[13px] text-danger" role="alert">{error}</p>
        : hint ? <p className="mt-1 text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}
