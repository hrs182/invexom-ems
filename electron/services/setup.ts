import type { Db } from './database.js';

export interface SetupClassSeed {
  name: string;
  sections: string[];
}

export interface SetupFeeHeadSeed {
  name: string;
  type: string;
  defaultAmount?: number;
}

/**
 * Seed classes, sections and fee heads into the generic `masters` table
 * during first-time setup.
 *
 * Idempotent by design: duplicate names are ignored (INSERT OR IGNORE) so a
 * repeated or sloppy wizard submission can NEVER crash the whole setup with
 * `UNIQUE constraint failed: masters.kind, masters.name`. Blank names are
 * skipped. Regression tests live in tests/setup-seed.test.ts.
 */
export function seedSetupMasters(db: Db, classes: SetupClassSeed[], feeHeads: SetupFeeHeadSeed[]): void {
  let order = 0;
  const insClass = db.prepare("INSERT OR IGNORE INTO masters (kind, name, sort_order) VALUES ('class', ?, ?)");
  const insSection = db.prepare(
    "INSERT OR IGNORE INTO masters (kind, name, extra, sort_order) VALUES ('section', ?, ?, ?)",
  );
  const insHead = db.prepare("INSERT OR IGNORE INTO masters (kind, name, extra) VALUES ('fee-head', ?, ?)");
  for (const c of classes) {
    if (!c.name.trim()) continue;
    insClass.run(c.name.trim(), order++);
    for (const sec of c.sections) {
      if (!sec.trim()) continue;
      insSection.run(sec.trim(), JSON.stringify({ class: c.name.trim() }), order++);
    }
  }
  for (const h of feeHeads) {
    if (!h.name.trim()) continue;
    insHead.run(h.name.trim(), JSON.stringify({ type: h.type, defaultAmount: h.defaultAmount || 0 }));
  }
}
