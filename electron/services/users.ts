import { getDb } from './database.js';
import { hashPassword, verifyPassword } from './secure-store.js';
import type { ModuleKey, PermissionLevel, SafeUser, UserRow, RoleRow } from '../../shared/types.js';

/**
 * Users & roles (FR-SET-07, PERM-01). Passwords are scrypt hashes.
 * System roles seeded at setup per the SRS Section 3 matrix.
 */

export const MODULES: ModuleKey[] = [
  'dashboard', 'students', 'fees', 'attendance', 'exams', 'cards',
  'staff', 'accounting', 'inventory', 'transport', 'library',
  'frontoffice', 'reports', 'settings', 'backup', 'users',
];

const LEVEL_RANK: Record<PermissionLevel, number> = { none: 0, view: 1, edit: 2, print: 3, admin: 4 };

export function can(user: SafeUser | null, module: ModuleKey, need: PermissionLevel): boolean {
  if (!user) return false;
  return (LEVEL_RANK[user.permissions[module] ?? 'none'] ?? 0) >= LEVEL_RANK[need];
}

function parsePermissions(json: string): Record<ModuleKey, PermissionLevel> {
  const out = {} as Record<ModuleKey, PermissionLevel>;
  let raw: Record<string, string> = {};
  try { raw = JSON.parse(json) as Record<string, string>; } catch { /* ignore */ }
  for (const m of MODULES) {
    const v = raw[m] as PermissionLevel | undefined;
    out[m] = v === 'view' || v === 'edit' || v === 'print' || v === 'admin' ? v : 'none';
  }
  return out;
}

export function toSafeUser(row: Record<string, unknown>): SafeUser {
  return {
    id: Number(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    roleId: Number(row.role_id),
    roleName: String(row.role_name),
    permissions: parsePermissions(String(row.permissions ?? '{}')),
    mustChangePassword: Number(row.must_change_password ?? 0) === 1,
  };
}

export function findUserForLogin(username: string): (Record<string, unknown> & { password_hash: string }) | null {
  const row = getDb().prepare(
    `SELECT u.*, r.name AS role_name, r.permissions FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.username = ? COLLATE NOCASE AND u.is_deleted = 0`,
  ).get(username) as (Record<string, unknown> & { password_hash: string }) | undefined;
  return row ?? null;
}

export function verifyLogin(username: string, password: string): SafeUser | null {
  const row = findUserForLogin(username);
  if (!row || Number(row.is_active) !== 1) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  getDb().prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(row.id);
  return toSafeUser(row);
}

export function seedRoles(): void {
  const db = getDb();
  const all = (level: PermissionLevel): Record<ModuleKey, PermissionLevel> =>
    Object.fromEntries(MODULES.map((m) => [m, level])) as Record<ModuleKey, PermissionLevel>;
  const roles: { name: string; isSystem: number; permissions: Record<ModuleKey, PermissionLevel> }[] = [
    { name: 'Administrator', isSystem: 1, permissions: all('admin') },
    {
      name: 'Accountant', isSystem: 1,
      permissions: { ...all('none'), dashboard: 'view', students: 'view', fees: 'print', staff: 'view', accounting: 'print', reports: 'print' },
    },
    {
      name: 'Teacher', isSystem: 1,
      permissions: { ...all('none'), dashboard: 'view', students: 'view', attendance: 'edit', exams: 'edit' },
    },
    {
      name: 'Front-office', isSystem: 1,
      permissions: { ...all('none'), dashboard: 'view', students: 'edit', frontoffice: 'print', cards: 'print' },
    },
    {
      name: 'Librarian', isSystem: 1,
      permissions: { ...all('none'), dashboard: 'view', library: 'print' },
    },
  ];
  for (const r of roles) {
    db.prepare('INSERT OR IGNORE INTO roles (name, is_system, permissions) VALUES (?, ?, ?)')
      .run(r.name, r.isSystem, JSON.stringify(r.permissions));
  }
}

export function listUsers(): UserRow[] {
  return getDb().prepare(
    `SELECT u.id, u.username, u.display_name AS displayName, u.role_id AS roleId, r.name AS roleName,
            u.is_active AS isActive, u.last_login AS lastLogin
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.is_deleted = 0 ORDER BY u.username`,
  ).all() as UserRow[];
}

export function createUser(username: string, displayName: string, password: string, roleId: number): number {
  if (password.length < 8) throw new Error('password-too-short');
  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND is_deleted = 0').get(username);
  if (exists) throw new Error('username-taken');
  const r = db.prepare('INSERT INTO users (username, display_name, password_hash, role_id) VALUES (?, ?, ?, ?)')
    .run(username.trim(), displayName.trim(), hashPassword(password), roleId);
  return Number(r.lastInsertRowid);
}

export function listRoles(): RoleRow[] {
  const rows = getDb().prepare('SELECT id, name, is_system AS isSystem, permissions FROM roles ORDER BY name').all() as {
    id: number; name: string; isSystem: number; permissions: string;
  }[];
  return rows.map((r) => ({ id: r.id, name: r.name, isSystem: r.isSystem === 1, permissions: parsePermissions(r.permissions) }));
}

export function saveRole(id: number | undefined, name: string, permissions: Record<ModuleKey, PermissionLevel>): number {
  const db = getDb();
  if (id == null) {
    const r = db.prepare('INSERT INTO roles (name, is_system, permissions) VALUES (?, 0, ?)').run(name.trim(), JSON.stringify(permissions));
    return Number(r.lastInsertRowid);
  }
  const row = db.prepare('SELECT is_system FROM roles WHERE id = ?').get(id) as { is_system: number } | undefined;
  if (!row) throw new Error('role-not-found');
  if (row.is_system === 1) throw new Error('cannot-edit-system-role');
  db.prepare('UPDATE roles SET name = ?, permissions = ? WHERE id = ?').run(name.trim(), JSON.stringify(permissions), id);
  return id;
}
