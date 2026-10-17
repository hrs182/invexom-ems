-- =============================================================
-- Invexom EMS — Migration 006: transport + library add-ons
-- License-flag-gated (addons.transport / addons.library).
-- =============================================================

-- ---------------- Transport ----------------
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_no TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'bus',            -- bus | van | other
  capacity INTEGER NOT NULL DEFAULT 0,
  driver_name TEXT, driver_phone TEXT,
  insurance_expiry DATE, fitness_expiry DATE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  vehicle_id INTEGER REFERENCES vehicles(id),
  monthly_fee REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS route_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_name TEXT NOT NULL,
  stop_order INTEGER NOT NULL DEFAULT 0,
  pickup_time TEXT,                             -- HH:MM
  UNIQUE(route_id, stop_name)
);

CREATE TABLE IF NOT EXISTS transport_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  route_id INTEGER NOT NULL REFERENCES routes(id),
  stop_id INTEGER REFERENCES route_stops(id),
  session TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, session)
);

-- ---------------- Library ----------------
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT,
  isbn TEXT,
  category TEXT,
  rack_no TEXT,
  total_copies INTEGER NOT NULL DEFAULT 1,
  available_copies INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS book_loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id),
  member_type TEXT NOT NULL DEFAULT 'student',   -- student | staff
  member_id INTEGER NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  return_date DATE,
  fine REAL NOT NULL DEFAULT 0,
  fine_paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loans_member ON book_loans(member_type, member_id);
CREATE INDEX IF NOT EXISTS idx_loans_open ON book_loans(book_id) WHERE return_date IS NULL;
