-- 008: Fee structure per section & per month + student transport fields.
-- fee_structure: add section + month_label; '' = applies to all.
-- students: add transport_allocated + transport_amount.

-- ---- fee_structure rebuild ----
CREATE TABLE IF NOT EXISTS fee_structure_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  class_name TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT '',
  head_id INTEGER NOT NULL REFERENCES masters(id),
  month_label TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  fine_flat REAL NOT NULL DEFAULT 0,
  fine_percent REAL NOT NULL DEFAULT 0,
  due_day INTEGER NOT NULL DEFAULT 10,
  UNIQUE(session_id, class_name, section, head_id, month_label)
);

INSERT OR IGNORE INTO fee_structure_new
  (id, session_id, class_name, section, head_id, month_label, amount, fine_flat, fine_percent, due_day)
  SELECT id, session_id, class_name, '', head_id, '', amount, fine_flat, fine_percent, due_day
  FROM fee_structure;

DROP TABLE fee_structure;
ALTER TABLE fee_structure_new RENAME TO fee_structure;

-- ---- students transport ----
ALTER TABLE students ADD COLUMN transport_allocated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE students ADD COLUMN transport_amount REAL NOT NULL DEFAULT 0;
