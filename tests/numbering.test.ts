import { describe, it, expect, beforeAll } from 'vitest';
import { openDatabase, closeDatabase, getDb } from '../electron/services/database';
import { formatPattern, nextNumber, peekNumber } from '../electron/services/numbering';

describe('atomic numbering (BR-01, NFR-R-01)', () => {
  beforeAll(() => {
    openDatabase(':memory:');
    getDb().prepare("INSERT INTO numbering (key, label, pattern) VALUES ('receipt', 'Fee receipt', 'R-{YYYY}-{SEQ:5}')").run();
  });

  it('formats patterns correctly', () => {
    const d = new Date(2026, 9, 4);
    expect(formatPattern('R-{YYYY}-{SEQ:5}', 1, d)).toBe('R-2026-00001');
    expect(formatPattern('INV/{YY}/{MM}/{SEQ:4}', 42, d)).toBe('INV/26/10/0042');
    expect(formatPattern('EMP-{SEQ:3}', 7, d)).toBe('EMP-007');
  });

  it('allocates sequential numbers with no gaps', () => {
    const a = nextNumber('receipt', new Date(2026, 0, 1));
    const b = nextNumber('receipt', new Date(2026, 0, 1));
    const c = nextNumber('receipt', new Date(2026, 0, 1));
    expect(a).toBe('R-2026-00001');
    expect(b).toBe('R-2026-00002');
    expect(c).toBe('R-2026-00003');
  });

  it('peek does not consume a number', () => {
    const p1 = peekNumber('receipt');
    const p2 = peekNumber('receipt');
    expect(p1).toBe(p2);
    const next = nextNumber('receipt', new Date(2026, 0, 1));
    expect(next).toBe(p1);
  });

  it('throws on unknown keys', () => {
    expect(() => nextNumber('nope')).toThrow('unknown-numbering-key');
  });

  it('closes cleanly', () => {
    closeDatabase();
    expect(() => getDb()).toThrow('database-not-open');
  });
});
