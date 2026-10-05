import * as React from 'react';
import { Dialog } from './dialog';
import { Input } from './input';
import { EmptyState } from './feedback';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/index';
import type { SearchResult } from '@shared/types';

/** Global search command palette (Ctrl+K). FTS5 backend (Milestone 2). */
export function CommandPalette({ open, onOpenChange, onSelect }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  onSelect?: (kind: SearchResult['kind'], id: string | number) => void;
}) {
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) { setQ(''); setResults([]); return; }
  }, [open ]);

  React.useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    setBusy(true);
    const id = setTimeout(async () => {
      try { setResults(await invoke('search:query', { q: q.trim() })); }
      catch { setResults([]); }
      finally { setBusy(false); }
    }, 200);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('common.search')}>
      <Input
        autoFocus value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={t('empty.search')}
        onKeyDown={(e) => { if (e.key === 'Escape') onOpenChange(false); }}
      />
      <div className="mt-3 max-h-80 overflow-y-auto">
        {busy ? (
          <p className="py-6 text-center text-sm text-muted">{t('common.loading')}</p>
        ) : results.length === 0 ? (
          <EmptyState title={q.trim().length < 2 ? t('empty.search') : t('empty.search')} className="py-8" />
        ) : (
          <ul className="flex flex-col gap-1">
            {results.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <button
                  className="transition-soft w-full cursor-pointer rounded-xl px-3 py-2.5 text-left hover:bg-surface-2"
                  onClick={() => { onOpenChange(false); onSelect?.(r.kind, r.id); }}
                >
                  <p className="text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-muted">{r.subtitle}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
