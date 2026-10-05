# Invexom EMS — Build (.exe) & License Guide

## Part 1: Building the professional Windows installer

### One-time setup on your Windows build PC

1. **Node.js 22** — `nvm install 22.12.0` + `nvm use 22.12.0`
2. **Visual Studio Build Tools** — download from visualstudio.microsoft.com/downloads,
   install with the **"Desktop development with C++"** workload ticked.
   (Required once: the database library compiles from C++ source.)
3. Full install (NOT `--ignore-scripts` this time):
   ```
   npm install
   ```

### Build the installer

```
npm run dist
```

Output goes to the `dist-installer/` folder:

| File | What it is |
|---|---|
| `Invexom-EMS-Setup-1.0.0.exe` | **The installer** — give this to schools |
| `Invexom-EMS-Portable-1.0.0.exe` | Portable — runs without installing (demo/trial use) |

### What the customer sees (installer experience)

1. Branded welcome screen (Invexom EMS icon + sidebar artwork)
2. License agreement (EULA) — must click "I accept"
3. Choose install folder (defaults to Program Files)
4. Desktop + Start Menu shortcuts created automatically
5. App launches when install finishes
6. Listed in Windows **Add/Remove Programs** as "Invexom EMS"

### Uninstall (clean)

- From Add/Remove Programs or Start Menu → Uninstall.
- The uninstaller **asks**: "Do you want to KEEP your school data (database and backups)?"
  - **YES** → program removed, data stays in `%APPDATA%\Invexom EMS`
    (reinstalling later picks up right where they left off)
  - **NO** → everything deleted
- Shortcuts and registry entries are removed automatically.

### Code signing (SmartScreen)

Without a paid code-signing certificate (~₹8,000–15,000/year), Windows
SmartScreen shows "Unknown publisher — Windows protected your PC" on first
run. The customer clicks **"More info → Run anyway"** and it installs fine.
This is normal for new software. Get a certificate once sales justify it —
then the warning disappears entirely.

---

## Part 2: The license system — complete

### How it works (technical)

```
YOUR PRIVATE KEY (secret, only you)          APP'S PUBLIC KEY (embedded)
        │                                            │
        ▼                                            ▼
  You SIGN a license file ──► .inelic file ──► App VERIFIES signature
        (Ed25519)              (JSON + signature)      (offline, no internet)
```

- **Ed25519 cryptography** (Node built-in, no dependencies): only your
  private key can create valid licenses; the app's embedded public key
  verifies them. Nobody can forge a license without your private key.
- **Hardware locking**: each license is bound to the buyer's computer
  (disk + motherboard + CPU fingerprints). Copying the app + license to
  another PC → app refuses to run ("license mismatch"), exactly per SRS.
  Fuzzy 2-of-3 matching tolerates minor hardware changes (e.g. disk swap).
- **Fully offline**: no servers, no phone-home, no recurring cost — ever.
- **Demo mode** (no license): 50 students, 30 days, watermark on prints.
  Entering a license upgrades **in place** — all data intact.

### License tiers (encoded in each file)

| Tier | Students | Devices | Typical price |
|---|---|---|---|
| starter | 300 | 2 | ₹24,999 |
| standard | 1,000 | 5 | ₹39,999 |
| campus | unlimited | 10 | ₹59,999 |

Add-ons are flags: `--transport 1`, `--library 1` (₹4,999 each suggested).

### Your day-to-day workflow (selling a license)

**Step 1 — Customer sends their machine details.**
Customer installs the app (demo mode) → opens **License** screen → clicks
**"Copy license request"** → pastes it to you on WhatsApp. It looks like:

```
Invexom EMS License Request
Machine Code: AB3D-7K9P-2M4X-8QWE
HW: disk=a1b2c3... board=d4e5f6... cpu=7890ab...
```

**Step 2 — You mint the license (one command).**
On your PC, in the project folder:

```
npm run make:license -- --tier standard --issuedTo "Sunrise Public School" --out sunrise.inelic --request "Invexom EMS License Request
Machine Code: AB3D-7K9P-2M4X-8QWE
HW: disk=a1b2c3... board=d4e5f6... cpu=7890ab..."
```

Add `--transport 1 --library 1` if they bought add-ons.

**Step 3 — Send the `.inelic` file** to the customer (WhatsApp/email).

**Step 4 — Customer activates:** License screen → **"Choose file"** →
selects the `.inelic` → app verifies signature + hardware → **full version
unlocked instantly**, demo limits and watermark gone, all data kept.

### Protecting your private key

- Location: `~/workspace/invexom-ops/ems-private/license-private.pem`
  (on YOUR machine keep a copy somewhere safe too)
- **Back it up offline** (USB drive / password manager). If you lose it,
  you can never mint licenses again.
- **Never** commit it to git, email it, or put it in the installer.
  Anyone holding it can mint unlimited licenses.

### If a customer changes computer

They send a new license request from the new PC → you mint a new `.inelic`
(old one keeps working on the old PC unless you ask them to uninstall —
track this in a simple spreadsheet: school / machine code / tier / date).
