import { describe, it, expect } from 'vitest';
import { toUserError, errorDetail } from '../electron/services/errors';

describe('toUserError: professional error mapping', () => {
  it('maps ENOENT to a friendly message with a stable code (no raw path leak)', () => {
    const err = Object.assign(
      new Error("ENOENT: no such file or directory, open 'C:\\Users\\x\\invexom-ems.db.enc'"),
      { code: 'ENOENT' },
    );
    const ue = toUserError(err);
    expect(ue.code).toBe('file-not-found');
    expect(ue.message).not.toContain('ENOENT');
    expect(ue.message).not.toContain('C:\\');
    expect(ue.message.length).toBeGreaterThan(10);
  });

  it('maps EACCES/EPERM to access-denied guidance', () => {
    for (const code of ['EACCES', 'EPERM']) {
      const ue = toUserError(Object.assign(new Error('denied'), { code }));
      expect(ue.code).toBe('file-access-denied');
      expect(ue.message).toMatch(/administrator/i);
    }
  });

  it('maps ENOSPC to disk-full guidance', () => {
    const ue = toUserError(Object.assign(new Error('no space'), { code: 'ENOSPC' }));
    expect(ue.code).toBe('disk-full');
  });

  it('maps SQLite errors without leaking internals', () => {
    const ue = toUserError(Object.assign(new Error('SQLITE_CORRUPT: database disk image is malformed'), { code: 'SQLITE_CORRUPT' }));
    expect(ue.code).toBe('database-error');
    expect(ue.message).not.toContain('SQLITE_CORRUPT');
  });

  it('keeps intentional app codes intact with friendly messages', () => {
    const ue = toUserError(new Error('already-initialized'));
    expect(ue.code).toBe('already-initialized');
    expect(ue.message).toMatch(/already been completed/i);
  });

  it('preserves renderer branch codes verbatim', () => {
    expect(toUserError(new Error('duplicate-found')).code).toBe('duplicate-found');
    expect(toUserError(new Error('cancelled')).code).toBe('cancelled');
  });

  it('falls back to a generic safe message for unknown errors', () => {
    const ue = toUserError(new Error('some bizarre internal failure xyz'));
    expect(ue.code).toBe('unexpected-error');
    expect(ue.message).not.toContain('xyz');
  });

  it('errorDetail keeps the technical message (no stack) for support', () => {
    const d = errorDetail(new Error('ENOENT: something'));
    expect(d).toBe('ENOENT: something');
    expect(d).not.toContain('at ');
  });
});
