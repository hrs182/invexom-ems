import * as React from 'react';
import { Switch as RSwitch, Tabs as RTabs, Tooltip as RTooltip, Checkbox as RCheckbox, Separator as RSeparator, DropdownMenu as RMenu } from 'radix-ui';
import { cn } from '../../lib/cn';

export function Switch({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text">
      <RSwitch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="transition-soft relative h-6 w-11 rounded-full bg-surface-3 data-[state=checked]:bg-brand"
      >
        <RSwitch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </RSwitch.Root>
      {label}
    </label>
  );
}

export function Tabs({ tabs, value, onValueChange }: {
  tabs: { value: string; label: string; content: React.ReactNode }[];
  value?: string; onValueChange?: (v: string) => void;
}) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange} defaultValue={tabs[0]?.value}>
      <RTabs.List className="mb-4 flex gap-1 overflow-x-auto border-b border-border" aria-label="Sections">
        {tabs.map((tab) => (
          <RTabs.Trigger
            key={tab.value}
            value={tab.value}
            className="transition-soft -mb-px cursor-pointer border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted whitespace-nowrap hover:text-text data-[state=active]:border-brand data-[state=active]:text-brand"
          >
            {tab.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {tabs.map((tab) => (
        <RTabs.Content key={tab.value} value={tab.value}>{tab.content}</RTabs.Content>
      ))}
    </RTabs.Root>
  );
}

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <RTooltip.Provider delayDuration={300}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
        <RTooltip.Portal>
          <RTooltip.Content
            sideOffset={6}
            className="z-50 rounded-lg border border-border bg-surface-3 px-2.5 py-1.5 text-xs text-text shadow-[var(--shadow)]"
          >
            {label}
          </RTooltip.Content>
        </RTooltip.Portal>
      </RTooltip.Root>
    </RTooltip.Provider>
  );
}

export function Checkbox({ checked, onCheckedChange, label }: {
  checked: boolean | 'indeterminate'; onCheckedChange: (v: boolean) => void; label?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text">
      <RCheckbox.Root
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="transition-soft flex h-5 w-5 items-center justify-center rounded-md border border-border-strong bg-surface hover:border-brand data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-brand-ink"
      >
        <RCheckbox.Indicator aria-hidden>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      {label}
    </label>
  );
}

export function Separator({ className }: { className?: string }) {
  return <RSeparator.Root className={cn('bg-border', className)} orientation="horizontal" style={{ height: 1 }} />;
}

export function Menu({ trigger, items }: {
  trigger: React.ReactNode;
  items: { label: string; danger?: boolean; onSelect: () => void }[];
}) {
  return (
    <RMenu.Root>
      <RMenu.Trigger asChild>{trigger}</RMenu.Trigger>
      <RMenu.Portal>
        <RMenu.Content
          sideOffset={6}
          className="z-[70] min-w-44 rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow-lg)]"
        >
          {items.map((item, i) => (
            <RMenu.Item
              key={i}
              onSelect={item.onSelect}
              className={cn(
                'cursor-pointer rounded-lg px-3 py-2 text-sm outline-none hover:bg-surface-2 focus:bg-surface-2',
                item.danger ? 'text-danger' : 'text-text',
              )}
            >
              {item.label}
            </RMenu.Item>
          ))}
        </RMenu.Content>
      </RMenu.Portal>
    </RMenu.Root>
  );
}
