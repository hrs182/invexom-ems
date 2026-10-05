import * as React from 'react';
import { Dialog as RDialog } from 'radix-ui';
import { cn } from '../../lib/cn';

/** Centered dialog, max-height 90vh with internal scroll (SRS 4.4). */
export function Dialog({
  open, onOpenChange, title, description, children, wide,
}: {
  open: boolean; onOpenChange: (open: boolean) => void;
  title: string; description?: string; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-[fadeIn_120ms_ease]" />
        <RDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
            'overflow-y-auto rounded-xl border border-border bg-surface text-text shadow-[var(--shadow-lg)]',
            wide ? 'max-w-3xl' : 'max-w-lg',
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-2">
            <div>
              <RDialog.Title className="text-[18px] font-semibold tracking-tight">{title}</RDialog.Title>
              {description && <RDialog.Description className="mt-1 text-[13px] text-muted">{description}</RDialog.Description>}
            </div>
            <RDialog.Close
              className="transition-soft rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </RDialog.Close>
          </div>
          <div className="px-6 py-4">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
