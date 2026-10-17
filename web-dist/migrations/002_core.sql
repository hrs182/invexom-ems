-- Migration 002: Core school ops (Milestone 2)
-- Students/admissions, fee structure/dues/receipts, attendance, staff base, FTS5 search.

-- ============ STUDENTS ============
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admission_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  dob TEXT DEFAULT '',
  gender TEXT DEFAULT '',
  blood_group TEXT DEFAULT '',
  category TEXT DEFAULT '',
  religion TEXT DEFAULT '',
  nationality TEXT DEFAULT 'Indian',
  class_name TEXT NOT NULL DEFAULT '',
  section TEXT DEFAULT '',
  roll_no TEXT DEFAULT '',
  admission_date TEXT NOT NULL DEFAULT (date('now')),
  previous_school TEXT DEFAULT '',
  sibling_info TEXT DEFAULT '',
  father_name TEXT DEFAULT '',
  father_occupation TEXT DEFAULT '',
  father_phone TEXT DEFAULT '',
  mother_name TEXT DEFAULT '',
  mother_occupation TEXT DEFAULT '',
  mother_phone TEXT DEFAULT '',
  guardian_name TEXT DEFAULT '',
  guardian_phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  photo_path TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active|inactive|tc-issued|dropout|alumni
  session_id INTEGER REFERENCES sessions(id),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_name, section, status);
CREATE INDEX IF NOT EXISTS idx_students_name ON students(name);
CREATE INDEX IF NOT EXISTS idx_students_session ON students(session_id);

CREATE TABLE IF NOT EXISTS student_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  reason TEXT DEFAULT '',
  changed_by INTEGER REFERENCES users(id),
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  doc_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- submitted|pending
  notes TEXT DEFAULT '',
  UNIQUE(student_id, doc_type)
);

CREATE TABLE IF NOT EXISTS custom_field_defs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL, -- student|staff
  name TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text', -- text|number|date|dropdown
  options TEXT DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(entity, name)
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  field_id INTEGER NOT NULL REFERENCES custom_field_defs(id),
  value TEXT DEFAULT '',
  UNIQUE(entity, entity_id, field_id)
);

CREATE TABLE IF NOT EXISTS class_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  from_class TEXT NOT NULL,
  from_section TEXT DEFAULT '',
  to_class TEXT NOT NULL,
  to_section TEXT DEFAULT '',
  session_id INTEGER REFERENCES sessions(id),
  changed_by INTEGER REFERENCES users(id),
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ FEE STRUCTURE / DUES / RECEIPTS ============
CREATE TABLE IF NOT EXISTS fee_structure (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  class_name TEXT NOT NULL,
  head_id INTEGER NOT NULL REFERENCES masters(id),
  amount REAL NOT NULL DEFAULT 0,
  fine_flat REAL NOT NULL DEFAULT 0,
  fine_percent REAL NOT NULL DEFAULT 0,
  due_day INTEGER NOT NULL DEFAULT 10, -- day of month
  UNIQUE(session_id, class_name, head_id)
);

CREATE TABLE IF NOT EXISTS fee_dues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  head_id INTEGER NOT NULL REFERENCES masters(id),
  head_name TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  discount_reason TEXT DEFAULT '',
  discount_approved_by TEXT DEFAULT '',
  fine REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL DEFAULT (date('now')),
  month_label TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'due', -- due|partial|paid|waived
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, session_id, head_id, month_label)
);
CREATE INDEX IF NOT EXISTS idx_dues_student ON fee_dues(student_id, status);

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no TEXT NOT NULL UNIQUE,
  student_id INTEGER NOT NULL REFERENCES students(id),
  session_id INTEGER REFERENCES sessions(id),
  date TEXT NOT NULL DEFAULT (date('now')),
  total REAL NOT NULL DEFAULT 0,
  tendered REAL NOT NULL DEFAULT 0,
  change_given REAL NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'cash', -- cash|upi|cheque|neft
  ref_no TEXT DEFAULT '',
  bank TEXT DEFAULT '',
  cheque_date TEXT DEFAULT '',
  cheque_status TEXT DEFAULT '', -- ''|pending|cleared|bounced
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active', -- active|cancelled
  cancelled_reason TEXT DEFAULT '',
  cancelled_by INTEGER REFERENCES users(id),
  cancelled_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_receipts_student ON receipts(student_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);

CREATE TABLE IF NOT EXISTS receipt_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  due_id INTEGER REFERENCES fee_dues(id),
  head_id INTEGER REFERENCES masters(id),
  head_name TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0
);

-- ============ ATTENDANCE ============
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  class_name TEXT NOT NULL DEFAULT '',
  section TEXT DEFAULT '',
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'P', -- P|A|L|H
  marked_by INTEGER REFERENCES users(id),
  marked_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance(class_name, section, date);

-- Staff base table (extended with payroll fields in migration 004)
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  designation TEXT DEFAULT '',
  department TEXT DEFAULT '',
  joining_date TEXT DEFAULT (date('now')),
  photo_path TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'P', -- P|A|L|H|half
  in_time TEXT DEFAULT '',
  late INTEGER NOT NULL DEFAULT 0,
  marked_by INTEGER REFERENCES users(id),
  UNIQUE(staff_id, date)
);

CREATE TABLE IF NOT EXISTS leave_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_type TEXT NOT NULL, -- student|staff
  applicant_id INTEGER NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  leave_type TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ FTS5 GLOBAL SEARCH ============
CREATE VIRTUAL TABLE IF NOT EXISTS global_search USING fts5(
  kind, ref_id, title, subtitle, tokens,
  tokenize = 'trigram'
);

-- Keep the index fresh via triggers
CREATE TRIGGER IF NOT EXISTS trg_students_search_ai AFTER INSERT ON students BEGIN
  INSERT INTO global_search (kind, ref_id, title, subtitle, tokens)
  VALUES ('student', NEW.id, NEW.name, NEW.admission_no || ' · ' || NEW.class_name || '-' || NEW.section,
          NEW.name || ' ' || NEW.admission_no || ' ' || NEW.father_phone || ' ' || NEW.mother_phone || ' ' || NEW.guardian_phone);
END;
CREATE TRIGGER IF NOT EXISTS trg_students_search_au AFTER UPDATE ON students BEGIN
  DELETE FROM global_search WHERE kind = 'student' AND ref_id = NEW.id;
  INSERT INTO global_search (kind, ref_id, title, subtitle, tokens)
  VALUES ('student', NEW.id, NEW.name, NEW.admission_no || ' · ' || NEW.class_name || '-' || NEW.section,
          NEW.name || ' ' || NEW.admission_no || ' ' || NEW.father_phone || ' ' || NEW.mother_phone || ' ' || NEW.guardian_phone);
END;
CREATE TRIGGER IF NOT EXISTS trg_students_search_ad AFTER DELETE ON students BEGIN
  DELETE FROM global_search WHERE kind = 'student' AND ref_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_receipts_search_ai AFTER INSERT ON receipts BEGIN
  INSERT INTO global_search (kind, ref_id, title, subtitle, tokens)
  VALUES ('receipt', NEW.id, NEW.receipt_no, '₹' || NEW.total || ' · ' || NEW.date, NEW.receipt_no);
END;
CREATE TRIGGER IF NOT EXISTS trg_receipts_search_ad AFTER DELETE ON receipts BEGIN
  DELETE FROM global_search WHERE kind = 'receipt' AND ref_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_staff_search_ai AFTER INSERT ON staff BEGIN
  INSERT INTO global_search (kind, ref_id, title, subtitle, tokens)
  VALUES ('staff', NEW.id, NEW.name, NEW.employee_code || ' · ' || NEW.designation, NEW.name || ' ' || NEW.employee_code || ' ' || NEW.phone);
END;
CREATE TRIGGER IF NOT EXISTS trg_staff_search_ad AFTER DELETE ON staff BEGIN
  DELETE FROM global_search WHERE kind = 'staff' AND ref_id = OLD.id;
END;

-- Numbering keys for M2
INSERT OR IGNORE INTO numbering (key, label, pattern) VALUES
  ('tc', 'Transfer certificate', 'TC-{YYYY}-{SEQ:4}');

-- Seed document checklist types + leave types are masters (already exist as kinds)
