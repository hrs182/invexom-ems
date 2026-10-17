-- Migration 004: Money (Milestone 4) — payroll, accounting, inventory

-- Extend staff with HR/bank fields (FR-SAL-01)
ALTER TABLE staff ADD COLUMN dob TEXT DEFAULT '';
ALTER TABLE staff ADD COLUMN gender TEXT DEFAULT '';
ALTER TABLE staff ADD COLUMN address TEXT DEFAULT '';
ALTER TABLE staff ADD COLUMN pan TEXT DEFAULT '';
ALTER TABLE staff ADD COLUMN aadhaar TEXT DEFAULT '';
ALTER TABLE staff ADD COLUMN bank_name TEXT DEFAULT '';
ALTER TABLE staff ADD COLUMN bank_account TEXT DEFAULT '';
ALTER TABLE staff ADD COLUMN bank_ifsc TEXT DEFAULT '';
ALTER TABLE staff ADD COLUMN department2 TEXT DEFAULT '';

-- Salary structure per staff (FR-SAL-02)
CREATE TABLE IF NOT EXISTS salary_structure (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  component TEXT NOT NULL,
  kind TEXT NOT NULL, -- earning|deduction
  amount REAL NOT NULL DEFAULT 0,
  is_percent INTEGER NOT NULL DEFAULT 0,
  percent_of TEXT DEFAULT 'basic', -- basic|gross
  UNIQUE(staff_id, component)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL UNIQUE, -- YYYY-MM
  status TEXT NOT NULL DEFAULT 'draft', -- draft|finalized
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payroll_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  payable_days REAL NOT NULL DEFAULT 0,
  lop_days REAL NOT NULL DEFAULT 0,
  earnings TEXT NOT NULL DEFAULT '[]',   -- JSON [{component, amount}]
  deductions TEXT NOT NULL DEFAULT '[]', -- JSON [{component, amount}]
  arrears REAL NOT NULL DEFAULT 0,
  bonus REAL NOT NULL DEFAULT 0,
  gross REAL NOT NULL DEFAULT 0,
  total_deductions REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL DEFAULT 0,
  UNIQUE(run_id, staff_id)
);

-- Vouchers (FR-ACC-02)
CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_no TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL, -- receipt|payment|journal|contra
  date TEXT NOT NULL DEFAULT (date('now')),
  ledger_id INTEGER REFERENCES masters(id),
  ledger_name TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  mode TEXT DEFAULT 'cash',
  narration TEXT DEFAULT '',
  ref_type TEXT DEFAULT '',
  ref_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(date);
CREATE INDEX IF NOT EXISTS idx_vouchers_ledger ON vouchers(ledger_id);

-- Search index for vouchers
CREATE TRIGGER IF NOT EXISTS trg_vouchers_search_ai AFTER INSERT ON vouchers BEGIN
  INSERT INTO global_search (kind, ref_id, title, subtitle, tokens)
  VALUES ('voucher', NEW.id, NEW.voucher_no, NEW.type || ' · ₹' || NEW.amount || ' · ' || NEW.date,
          NEW.voucher_no || ' ' || NEW.narration || ' ' || NEW.ledger_name);
END;
CREATE TRIGGER IF NOT EXISTS trg_vouchers_search_ad AFTER DELETE ON vouchers BEGIN
  DELETE FROM global_search WHERE kind = 'voucher' AND ref_id = OLD.id;
END;

-- Expenses with approval workflow (FR-ACC-04)
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL DEFAULT (date('now')),
  ledger_id INTEGER REFERENCES masters(id),
  ledger_name TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  narration TEXT DEFAULT '',
  bill_no TEXT DEFAULT '',
  entered_by INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Petty cash (FR-ACC-07)
CREATE TABLE IF NOT EXISTS petty_cash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  opening REAL NOT NULL DEFAULT 0,
  closing REAL NOT NULL DEFAULT 0,
  physical_count REAL,
  difference REAL,
  notes TEXT DEFAULT ''
);

-- ============ INVENTORY ============
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',
  unit TEXT DEFAULT 'pcs',
  purchase_rate REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  barcode TEXT DEFAULT '',
  current_stock REAL NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_no TEXT NOT NULL DEFAULT '',
  bill_date TEXT NOT NULL DEFAULT (date('now')),
  vendor TEXT NOT NULL DEFAULT '',
  total REAL NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  qty REAL NOT NULL DEFAULT 0,
  rate REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL DEFAULT (date('now')),
  item_id INTEGER NOT NULL REFERENCES items(id),
  qty REAL NOT NULL DEFAULT 0,
  issued_to TEXT NOT NULL DEFAULT '',
  purpose TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  date TEXT NOT NULL DEFAULT (date('now')),
  kind TEXT NOT NULL, -- purchase|issue|adjust
  qty REAL NOT NULL DEFAULT 0, -- +in / -out
  ref TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_moves_item ON stock_moves(item_id, date);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',
  purchase_date TEXT DEFAULT (date('now')),
  cost REAL NOT NULL DEFAULT 0,
  location TEXT DEFAULT '',
  custodian TEXT DEFAULT '',
  condition TEXT DEFAULT 'good',
  warranty_expiry TEXT DEFAULT '',
  is_deleted INTEGER NOT NULL DEFAULT 0
);

-- Default PF/ESI rates (FR-SAL-02)
INSERT OR IGNORE INTO app_rules (key, value) VALUES
  ('payroll.pfRate', '12'),
  ('payroll.esiRate', '3.25'),
  ('payroll.graceMinutes', '10');
