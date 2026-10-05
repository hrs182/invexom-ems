import * as React from 'react';
import { Select as RSelect } from 'radix-ui';
import { cn } from '../../lib/cn';

export function Select({
  value, onValueChange, options, placeholder, className, disabled,
}: {
  value?: string; onValueChange?: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
  className?: string; disabled?: boolean;
}) {
  return (
    <RSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RSelect.Trigger
        className={cn(
          'transition-soft flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border-strong bg-surface px-3 text-sm text-text hover:border-faint',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
      >
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content className="z-50 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow-lg)]" position="popper">
          <RSelect.Viewport>
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-text outline-none hover:bg-surface-2 focus:bg-surface-2 data-[state=checked]:font-medium"
              >
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                <RSelect.ItemIndicator aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg>
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}
