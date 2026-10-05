# Milestone 1 — Acceptance Mapping (vs SRS §15 + build-prompt quality gates)

Scope of M1 (per SRS §14): installer config, setup wizard, dashboard shell,
settings/masters, users/roles, licensing + demo mode, backup engine,
design system + dark mode, i18n externalization.

## SRS §15 checklist — status after M1

| # | Checklist item | M1 status | Evidence |
|---|---|---|---|
| 1 | Fresh install → wizard → admission + fee receipt + attendance, fully offline, < 30 min | **Partial** — wizard + offline shell done; admission/fees/attendance are M2 | `SetupWizard.tsx` (5 steps, FLOW-01); offline-first architecture, no network calls except user-initiated update check |
| 2 | Power cut during receipt save → restart: data intact, no number gap/duplicate | **Mechanism done, receipt UI in M2** | `tests/vault-cycle.test.ts` (WAL + atomic numbering round-trip); `numbering.ts` transactional allocation (BR-01); `tests/numbering.test.ts` |
| 3 | Copy install folder to second PC → refuses to run | **Done** | `license.ts`: Ed25519 verify + HW binding (disk/board/CPU), fuzzy 2-of-3 (LIC-02/04); `tests/license.test.ts` (mismatch → `mismatch` mode, read-only) |
| 4 | Demo: 51st student blocked gracefully | **M2** (students module) — enforcement helper ready | `assertStudentCap()` in `license.ts`; `DEMO_MAX_STUDENTS = 50` |
| 5 | Demo day 31 → read-only + activate prompt | **Done** | `licenseStatus()` → `demo-expired` → `readOnly`; App shell banner; `needWritable()` guard on all mutations |
| 6 | License key entry upgrades in place, data intact | **Done** | `activateLicense()` verifies + stores, never touches user data; DEMO-02 |
| 7 | 5,000-student list < 2s | **M2** | — |
| 8 | 500 report cards bulk print, no freeze | **M3** | — |
| 9 | Full data export → readable Excel per module | **M2–M5** (exceljs dep installed) | — |
| 10 | Cancelled receipt stays struck-through | **M2** | schema ready (`is_cancelled`, BR-03) |
| 11 | Deleted student recoverable (recycle bin) | **M2** | `is_deleted` on all entities (FR-BKP-06) |
| 12 | WhatsApp reminder prefilled text correct | **M2/M5** | wa.me composer service (M5) |
| 13 | Marks lock → teacher blocked; unlock logged | **M3** | audit infra ready (`audit.ts`, PERM-02/03) |
| 14 | Every §10 report opens/filters/prints/exports | **M2–M5** | — |

## Build-prompt quality gates — status after M1

| Gate | Status |
|---|---|
| Cold start < 5s | Not measured on this Linux VM (Windows target); startup path does no heavy work (lazy DB open after login) |
| 5,000-student list < 2s | M2 |
| Power-cut during receipt save: zero corruption, zero number gaps | Mechanism verified by `vault-cycle` + `numbering` tests (WAL mode asserted) |
| Copied folder on second PC refuses to run | Implemented + unit-tested |
| Every screen in light AND dark at 1366×768 and 1920×1080 | NOT VERIFIED on this VM (2026-10-04): the sandbox Chromium hard-blocks all localhost navigations (Local Network Access checks, force-enabled in this build; not bypassable via flags/policy). 1100×700 min window enforced in `main.ts`; responsive rules in CSS. To verify: `npm run dev` then open http://localhost:5173 — use the theme switcher in the top bar (Light/Dark/System). |

## Flagged conflicts / decisions (SRS wins)

1. **WhatsApp receipt PDF (FLOW-05 vs zero-cost constraint):** wa.me deep links can only
   prefill *text* — they cannot attach a PDF/photo. Implementation: "WhatsApp receipt"
   sends a prefilled *text* receipt summary; the PDF is saved separately for manual
   attach. No WhatsApp Business API is used, per C-1.
2. **DB encryption mechanism:** better-sqlite3 has no native encryption. Implemented as
   AES-256-GCM file-level encryption via Node's built-in crypto (well-reviewed OpenSSL,
   not hand-rolled), key wrapped per-user with scrypt(password) — satisfies NFR-S-03
   ("key from admin password") with zero-cost, fully offline.
3. **Licensing crypto:** SRS permits a "well-reviewed open implementation" instead of a
   bought toolkit — using Node's built-in Ed25519 (OpenSSL). Zero cost, no new dependency.
4. **TypeScript:** prompt says "TypeScript 5.x" inside the "latest stable" section —
   using 5.9.3 (latest 5.x), not 7.x.
5. **Windows packaging on this Linux VM:** electron-builder NSIS/portable targets need
   Wine for exe metadata editing; Wine is not installed here. `npm run dist` is fully
   configured and must run on a Windows machine (or with Wine). Everything up to
   packaging is verified here.
