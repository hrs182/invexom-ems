-- 009: Per-season fee start month (admin selects which month fee dues begin).
ALTER TABLE sessions ADD COLUMN fee_start_month TEXT NOT NULL DEFAULT '';
UPDATE sessions SET fee_start_month = substr(start_date, 1, 7) WHERE fee_start_month = '';
