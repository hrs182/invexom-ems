-- 007: Allow same section name under different classes.
-- Change masters UNIQUE(kind, name) -> UNIQUE(kind, name, extra)
-- so "A" can exist for class I and class II (extra differs).

-- SQLite cannot drop a constraint; rebuild the table.
CREATE TABLE IF NOT EXISTS masters_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  extra TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(kind, name, extra)
);
CREATE INDEX IF NOT EXISTS idx_masters_kind_new ON masters_new(kind);

INSERT OR IGNORE INTO masters_new (id, kind, name, extra, sort_order, is_active, created_at)
  SELECT id, kind, name, extra, sort_order, is_active, created_at FROM masters;

DROP TABLE masters;
ALTER TABLE masters_new RENAME TO masters;
CREATE INDEX IF NOT EXISTS idx_masters_kind ON masters(kind);
