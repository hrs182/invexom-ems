import { getDb } from './database.js';
import { audit } from './audit.js';

/** Local audit helper (no user context in these services). */
function logAudit(scope: string, action: string, entityId: string | number): void {
  audit(null, `${scope}.${action}`, scope, entityId);
}

/**
 * Transport add-on (license-flag-gated): vehicles, routes, stops,
 * student allocations per session.
 */

export interface Vehicle { id: number; vehicle_no: string; type: string; capacity: number; driver_name: string | null; driver_phone: string | null; insurance_expiry: string | null; fitness_expiry: string | null; is_active: number; }
export interface Route { id: number; name: string; vehicle_id: number | null; monthly_fee: number; is_active: number; vehicle_no?: string; }
export interface RouteStop { id: number; route_id: number; stop_name: string; stop_order: number; pickup_time: string | null; }
export interface Allocation { id: number; student_id: number; route_id: number; stop_id: number | null; session: string; student_name?: string; class_name?: string; route_name?: string; stop_name?: string; }

export function listVehicles(): Vehicle[] {
  return getDb().prepare('SELECT * FROM vehicles ORDER BY vehicle_no').all() as Vehicle[];
}
export function saveVehicle(v: Partial<Vehicle> & { vehicle_no: string }): number {
  const db = getDb();
  if (v.id) {
    db.prepare(`UPDATE vehicles SET vehicle_no=?, type=?, capacity=?, driver_name=?, driver_phone=?, insurance_expiry=?, fitness_expiry=?, is_active=? WHERE id=?`)
      .run(v.vehicle_no, v.type ?? 'bus', v.capacity ?? 0, v.driver_name ?? null, v.driver_phone ?? null, v.insurance_expiry ?? null, v.fitness_expiry ?? null, v.is_active ?? 1, v.id);
    logAudit('transport', 'vehicle.update', String(v.id));
    return v.id;
  }
  const r = db.prepare(`INSERT INTO vehicles (vehicle_no, type, capacity, driver_name, driver_phone, insurance_expiry, fitness_expiry) VALUES (?,?,?,?,?,?,?)`)
    .run(v.vehicle_no, v.type ?? 'bus', v.capacity ?? 0, v.driver_name ?? null, v.driver_phone ?? null, v.insurance_expiry ?? null, v.fitness_expiry ?? null);
  logAudit('transport', 'vehicle.create', String(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
}

export function listRoutes(): Route[] {
  return getDb().prepare(`SELECT r.*, v.vehicle_no FROM routes r LEFT JOIN vehicles v ON v.id = r.vehicle_id ORDER BY r.name`).all() as Route[];
}
export function saveRoute(r: Partial<Route> & { name: string }): number {
  const db = getDb();
  if (r.id) {
    db.prepare('UPDATE routes SET name=?, vehicle_id=?, monthly_fee=?, is_active=? WHERE id=?')
      .run(r.name, r.vehicle_id ?? null, r.monthly_fee ?? 0, r.is_active ?? 1, r.id);
    logAudit('transport', 'route.update', String(r.id));
    return r.id;
  }
  const res = db.prepare('INSERT INTO routes (name, vehicle_id, monthly_fee) VALUES (?,?,?)').run(r.name, r.vehicle_id ?? null, r.monthly_fee ?? 0);
  logAudit('transport', 'route.create', String(res.lastInsertRowid));
  return Number(res.lastInsertRowid);
}

export function listStops(routeId: number): RouteStop[] {
  return getDb().prepare('SELECT * FROM route_stops WHERE route_id=? ORDER BY stop_order, stop_name').all(routeId) as RouteStop[];
}
export function saveStops(routeId: number, stops: { stop_name: string; stop_order: number; pickup_time?: string }[]): void {
  const db = getDb();
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM route_stops WHERE route_id=?').run(routeId);
    const ins = db.prepare('INSERT INTO route_stops (route_id, stop_name, stop_order, pickup_time) VALUES (?,?,?,?)');
    stops.forEach((s) => ins.run(routeId, s.stop_name, s.stop_order, s.pickup_time ?? null));
  });
  txn();
  logAudit('transport', 'route.stops', String(routeId));
}

export function listAllocations(session: string): Allocation[] {
  return getDb().prepare(`
    SELECT a.*, s.name AS student_name, s.class_name, r.name AS route_name, st.stop_name
    FROM transport_allocations a
    JOIN students s ON s.id = a.student_id
    JOIN routes r ON r.id = a.route_id
    LEFT JOIN route_stops st ON st.id = a.stop_id
    WHERE a.session = ? AND a.is_active = 1
    ORDER BY r.name, s.class_name, s.name`).all(session) as Allocation[];
}

export function allocate(studentId: number, routeId: number, stopId: number | null, session: string): void {
  const db = getDb();
  db.prepare(`INSERT INTO transport_allocations (student_id, route_id, stop_id, session)
    VALUES (?,?,?,?)
    ON CONFLICT(student_id, session) DO UPDATE SET route_id=excluded.route_id, stop_id=excluded.stop_id, is_active=1`)
    .run(studentId, routeId, stopId, session);
  logAudit('transport', 'allocate', `${studentId}/${session}`);
}

export function deallocate(studentId: number, session: string): void {
  getDb().prepare('UPDATE transport_allocations SET is_active=0 WHERE student_id=? AND session=?').run(studentId, session);
  logAudit('transport', 'deallocate', `${studentId}/${session}`);
}

/** Route-wise strength for the dashboard. */
export function routeStrength(session: string): { route: string; count: number; capacity: number }[] {
  return getDb().prepare(`
    SELECT r.name AS route, COUNT(a.id) AS count, COALESCE(v.capacity, 0) AS capacity
    FROM routes r
    LEFT JOIN vehicles v ON v.id = r.vehicle_id
    LEFT JOIN transport_allocations a ON a.route_id = r.id AND a.session = ? AND a.is_active = 1
    GROUP BY r.id ORDER BY r.name`).all(session) as { route: string; count: number; capacity: number }[];
}
