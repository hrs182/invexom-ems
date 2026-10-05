import { getDb } from './database.js';
import { audit } from './audit.js';

/** Local audit helper (no user context in these services). */
function logAudit(scope: string, action: string, entityId: string | number): void {
  audit(null, `${scope}.${action}`, scope, entityId);
}

/**
 * Library add-on (license-flag-gated): book catalog, issue/return,
 * overdue fines. Fine/day comes from settings (library_fine_per_day).
 */

export interface Book { id: number; title: string; author: string | null; isbn: string | null; category: string | null; rack_no: string | null; total_copies: number; available_copies: number; }
export interface Loan { id: number; book_id: number; member_type: string; member_id: number; issue_date: string; due_date: string; return_date: string | null; fine: number; fine_paid: number; title?: string; member_name?: string; }

function finePerDay(): number {
  const row = getDb().prepare("SELECT value FROM app_rules WHERE key='library_fine_per_day'").get() as { value: string } | undefined;
  return parseFloat(row?.value ?? '2') || 2;
}

export function listBooks(q = ''): Book[] {
  const db = getDb();
  if (q.trim()) {
    return db.prepare(`SELECT * FROM books WHERE is_deleted=0 AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?) ORDER BY title LIMIT 200`)
      .all(`%${q}%`, `%${q}%`, `%${q}%`) as Book[];
  }
  return db.prepare('SELECT * FROM books WHERE is_deleted=0 ORDER BY title LIMIT 200').all() as Book[];
}

export function saveBook(b: Partial<Book> & { title: string }): number {
  const db = getDb();
  if (b.id) {
    const cur = db.prepare('SELECT total_copies, available_copies FROM books WHERE id=?').get(b.id) as { total_copies: number; available_copies: number };
    const delta = (b.total_copies ?? cur.total_copies) - cur.total_copies;
    db.prepare('UPDATE books SET title=?, author=?, isbn=?, category=?, rack_no=?, total_copies=?, available_copies=available_copies+? WHERE id=?')
      .run(b.title, b.author ?? null, b.isbn ?? null, b.category ?? null, b.rack_no ?? null, b.total_copies ?? cur.total_copies, delta, b.id);
    logAudit('library', 'book.update', String(b.id));
    return b.id;
  }
  const r = db.prepare('INSERT INTO books (title, author, isbn, category, rack_no, total_copies, available_copies) VALUES (?,?,?,?,?,?,?)')
    .run(b.title, b.author ?? null, b.isbn ?? null, b.category ?? null, b.rack_no ?? null, b.total_copies ?? 1, b.total_copies ?? 1);
  logAudit('library', 'book.create', String(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
}

export function deleteBook(id: number): void {
  getDb().prepare('UPDATE books SET is_deleted=1 WHERE id=?').run(id);
  logAudit('library', 'book.delete', String(id));
}

export function memberName(memberType: string, memberId: number): string {
  const db = getDb();
  if (memberType === 'student') {
    const r = db.prepare('SELECT name FROM students WHERE id=?').get(memberId) as { name: string } | undefined;
    return r?.name ?? `#${memberId}`;
  }
  const r = db.prepare('SELECT name FROM staff WHERE id=?').get(memberId) as { name: string } | undefined;
  return r?.name ?? `#${memberId}`;
}

/** Issue a book; blocks when no copies available. Returns loan id. */
export function issueBook(bookId: number, memberType: 'student' | 'staff', memberId: number, dueDays = 14): number {
  const db = getDb();
  const book = db.prepare('SELECT available_copies FROM books WHERE id=? AND is_deleted=0').get(bookId) as { available_copies: number } | undefined;
  if (!book) throw new Error('Book not found');
  if (book.available_copies <= 0) throw new Error('No copies available');
  const txn = db.transaction(() => {
    const today = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + dueDays * 86400000).toISOString().slice(0, 10);
    const r = db.prepare('INSERT INTO book_loans (book_id, member_type, member_id, issue_date, due_date) VALUES (?,?,?,?,?)')
      .run(bookId, memberType, memberId, today, due);
    db.prepare('UPDATE books SET available_copies=available_copies-1 WHERE id=?').run(bookId);
    return Number(r.lastInsertRowid);
  });
  const id = txn();
  logAudit('library', 'issue', `${bookId}→${memberType}:${memberId}`);
  return id;
}

/** Return a book; computes overdue fine. Returns fine amount. */
export function returnBook(loanId: number): number {
  const db = getDb();
  const loan = db.prepare('SELECT * FROM book_loans WHERE id=?').get(loanId) as Loan | undefined;
  if (!loan || loan.return_date) throw new Error('Loan not found or already returned');
  const today = new Date().toISOString().slice(0, 10);
  const overdueDays = Math.max(0, Math.floor((new Date(today).getTime() - new Date(loan.due_date).getTime()) / 86400000));
  const fine = overdueDays * finePerDay();
  db.transaction(() => {
    db.prepare('UPDATE book_loans SET return_date=?, fine=? WHERE id=?').run(today, fine, loanId);
    db.prepare('UPDATE books SET available_copies=available_copies+1 WHERE id=?').run(loan.book_id);
  })();
  logAudit('library', 'return', String(loanId));
  return fine;
}

export function openLoans(): Loan[] {
  const rows = getDb().prepare(`
    SELECT l.*, b.title FROM book_loans l JOIN books b ON b.id = l.book_id
    WHERE l.return_date IS NULL ORDER BY l.due_date`).all() as Loan[];
  return rows.map((r) => ({ ...r, member_name: memberName(r.member_type, r.member_id) }));
}

export function loanHistory(bookId?: number): Loan[] {
  const db = getDb();
  const rows = (bookId
    ? db.prepare('SELECT l.*, b.title FROM book_loans l JOIN books b ON b.id=l.book_id WHERE l.book_id=? ORDER BY l.issue_date DESC LIMIT 200').all(bookId)
    : db.prepare('SELECT l.*, b.title FROM book_loans l JOIN books b ON b.id=l.book_id ORDER BY l.issue_date DESC LIMIT 200').all()) as Loan[];
  return rows.map((r) => ({ ...r, member_name: memberName(r.member_type, r.member_id) }));
}

/** Overdue loans with computed fine as of today. */
export function overdueLoans(): (Loan & { overdue_days: number; computed_fine: number })[] {
  const today = new Date().toISOString().slice(0, 10);
  const perDay = finePerDay();
  return openLoans()
    .filter((l) => l.due_date < today)
    .map((l) => {
      const overdue_days = Math.floor((new Date(today).getTime() - new Date(l.due_date).getTime()) / 86400000);
      return { ...l, overdue_days, computed_fine: overdue_days * perDay };
    });
}

export function libraryStats(): { books: number; copies: number; issued: number; overdue: number } {
  const db = getDb();
  const b = db.prepare('SELECT COUNT(*) AS books, COALESCE(SUM(total_copies),0) AS copies FROM books WHERE is_deleted=0').get() as { books: number; copies: number };
  const i = db.prepare('SELECT COUNT(*) AS c FROM book_loans WHERE return_date IS NULL').get() as { c: number };
  return { books: b.books, copies: b.copies, issued: i.c, overdue: overdueLoans().length };
}
