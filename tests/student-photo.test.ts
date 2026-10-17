/**
 * Student photo (photo_path) round-trip: create with photo, read it back,
 * update/clear it. The UI stores a downscaled data URL; the service just
 * persists the string.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { openDatabase, closeDatabase, getDb } from '../electron/services/database';
import { createStudent, getStudent, updateStudent } from '../electron/services/students';
import { seedRoles } from '../electron/services/users';
import type { SafeUser } from '../shared/types';

const admin = { id: 1, username: 'admin' } as SafeUser;
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('student photo_path', () => {
  beforeAll(() => {
    closeDatabase();
    openDatabase(':memory:');
    const db = getDb();
    seedRoles();
    db.prepare("INSERT INTO sessions (id, name, start_date, end_date, is_active) VALUES (1, '2026-27', '2026-04-01', '2027-03-31', 1)").run();
    db.prepare("INSERT INTO numbering (key, label, pattern) VALUES ('admission', 'Admission', 'INV/{YYYY}/{SEQ:4}')").run();
    db.prepare("INSERT INTO users (id, username, display_name, password_hash, role_id) VALUES (1, 'admin', 'Admin', 'x', 1)").run();
  });

  it('persists photo_path on create and returns it on get', () => {
    const { id } = createStudent(
      { name: 'Photo Student', class_name: 'V', section: 'A', photo_path: PHOTO },
      1, admin, true,
    );
    const got = getStudent(id);
    expect(got?.photo_path).toBe(PHOTO);
  });

  it('updates and clears photo_path', () => {
    const { id } = createStudent({ name: 'Photo Student 2', class_name: 'V', section: 'A' }, 1, admin, true);
    expect(getStudent(id)?.photo_path).toBeNull();
    updateStudent(id, { photo_path: PHOTO }, admin);
    expect(getStudent(id)?.photo_path).toBe(PHOTO);
    updateStudent(id, { photo_path: null }, admin);
    expect(getStudent(id)?.photo_path).toBeNull();
  });
});
