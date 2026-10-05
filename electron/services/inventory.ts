import { getDb } from './database.js';
import type { SafeUser } from '../../shared/types.js';
import { audit } from './audit.js';

export interface ItemRow { id: number; name: string; category: string; unit: string; purchase_rate: number; reorder_level: number; barcode: string; current_stock: number }

export function listItems(): ItemRow[] {
  return getDb().prepare('SELECT id, name, category, unit, purchase_rate, reorder_level, barcode, current_stock FROM items WHERE is_deleted = 0 ORDER BY name').all() as ItemRow[];
}

export function saveItem(input: Partial<ItemRow> & { id?: number }, user: SafeUser): number {
  const db = getDb();
  if (!input.name?.trim()) throw new Error('name-required');
  if (input.id) {
    db.prepare(`UPDATE items SET name = ?, category = ?, unit = ?, purchase_rate = ?, reorder_level = ?, barcode = ?
      WHERE id = ?`).run(input.name.trim(), input.category ?? '', input.unit ?? 'pcs',
      input.purchase_rate ?? 0, input.reorder_level ?? 0, input.barcode ?? '', input.id);
    audit(user, 'inventory.item.update', 'item', input.id);
    return input.id;
  }
  const r = db.prepare(`INSERT INTO items (name, category, unit, purchase_rate, reorder_level, barcode)
    VALUES (?, ?, ?, ?, ?, ?)`).run(input.name.trim(), input.category ?? '', input.unit ?? 'pcs',
    input.purchase_rate ?? 0, input.reorder_level ?? 0, input.barcode ?? '');
  audit(user, 'inventory.item.create', 'item', Number(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
}

/** FR-INV-02: purchase entry → stock increases. */
export function createPurchase(input: { bill_no: string; bill_date: string; vendor: string; lines: { item_id: number; qty: number; rate: number; tax: number }[] }, user: SafeUser): number {
  const db = getDb();
  const txn = db.transaction(() => {
    const total = Math.round(input.lines.reduce((a, l) => a + l.qty * l.rate + l.tax, 0) * 100) / 100;
    const r = db.prepare('INSERT INTO purchases (bill_no, bill_date, vendor, total, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(input.bill_no, input.bill_date, input.vendor, total, user.id);
    const pid = Number(r.lastInsertRowid);
    const pl = db.prepare('INSERT INTO purchase_lines (purchase_id, item_id, qty, rate, tax) VALUES (?, ?, ?, ?, ?)');
    const stock = db.prepare('UPDATE items SET current_stock = current_stock + ?, purchase_rate = ? WHERE id = ?');
    const move = db.prepare("INSERT INTO stock_moves (item_id, date, kind, qty, ref) VALUES (?, ?, 'purchase', ?, ?)");
    for (const l of input.lines) {
      pl.run(pid, l.item_id, l.qty, l.rate, l.tax);
      stock.run(l.qty, l.rate, l.item_id);
      move.run(l.item_id, input.bill_date, l.qty, `Purchase ${input.bill_no}`);
    }
    return pid;
  });
  const id = txn();
  audit(user, 'inventory.purchase', 'purchase', id, null, { bill_no: input.bill_no });
  return id;
}

/** FR-INV-03: issue entry → stock decreases. */
export function createIssue(input: { date: string; item_id: number; qty: number; issued_to: string; purpose: string }, user: SafeUser): number {
  const db = getDb();
  const item = db.prepare('SELECT current_stock, name FROM items WHERE id = ?').get(input.item_id) as { current_stock: number; name: string } | undefined;
  if (!item) throw new Error('item-not-found');
  if (input.qty > item.current_stock) throw new Error('insufficient-stock');
  const txn = db.transaction(() => {
    const r = db.prepare('INSERT INTO stock_issues (date, item_id, qty, issued_to, purpose, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(input.date, input.item_id, input.qty, input.issued_to, input.purpose, user.id);
    db.prepare('UPDATE items SET current_stock = current_stock - ? WHERE id = ?').run(input.qty, input.item_id);
    db.prepare("INSERT INTO stock_moves (item_id, date, kind, qty, ref) VALUES (?, ?, 'issue', ?, ?)")
      .run(input.item_id, input.date, -input.qty, `Issue to ${input.issued_to}`);
    return Number(r.lastInsertRowid);
  });
  const id = txn();
  audit(user, 'inventory.issue', 'issue', id, null, { item: item.name, qty: input.qty });
  return id;
}

/** FR-INV-04: low-stock alerts. */
export function lowStock(): ItemRow[] {
  return getDb().prepare(`SELECT id, name, category, unit, purchase_rate, reorder_level, barcode, current_stock
    FROM items WHERE is_deleted = 0 AND current_stock <= reorder_level ORDER BY current_stock`).all() as ItemRow[];
}

/** FR-INV-04: dead stock — no movement in N days. */
export function deadStock(days: number): (ItemRow & { last_move: string | null })[] {
  return getDb().prepare(`SELECT i.id, i.name, i.category, i.unit, i.purchase_rate, i.reorder_level, i.barcode,
      i.current_stock, MAX(m.date) AS last_move
    FROM items i LEFT JOIN stock_moves m ON m.item_id = i.id
    WHERE i.is_deleted = 0 AND i.current_stock > 0
    GROUP BY i.id HAVING last_move IS NULL OR julianday('now') - julianday(last_move) > ?
    ORDER BY last_move`).all(days) as never;
}

export function stockValuation(): { items: (ItemRow & { value: number })[]; total: number } {
  const items = listItems().map((i) => ({ ...i, value: Math.round(i.current_stock * i.purchase_rate * 100) / 100 }));
  return { items, total: Math.round(items.reduce((a, i) => a + i.value, 0) * 100) / 100 };
}

export function itemMovement(itemId: number, from: string, to: string): unknown[] {
  return getDb().prepare(`SELECT date, kind, qty, ref FROM stock_moves
    WHERE item_id = ? AND date BETWEEN ? AND ? ORDER BY date, id`).all(itemId, from, to);
}

// ---------- Assets (FR-INV-05) ----------
export interface AssetRow { id: number; name: string; category: string; purchase_date: string; cost: number; location: string; custodian: string; condition: string; warranty_expiry: string }

export function listAssets(): AssetRow[] {
  return getDb().prepare('SELECT * FROM assets WHERE is_deleted = 0 ORDER BY name').all() as AssetRow[];
}

export function saveAsset(input: Partial<AssetRow> & { id?: number }, user: SafeUser): number {
  const db = getDb();
  if (!input.name?.trim()) throw new Error('name-required');
  if (input.id) {
    db.prepare(`UPDATE assets SET name = ?, category = ?, purchase_date = ?, cost = ?, location = ?, custodian = ?, condition = ?, warranty_expiry = ?
      WHERE id = ?`).run(input.name.trim(), input.category ?? '', input.purchase_date ?? '', input.cost ?? 0,
      input.location ?? '', input.custodian ?? '', input.condition ?? 'good', input.warranty_expiry ?? '', input.id);
    return input.id;
  }
  const r = db.prepare(`INSERT INTO assets (name, category, purchase_date, cost, location, custodian, condition, warranty_expiry)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(input.name.trim(), input.category ?? '', input.purchase_date ?? '',
    input.cost ?? 0, input.location ?? '', input.custodian ?? '', input.condition ?? 'good', input.warranty_expiry ?? '');
  audit(user, 'inventory.asset', 'asset', Number(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
}

/** Assets with warranty expiring within N days. */
export function warrantyExpiring(days: number): AssetRow[] {
  return getDb().prepare(`SELECT * FROM assets WHERE is_deleted = 0 AND warranty_expiry != ''
    AND julianday(warranty_expiry) - julianday('now') BETWEEN 0 AND ? ORDER BY warranty_expiry`).all(days) as AssetRow[];
}
