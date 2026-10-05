import { tx } from '../../i18n/index';
import { cn } from '../../lib/cn';
import type { ModuleKey } from '@shared/types';

/** Invexom mark: simple, crisp, theme-aware. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-xl bg-brand font-bold text-brand-ink select-none"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      aria-hidden
    >
      i
    </span>
  );
}

const NAV: { key: ModuleKey | 'help' | 'diagnostics' | 'licensing'; icon: React.ReactNode }[] = [
  { key: 'dashboard', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg> },
  { key: 'students', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></svg> },
  { key: 'fees', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg> },
  { key: 'attendance', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4m8-4v4M3 10h18M9 15l2 2 4-4" /></svg> },
  { key: 'exams', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg> },
  { key: 'cards', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="8" cy="11" r="2" /><path d="M5 17c.6-1.5 1.7-2 3-2s2.4.5 3 2M14 9h5m-5 4h5" /></svg> },
  { key: 'staff', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7h-9M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg> },
  { key: 'accounting', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg> },
  { key: 'inventory', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 2 9 5-9 5-9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></svg> },
  { key: 'frontoffice', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" /></svg> },
  { key: 'reports', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="M7 15v3m5-6v6m5-9v9" /></svg> },
  { key: 'settings', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg> },
  { key: 'users', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" /></svg> },
  { key: 'backup', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg> },
  { key: 'licensing', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><circle cx="12" cy="16" r="1.4" /></svg> },
  { key: 'diagnostics', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 8-6-16-3 8H2" /></svg> },
  { key: 'help', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.6-3 4.5M12 17.5h.01" /></svg> },
];

/** Add-on modules (transport/library) show only when the license unlocks them. */
const ADDON_NAV: { key: 'transport' | 'library'; icon: React.ReactNode }[] = [
  { key: 'transport', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 16V7a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v9M3 16h18M3 16v3m18-3v3" /><circle cx="7.5" cy="19" r="1.8" /><circle cx="16.5" cy="19" r="1.8" /><path d="M16 6V4h4l1 2" /></svg> },
  { key: 'library', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5Z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></svg> },
];

export function Sidebar({
  active, onNavigate, collapsed, addons,
}: {
  active: string; onNavigate: (key: string) => void; collapsed: boolean;
  addons: { transport: boolean; library: boolean };
}) {
  const items = [
    ...NAV.slice(0, 11),
    ...ADDON_NAV.filter((a) => addons[a.key]),
    ...NAV.slice(11),
  ];
  return (
    <nav
      className={cn(
        'flex h-full flex-col gap-0.5 overflow-y-auto border-r border-border bg-surface px-2 py-3',
        collapsed ? 'w-16 items-center' : 'w-60',
      )}
      aria-label="Main navigation"
    >
      {items.map((item) => {
        const isActive = active === item.key;
        const label = tx(`nav.${item.key}`);
        return (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            aria-current={isActive ? 'page' : undefined}
            title={collapsed ? label : undefined}
            className={cn(
              'transition-soft flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
              isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-text',
              collapsed && 'justify-center px-0',
            )}
          >
            <span aria-hidden className="shrink-0">{item.icon}</span>
            {!collapsed && <span className="truncate">{label}</span>}
          </button>
        );
      })}
    </nav>
  );
}
