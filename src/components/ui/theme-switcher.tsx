import { useTheme, type ThemeMode } from '../../stores/theme';
import { t } from '../../i18n/index';
import { cn } from '../../lib/cn';
import { Tooltip } from './primitives';

/** Three-way Light / Dark / System switcher for the top bar (SRS 4.3). */
export function ThemeSwitcher() {
  const { mode, setMode } = useTheme();
  const options: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    {
      value: 'light', label: t('theme.light'),
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
    },
    {
      value: 'dark', label: t('theme.dark'),
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>,
    },
    {
      value: 'system', label: t('theme.system'),
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></svg>,
    },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-border bg-surface-2 p-1" role="group" aria-label={t('theme.label')}>
      {options.map((o) => (
        <Tooltip key={o.value} label={o.label}>
          <button
            onClick={() => setMode(o.value)}
            aria-pressed={mode === o.value}
            className={cn(
              'transition-soft flex h-7 w-8 cursor-pointer items-center justify-center rounded-lg',
              mode === o.value ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-text',
            )}
          >
            {o.icon}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
