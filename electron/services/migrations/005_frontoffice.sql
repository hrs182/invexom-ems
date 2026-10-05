-- Migration 005: Front office (Milestone 5)

CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  class_interested TEXT DEFAULT '',
  source TEXT DEFAULT '',
  followup_date TEXT DEFAULT (date('now')),
  counsellor TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open', -- open|converted|lost
  converted_student_id INTEGER REFERENCES students(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_enquiries_followup ON enquiries(followup_date, status);

CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  date TEXT NOT NULL DEFAULT (date('now')),
  outcome TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL DEFAULT (date('now')),
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  purpose TEXT DEFAULT '',
  whom_to_meet TEXT DEFAULT '',
  in_time TEXT DEFAULT '',
  out_time TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL DEFAULT (date('now')),
  complainant TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  type TEXT DEFAULT '',
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open', -- open|in-progress|resolved
  resolved_at TEXT,
  notes TEXT DEFAULT ''
);

-- Search index for enquiries
CREATE TRIGGER IF NOT EXISTS trg_enquiries_search_ai AFTER INSERT ON enquiries BEGIN
  INSERT INTO global_search (kind, ref_id, title, subtitle, tokens)
  VALUES ('enquiry', NEW.id, NEW.name, NEW.phone || ' · ' || NEW.class_interested, NEW.name || ' ' || NEW.phone);
END;
CREATE TRIGGER IF NOT EXISTS trg_enquiries_search_ad AFTER DELETE ON enquiries BEGIN
  DELETE FROM global_search WHERE kind = 'enquiry' AND ref_id = OLD.id;
END;
