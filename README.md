# Invexom EMS — Education Management System

Fully offline, one-time-license school management software for schools,
academies and coaching centers. Built per `srs-school-management-software-v2.md`
(the binding SRS — every numbered requirement is implemented and testable).

## Stack (all free, zero recurring cost)

- **Shell:** Electron 44 (Windows 10/11 64-bit) · **UI:** React 19 + TypeScript 5.9
- **Styling:** Tailwind CSS v4, CSS-variable design tokens, Radix primitives, Light/Dark/System themes
- **State:** Zustand (persisted UI prefs) · **DB:** SQLite via better-sqlite3 (WAL mode), AES-256-GCM encrypted at rest
- **PDF:** pdf-lib · **Excel:** exceljs · **Charts:** Apache ECharts · **QR:** qrcode
- **Licensing:** offline Ed25519-signed `.inelic` files, hardware-locked (disk+board+CPU, fuzzy 2-of-3)
- **Fonts:** Inter (OFL) bundled; Devanagari-ready stack for Phase-2 Hindi UI

## Quick start (development)

```bash
npm install
npm run gen:keys        # one-time: embeds public key, stores private key in ~/workspace/invexom-ops/ems-private/
npm run dev             # vite renderer on :5173 (uses mock data in browser)
EMS_DEV=1 npm run dev:electron   # run the real Electron shell against vite
npm run typecheck
npm run test
```

## Build the EXE (on Windows)

```bash
npm run dist            # -> dist-installer/Invexom-EMS-Setup-v1.0.0.exe + Portable + CHECKSUMS.txt
EMS_DEMO=1 npm run dist # demo build: 50 students / 30 days / watermark baked in
```

> Packaging Windows installers requires Windows (or Wine) — `electron-builder`
> edits exe metadata via Wine on Linux. All code, tests and the renderer build
> are verified on any OS; run `npm run dist` on the Windows build machine.

## Issuing a license (Harsh / Invexom only)

1. Buyer opens **Help → Activate → Copy machine code**, sends it via WhatsApp/email.
2. `npm run make:license -- --tier standard --issuedTo "School Name" --disk <h> --board <h> --cpu <h> --out school.inelic`
   (add `--transport 1` / `--library 1` for add-ons)
3. Send the `.inelic` file back. Buyer loads it in **Help → Activate** — data is preserved, DEMO badge/watermark removed.

## Update checks

The app never phones home. **Help → Check for updates** fetches
`https://invexom.com/ems/version.json` (`{ version, url, notes }`) — upload that
static file to enable the flow.

## Project layout

```
electron/            main process: window, IPC registry, services
  services/          paths, secure-store (AES-256-GCM vault), database (WAL+migrations),
                     numbering (atomic, gap-free), license (Ed25519+fingerprint+demo),
                     backup (auto/rotate/restore), users/roles, updater
  services/keys/     license-public.pem (embedded at build; gitignored until gen:keys)
  services/migrations/  versioned SQL (auto-migrate on upgrade, safety backup first)
shared/              types.ts (typed IPC contract), license-format.ts (.inelic)
src/                 React renderer: theme tokens, i18n/en.json, zustand stores,
                     ui components (shadcn-style/Radix), modules/*
tools/               gen-keys, make-license, write-build-info, finalize-dist
tests/               vitest: license, vault, numbering
```

## Security model (summary)

- DB key is random; wrapped per-user with scrypt(password). Admin password loss =
  data loss — keep backups and the password safe.
- Backups store the *encrypted* file; restore takes a safety snapshot first.
- Power cut mid-transaction: WAL replay, no corruption, no number gaps (BR-01).
- Copied installs refuse to run (hardware binding, LIC-02); fuzzy 2-of-3 match
  tolerates disk/RAM upgrades (LIC-04).
