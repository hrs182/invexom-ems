import * as React from 'react';
import { useApp } from '../../stores/app';
import { t } from '../../i18n/index';
import { ThemeSwitcher } from './theme-switcher';
import { Menu, Tooltip } from './primitives';
import { Badge } from './badge';
import { cn } from '../../lib/cn';

export function Topbar({ onOpenSearch, onNavigate }: { onOpenSearch: () => void; onNavigate: (k: string) => void }) {
  const { status, user, logout } = useApp();
  const license = status?.license;
  const health = status?.backupHealth;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); onOpenSearch(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenSearch]);

  return (
    <header className="no-print flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      {/* Global search (Ctrl+K) */}
      <button
        onClick={onOpenSearch}
        className="transition-soft flex h-10 max-w-md flex-1 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 text-sm text-muted hover:border-faint hover:text-text"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <span className="truncate">{t('common.search')}…</span>
        <kbd className="ml-auto rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-faint">Ctrl K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {/* Demo badge */}
        {license && (license.mode === 'demo' || license.mode === 'demo-expired') && (
          <Tooltip label={t('license.watermarkNote')}>
            <Badge tone="warning" className="cursor-default">{t('app.demoBadge')}</Badge>
          </Tooltip>
        )}
        {license?.mode === 'licensed' && (
          <Badge tone="success" className="cursor-default">{license.tierLabel}</Badge>
        )}

        {/* Backup health dot (FR-BKP-02) */}
        <Tooltip label={health?.overdue ? t('backup.overdue') : t('backup.healthy')}>
          <button
            onClick={() => onNavigate('backup')}
            aria-label={t('backup.healthTitle')}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full cursor-pointer',
              health?.overdue ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success',
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-current" />
          </button>
        </Tooltip>

        <ThemeSwitcher />

        {/* User menu */}
        {user && (
          <Menu
            trigger={
              <button className="transition-soft flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 hover:bg-surface-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand" aria-hidden>
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
                <span className="max-w-32 truncate text-sm font-medium">{user.displayName}</span>
              </button>
            }
            items={[
              { label: t('auth.changePassword'), onSelect: () => onNavigate('users') },
              { label: t('nav.help'), onSelect: () => onNavigate('help') },
              { label: t('auth.signOut'), danger: true, onSelect: () => void logout() },
            ]}
          />
        )}
      </div>
    </header>
  );
}
