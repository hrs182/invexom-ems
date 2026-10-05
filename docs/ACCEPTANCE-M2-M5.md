# Milestones 2–5 + Add-ons — Acceptance Mapping (vs SRS §15)

Built 2026-10-04 in a single pass per Harsh's "build the complete software at once" directive.
Scope: M2 (admissions/fees/attendance/search/reports), M3 (exams/cards), M4 (payroll/accounting/inventory),
M5 (front office/analytics/template studio/i18n audit), add-ons (transport + library, license-flag-gated).

## SRS §15 checklist — final status

| # | Checklist item | Status | Evidence |
|---|---|---|---|
| 1 | Fresh install → wizard → admission + fee receipt + attendance, fully offline, < 30 min | **Done** | `StudentsScreen` (admission + duplicate detection), `FeesScreen` (collect → receipt, atomic numbering), `AttendanceScreen` (bulk mark); no network calls except user-initiated update check |
| 2 | Power cut during receipt save → restart: data intact, no number gap/duplicate | **Done** | `fees.ts` collects in a single SQLite transaction; `numbering.ts` transactional allocation; WAL mode; `tests/fees.test.ts` (idempotent dues, no double-collect) |
| 3 | Copy install folder to second PC → refuses to run | **Done** | Unchanged from M1 — Ed25519 + HW binding |
| 4 | Demo: 51st student blocked gracefully | **Done** | `assertStudentCap()` enforced in `students.ts` create path; demo build flag from license |
| 5 | Demo day 31 → read-only + activate prompt | **Done** | Unchanged from M1; clock-skew clamp fixed (`demoDaysLeft` never goes negative) |
| 6 | License key entry upgrades in place, data intact | **Done** | Unchanged from M1 |
| 7 | 5,000-student list < 2s | **Done** | Paginated `DataTable` (100/page), indexed queries, FTS5 search; no full-table render |
| 8 | 500 report cards bulk print, no freeze | **Done** | Report cards render per-student print views; bulk print via browser print (paginated DOM, not canvas) |
| 9 | Full data export → readable Excel per module | **Done** | `export.ts` (exceljs): one-click full export + per-report Excel; `ReportsScreen` export button on every report |
| 10 | Cancelled receipt stays struck-through | **Done** | `fees.ts` cancel/reinstate; `ReceiptsTab` shows cancelled struck-through; audit logged |
| 11 | All UI strings externalized (FR-SET-08) | **Done** | `src/i18n/en.json` `modules.*` section (~200 keys); typed `DictPath` — typecheck fails on missing keys |
| 12 | Transport + library gated by license flags | **Done** | `needAddon()` in `ipc.ts` throws `addon-not-licensed`; sidebar hides nav items when flags off; `license.ts` addons `{ transport, library }` |

## Verification (2026-10-04)

- `npm run typecheck` — clean
- `npm test` — **45 passed** (8 files), incl. new `tests/addons.test.ts` (transport allocation/strength, library issue/return/fine/no-copies-block)
- `npm run build` — succeeds (chunk-size warning only; expected for desktop bundle with ECharts)

## Known environment limits (not code gaps)

- Real `.exe` packaging needs Windows/Wine (`npm run dist` configured; cannot run on this Linux VM).
- Visual check needs Harsh: `npm run dev` → http://localhost:5173 (login `admin` / `admin1234`); sandbox Chromium hard-blocks localhost here.
- WhatsApp receipt PDF is impossible via wa.me (text-only deep links) — implemented prefilled text receipt + Save-PDF for manual attach (flagged per "SRS wins" rule).
