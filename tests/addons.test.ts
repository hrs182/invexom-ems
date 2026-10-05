import { describe, it, expect, beforeAll } from 'vitest';
import { openDatabase, getDb } from '../electron/services/database';
import {
  saveVehicle, listVehicles, saveRoute, listRoutes, saveStops, listStops,
  allocate, listAllocations, routeStrength,
} from '../electron/services/transport';
import {
  saveBook, listBooks, issueBook, returnBook, openLoans, overdueLoans, libraryStats,
} from '../electron/services/library';

describe('transport add-on', () => {
  beforeAll(() => {
    openDatabase(':memory:');
  });

  it('creates vehicles, routes, stops and allocations', () => {
    const vId = saveVehicle({ vehicle_no: 'KA-01-T-9999', type: 'bus', capacity: 40 });
    expect(vId).toBeGreaterThan(0);
    expect(listVehicles()).toHaveLength(1);

    const rId = saveRoute({ name: 'Route X', vehicle_id: vId, monthly_fee: 1000 });
    saveStops(rId, [
      { stop_name: 'Stop A', stop_order: 1, pickup_time: '07:30' },
      { stop_name: 'Stop B', stop_order: 2, pickup_time: '07:45' },
    ]);
    expect(listStops(rId)).toHaveLength(2);
    expect(listRoutes()[0].vehicle_no).toBe('KA-01-T-9999');
  });

  it('allocates students and reports strength', () => {
    const db = getDb();
    db.prepare("INSERT INTO students (admission_no, name, class_name, status) VALUES ('T-001', 'Transport Tom', 'V', 'active')").run();
    const sid = Number(db.prepare('SELECT last_insert_rowid() AS id').get().id);
    const rId = listRoutes()[0].id;
    const stopId = listStops(rId)[0].id;
    allocate(sid, rId, stopId, '2026-27');
    const allocs = listAllocations('2026-27');
    expect(allocs).toHaveLength(1);
    expect(allocs[0].stop_name).toBe('Stop A');
    const strength = routeStrength('2026-27');
    expect(strength[0].count).toBe(1);
    expect(strength[0].capacity).toBe(40);
  });
});

describe('library add-on', () => {
  beforeAll(() => {
    openDatabase(':memory:');
    getDb().prepare("INSERT INTO app_rules (key, value) VALUES ('library_fine_per_day', '5')").run();
  });

  it('manages catalog, issue and return with fine', () => {
    const bId = saveBook({ title: 'Test Book', author: 'Author', total_copies: 2 });
    expect(listBooks('Test')).toHaveLength(1);

    const db = getDb();
    db.prepare("INSERT INTO students (admission_no, name, class_name, status) VALUES ('L-001', 'Library Lucy', 'VI', 'active')").run();
    const sid = Number(db.prepare('SELECT last_insert_rowid() AS id').get().id);

    const loanId = issueBook(bId, 'student', sid, 14);
    expect(loanId).toBeGreaterThan(0);
    expect(openLoans()).toHaveLength(1);

    // force overdue by backdating the due date
    db.prepare("UPDATE book_loans SET due_date = date('now', '-3 days') WHERE id=?").run(loanId);
    const overdue = overdueLoans();
    expect(overdue).toHaveLength(1);
    expect(overdue[0].overdue_days).toBe(3);
    expect(overdue[0].computed_fine).toBe(15); // 3 days × ₹5

    const fine = returnBook(loanId);
    expect(fine).toBe(15);
    expect(openLoans()).toHaveLength(0);
    expect(listBooks('Test')[0].available_copies).toBe(2);
  });

  it('blocks issue when no copies available', () => {
    const bId = saveBook({ title: 'Rare Book', total_copies: 1 });
    const db = getDb();
    db.prepare("INSERT INTO students (admission_no, name, class_name, status) VALUES ('L-002', 'Reader Ron', 'VII', 'active')").run();
    const sid = Number(db.prepare('SELECT last_insert_rowid() AS id').get().id);
    issueBook(bId, 'student', sid, 14);
    expect(() => issueBook(bId, 'student', sid, 14)).toThrow('No copies available');
  });

  it('reports stats', () => {
    const s = libraryStats();
    expect(s.books).toBeGreaterThanOrEqual(2);
    expect(s.issued).toBe(1);
  });
});
