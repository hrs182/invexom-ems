-- Migration 003: Exams & cards (Milestone 3)

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  term TEXT DEFAULT '',
  session_id INTEGER REFERENCES sessions(id),
  classes TEXT NOT NULL DEFAULT '[]', -- JSON array of class names
  is_locked INTEGER NOT NULL DEFAULT 0,
  locked_by INTEGER REFERENCES users(id),
  locked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exam_subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT '',
  max_marks REAL NOT NULL DEFAULT 100,
  pass_marks REAL NOT NULL DEFAULT 33,
  weightage REAL NOT NULL DEFAULT 100,
  UNIQUE(exam_id, subject, class_name)
);

CREATE TABLE IF NOT EXISTS datesheet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  start_time TEXT DEFAULT '',
  end_time TEXT DEFAULT '',
  room TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  student_id INTEGER NOT NULL REFERENCES students(id),
  marks_obtained REAL,
  is_absent INTEGER NOT NULL DEFAULT 0,
  grace REAL NOT NULL DEFAULT 0,
  grace_note TEXT DEFAULT '',
  entered_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(exam_id, subject, student_id)
);
CREATE INDEX IF NOT EXISTS idx_marks_exam ON marks(exam_id, subject);

-- Grade bands (configurable, FR-EXM-04)
CREATE TABLE IF NOT EXISTS grade_bands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  min_percent REAL NOT NULL,
  grade TEXT NOT NULL,
  remark TEXT DEFAULT '',
  UNIQUE(min_percent)
);

-- Report card / ID card templates (versioned, FR-CRD-03)
CREATE TABLE IF NOT EXISTS card_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL, -- report-card|id-student|id-staff|admit-card
  name TEXT NOT NULL,
  class_name TEXT DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}', -- JSON: fields, layout, styles
  version INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gatepasses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gatepass_no TEXT NOT NULL UNIQUE,
  student_id INTEGER NOT NULL REFERENCES students(id),
  reason TEXT NOT NULL DEFAULT '',
  out_time TEXT NOT NULL DEFAULT (datetime('now')),
  valid_until TEXT DEFAULT '',
  authorized_by TEXT DEFAULT '',
  receiver_name TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default grade bands (CBSE-style)
INSERT OR IGNORE INTO grade_bands (min_percent, grade, remark) VALUES
  (91, 'A1', 'Outstanding'), (81, 'A2', 'Excellent'), (71, 'B1', 'Very Good'),
  (61, 'B2', 'Good'), (51, 'C1', 'Above Average'), (41, 'C2', 'Average'),
  (33, 'D', 'Marginal'), (0, 'E', 'Needs Improvement');

-- Default report-card template
INSERT OR IGNORE INTO card_templates (kind, name, config, is_default) VALUES
  ('report-card', 'Classic', '{"showPhoto":true,"showAttendance":true,"showRemarks":true,"showSignatures":true,"orientation":"portrait"}', 1),
  ('id-student', 'Standard CR80', '{"orientation":"landscape","showQR":true}', 1),
  ('admit-card', 'Standard', '{"showPhoto":true,"showSchedule":true}', 1);
