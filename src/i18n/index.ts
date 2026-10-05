import en from './en.json';

/**
 * Typed i18n. ALL user-visible strings live in JSON files (en.json now;
 * hi.json / ta.json in Phase 2) — no hardcoded UI text in components.
 * Translation is data, not code changes (NFR-U-01, FR-SET-08).
 */
export type Dict = typeof en;
type Join<K, P> = K extends string | number
  ? P extends string | number ? `${K}.${P}` : never
  : never;
export type DictPath = {
  [K in keyof Dict]: Dict[K] extends Record<string, unknown>
    ? Join<K, DictPathOf<Dict[K]>>
    : K;
}[keyof Dict];
type DictPathOf<T> = {
  [K in keyof T]: T[K] extends Record<string, unknown> ? Join<K, DictPathOf<T[K]>> : K;
}[keyof T];

let dict: Record<string, unknown> = en as unknown as Record<string, unknown>;
let lang = 'en';

export function setLanguage(next: 'en' | 'hi' | 'ta', nextDict: Record<string, unknown>): void {
  lang = next;
  dict = nextDict;
}
export function getLanguage(): string { return lang; }

function lookup(path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dict);
}

/** t('setup.title') / t('license.daysLeft', { n: 12 }) */
export function t(path: DictPath, vars?: Record<string, string | number>): string {
  const raw = lookup(path as string);
  if (typeof raw !== 'string') return path as string;
  return interpolate(raw, vars);
}

/** Untyped escape hatch for dynamic keys (e.g. nav built from module lists). */
export function tx(path: string, vars?: Record<string, string | number>): string {
  const raw = lookup(path);
  if (typeof raw !== 'string') return path;
  return interpolate(raw, vars);
}

function interpolate(raw: string, vars?: Record<string, string | number>): string {
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, k: string) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}
