-- Migration 001: Foundation (Milestone 1)
-- Institution, sessions, users/roles, masters, numbering, audit, backup, license store.
-- Later milestones add their tables in 002+, never edit this file after release.

-- Institution profile (single row, id=1)
CREATE TABLE IF NOT EXISTS institution (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  logo_path TEXT,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  website TEXT DEFAULT '',
  upi_id TEXT DEFAULT '',
  reg_no TEXT DEFAULT '',
  principal_name TEXT DEFAULT '',
  header_html TEXT DEFAULT '',
  footer_html TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Academic sessions
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  is_locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Roles with granular per-module permissions (JSON: module -> none|view|edit|print|admin)
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_system INTEGER NOT NULL DEFAULT 0,
  permissions TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users (passwords: scrypt hashes; DB unlock wraps live in keymeta.json)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0
);

-- Generic masters (classes, sections, subjects, fee heads, ledgers, leave types, sources, complaint types)
CREATE TABLE IF NOT EXISTS masters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  extra TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(kind, name)
);
CREATE INDEX IF NOT EXISTS idx_masters_kind ON masters(kind);

-- Document numbering: atomic sequences, no gaps (BR-01)
CREATE TABLE IF NOT EXISTS numbering (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  pattern TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0
);

-- Key-value rules / app settings (grade bands, thresholds, backup schedule...)
CREATE TABLE IF NOT EXISTS app_rules (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log (NFR-S-02)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  old_value TEXT,
  new_value TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);

-- Backup log
CREATE TABLE IF NOT EXISTS backup_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  file_name TEXT NOT NULL,
  path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'ok'
);

-- License store: parsed fields of the active .inelic file (LIC)
CREATE TABLE IF NOT EXISTS license_store (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tier TEXT,
  issued_to TEXT,
  issued_at TEXT,
  max_students INTEGER,
  max_devices INTEGER,
  addons_json TEXT NOT NULL DEFAULT '{}',
  hw_json TEXT NOT NULL DEFAULT '{}',
  activated_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Quick-start checklist state (dashboard)
CREATE TABLE IF NOT EXISTS checklist (
  key TEXT PRIMARY KEY,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT
);
