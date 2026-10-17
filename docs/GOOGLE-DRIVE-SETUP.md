# Google Drive Backup — Setup Guide

The EMS can upload encrypted backups to the school's Google Drive. You (Invexom)
create **one** OAuth client ID; every school then connects their own Google
account in one click. The backup file stays **encrypted** — Google can never
read the school's data.

## One-time setup (Invexom, ~10 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a
   new project, e.g. `invexom-ems-drive`.
2. **APIs & Services → Library** → search **Google Drive API** → Enable.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - App name: `Invexom EMS`, support email: your email
   - Scopes: add `https://www.googleapis.com/auth/drive.file` (create/access
     only files the app itself uploads — *not* the user's whole Drive) and
     `https://www.googleapis.com/auth/userinfo.email`
   - Add yourself as a test user (while in Testing mode)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Desktop app**
   - Name: `Invexom EMS Desktop`
   - Copy the **Client ID** (ends with `.apps.googleusercontent.com`).
5. Paste the Client ID in the app: **Backup → Google Drive backup → Client ID → Save**.
   (To bake it into the installer for all customers, set `DRIVE_CLIENT_ID_DEFAULT`
   in `electron/services/drive.ts` before building.)

> **Verification note:** with the `drive.file` scope the app only touches files
> it created itself, which keeps Google's verification requirements minimal.
> While the consent screen is in "Testing" mode, each Google account must be
> added as a test user (step 3). For wide distribution, submit the app for
> verification in the console.

## How a school uses it

1. Open **Backup** in Invexom EMS.
2. Click **Save to Drive**. If not connected yet, their **default browser opens**
   with Google sign-in → they approve → the tab says "Connected" → they return
   to the app and the **upload starts automatically**.
3. The backup lands in their Drive in a folder called **`Invexom EMS Backups`**,
   named like `Invexom-EMS-Backup-2026-10-11-1430.db.enc` (date + time).
4. Next time they just click **Save to Drive** — no sign-in needed again.
5. **Restore:** in the Drive card, click **Download** next to any backup, then
   use the normal **Restore** button in the history table. The file is the full
   encrypted database — everything comes back.
6. **Reminders:** Backup settings has "Remind me if no backup for (days)"
   (default 7). The dashboard shows a warning banner when a backup is overdue.

## Troubleshooting

- **"Set your Google Client ID first"** → paste the Client ID (step 5 above).
- **Browser didn't open** → copy the sign-in URL from the app log; any browser works.
- **"Timed out waiting"** → the sign-in tab was closed; click Save to Drive again.
- **Upload fails after months** → click Disconnect, then Connect again (rare).
