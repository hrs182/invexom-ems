import * as React from 'react';
import { Slot } from 'radix-ui';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-hover shadow-sm',
  secondary: 'bg-surface-2 text-text hover:bg-surface-3 border border-border',
  outline: 'border border-border-strong text-text hover:bg-surface-2 bg-transparent',
  ghost: 'text-text hover:bg-surface-2 bg-transparent',
  danger: 'bg-danger text-white hover:brightness-110 shadow-sm',
  success: 'bg-success text-white hover:brightness-110 shadow-sm',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2',
  icon: 'h-10 w-10',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', asChild, loading, className, children, disabled, ...rest }, ref) => {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'transition-soft inline-flex items-center justify-center rounded-xl font-medium whitespace-nowrap',
          'disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
          variants[variant],
          sizes[size],
          className,
        )}
        {...rest}
      >
        {loading ? (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
        ) : children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
