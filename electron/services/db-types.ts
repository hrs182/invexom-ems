/**
 * Minimal database port shared by the two backends:
 * - better-sqlite3 (desktop app + Node demo server), and
 * - sql.js / SQLite-WASM (serverless browser demo).
 *
 * Covers exactly the surface the services use: prepare/get/all/run,
 * exec, transaction, pragma, close. better-sqlite3's Database satisfies
 * this interface structurally, so the desktop code paths are untouched.
 */
export interface DbRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface DbStatement {
  get(...params: unknown[]): Record<string, any> | undefined;
  all(...params: unknown[]): Record<string, any>[];
  run(...params: unknown[]): DbRunResult;
}

export interface Db {
  prepare(sql: string): DbStatement;
  exec(sql: string): void;
  /**
   * Wrapped-transaction factory. Non-generic on purpose: better-sqlite3's
   * transaction() returns a branded Transaction<T> (not T), so a generic
   * signature would not be structurally satisfied by the desktop engine.
   */
  transaction(fn: (...args: any[]) => any): (...args: any[]) => any;
  pragma(s: string): unknown;
  close(): void;
}
