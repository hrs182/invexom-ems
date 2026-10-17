import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openDatabase, closeDatabase, getDb } from '../electron/services/database';
import { masterSubjectClass, assertSubjectNameAvailable, setSubjectsClass } from '../electron/services/masters';

const V = JSON.stringify({ class: 'V' });
const VI = JSON.stringify({ class: 'VI' });

describe('per-class subject masters', () => {
  beforeAll(() => {
    openDatabase(':memory:');
  });
  afterAll(() => {
    closeDatabase();
  });

  it('parses the class from extra JSON', () => {
    expect(masterSubjectClass(V)).toBe('V');
    expect(masterSubjectClass('{}')).toBe('');
    expect(masterSubjectClass('')).toBe('');
    expect(masterSubjectClass(null)).toBe('');
    expect(masterSubjectClass('not-json')).toBe('');
  });

  it('allows the same subject name in different classes, blocks it within a class', () => {
    const db = getDb();
    const ins = db.prepare("INSERT INTO masters (kind, name, extra) VALUES ('subject', ?, ?)");
    ins.run('Mathematics', V);

    // same name, different class -> allowed
    expect(() => assertSubjectNameAvailable('Mathematics', VI)).not.toThrow();
    ins.run('Mathematics', VI);

    // same name, same class -> blocked (case-insensitive)
    expect(() => assertSubjectNameAvailable('mathematics', V)).toThrow('name-exists');

    // legacy unassigned ('') is its own bucket: allowed alongside class rows...
    expect(() => assertSubjectNameAvailable('Mathematics', '')).not.toThrow();
    const legacyId = Number(ins.run('Mathematics', '').lastInsertRowid);
    // ...but blocked twice in the legacy bucket
    expect(() => assertSubjectNameAvailable('Mathematics', '{}')).toThrow('name-exists');

    // ignoreId lets a rename keep its own name
    expect(() => assertSubjectNameAvailable('Mathematics', V, 999999)).toThrow('name-exists');
    const vId = (db.prepare("SELECT id FROM masters WHERE kind='subject' AND name='Mathematics' AND extra=?").get(V) as { id: number }).id;
    expect(() => assertSubjectNameAvailable('Mathematics', V, vId)).not.toThrow();
    expect(legacyId).toBeGreaterThan(0);
  });

  it('setSubjectsClass moves only legacy rows and skips name clashes', () => {
    const db = getDb();
    const ins = db.prepare("INSERT INTO masters (kind, name, extra) VALUES ('subject', ?, ?)");
    const artId = Number(ins.run('Art', '').lastInsertRowid);
    const sciLegacyId = Number(ins.run('Science', '').lastInsertRowid);
    ins.run('Science', V); // clash target already has Science

    const moved = setSubjectsClass([artId, sciLegacyId, 123456], 'V');
    expect(moved).toBe(1); // only Art moves; Science clashes, 123456 doesn't exist

    const artExtra = (db.prepare('SELECT extra FROM masters WHERE id=?').get(artId) as { extra: string }).extra;
    expect(masterSubjectClass(artExtra)).toBe('V');
    const sciExtra = (db.prepare('SELECT extra FROM masters WHERE id=?').get(sciLegacyId) as { extra: string }).extra;
    expect(masterSubjectClass(sciExtra)).toBe(''); // untouched
  });

  it('setSubjectsClass rejects empty class', () => {
    expect(() => setSubjectsClass([1], '')).toThrow('invalid-input');
    expect(() => setSubjectsClass([], 'V')).toThrow('invalid-input');
  });
});
