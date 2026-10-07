import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, closeDatabase, getDb } from '../electron/services/database';
import { seedSetupMasters } from '../electron/services/setup';

const count = (kind: string) =>
  (getDb().prepare('SELECT COUNT(*) AS n FROM masters WHERE kind = ?').get(kind) as { n: number }).n;

const names = (kind: string) =>
  (getDb().prepare('SELECT name FROM masters WHERE kind = ? ORDER BY name').all(kind) as { name: string }[]).map((r) => r.name);

describe('setup seed: masters (regression — UNIQUE(kind,name) must never fail setup)', () => {
  beforeEach(() => {
    closeDatabase();
    openDatabase(':memory:'); // runs the real migrations, including the UNIQUE(kind, name) constraint
  });

  it('seeds classes, sections and fee heads on the happy path', () => {
    seedSetupMasters(
      getDb(),
      [{ name: 'V', sections: ['A', 'B'] }],
      [{ name: 'Tuition Fee', type: 'periodic' }],
    );
    expect(count('class')).toBe(1);
    expect(count('section')).toBe(2);
    expect(count('fee-head')).toBe(1);
    expect(names('fee-head')).toEqual(['Tuition Fee']);
  });

  it('ignores duplicate fee-head names instead of throwing (the reported bug)', () => {
    // This exact payload shape is what the wizard sent when the user re-added
    // "Tuition Fee" via "Add fee head" — it used to roll back the whole setup.
    expect(() =>
      seedSetupMasters(getDb(), [], [
        { name: 'Tuition Fee', type: 'periodic' },
        { name: 'Transport Fee', type: 'periodic' },
        { name: 'Tuition Fee', type: 'optional' }, // duplicate!
        { name: 'tuition fee', type: 'optional' }, // different case: SQLite UNIQUE is case-sensitive, kept as-is
      ]),
    ).not.toThrow();
    expect(count('fee-head')).toBe(3);
  });

  it('ignores duplicate class and section names', () => {
    expect(() =>
      seedSetupMasters(getDb(), [
        { name: 'V', sections: ['A', 'A', 'B'] },
        { name: 'V', sections: [] }, // duplicate class
      ], []),
    ).not.toThrow();
    expect(count('class')).toBe(1);
    expect(count('section')).toBe(2);
  });

  it('skips blank names', () => {
    seedSetupMasters(
      getDb(),
      [{ name: '   ', sections: [''] }],
      [{ name: '', type: 'periodic' }],
    );
    expect(count('class')).toBe(0);
    expect(count('section')).toBe(0);
    expect(count('fee-head')).toBe(0);
  });

  it('is idempotent: running twice keeps a single copy of everything', () => {
    const classes = [{ name: 'V', sections: ['A'] }];
    const heads = [{ name: 'Tuition Fee', type: 'periodic' }];
    seedSetupMasters(getDb(), classes, heads);
    expect(() => seedSetupMasters(getDb(), classes, heads)).not.toThrow();
    expect(count('class')).toBe(1);
    expect(count('section')).toBe(1);
    expect(count('fee-head')).toBe(1);
  });
});
