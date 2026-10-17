# Invexom EMS — Web Demo Deployment Guide

This package runs the EMS demo on a public URL like **https://demo.invexom.com**.
It contains the ready-to-run Node.js server + the built web client.

**Package contents**

| File / folder   | What it is                                              |
|-----------------|----------------------------------------------------------|
| `server.cjs`    | The demo server (all 158 EMS features, single file)      |
| `dist-web/`     | The built web app (what visitors see)                    |
| `migrations/`   | Database schema (used on first run)                      |
| `keys/`         | License public key                                       |
| `package.json`  | Only 2 dependencies: `express`, `better-sqlite3`         |

**How to run (any server):** `npm install` then `node server.cjs`.
Env vars (optional): `PORT` (default 3100), `EMS_WEB_DATA_DIR` (default `./demo-data`).

**Demo behaviour:** vault auto-unlocks at boot (login page still shows first,
credentials `demo` / `demo1234`); demo data wipes + reseeds every midnight IST.

---

## PATH A — Your WordPress hosting supports Node.js (recommended, no extra cost)

Most cPanel hosts (Hostinger, Namecheap, A2, HostGator…) have **"Setup Node.js App"**.
This keeps the demo on the hosting you already pay for, always online.

1. **Check:** log in to cPanel → look under the *Software* section for
   **"Setup Node.js App"**. If it is there, continue here. If not, use Path B below.
2. **Subdomain:** cPanel → *Subdomains* → create subdomain `demo`
   (this makes `demo.invexom.com`). Note the document root it shows.
3. **Node app:** cPanel → *Setup Node.js App* → *Create Application*:
   - Node.js version: **20** (or the newest available)
   - Application mode: **Production**
   - Application root: the folder for the demo (e.g. `demo.invexom.com`)
   - Application URL: `https://demo.invexom.com`
   - Application startup file: `server.cjs`
   - Click **Create**.
4. **Upload:** cPanel → *File Manager* → open the application root folder →
   *Upload* this zip → *Extract* it there (so `server.cjs` sits in the root).
5. **Install:** back in *Setup Node.js App*, open your app → click
   **"Run NPM Install"** → wait for it to finish.
6. **Start:** click **Start App** (or Restart). Open `https://demo.invexom.com` —
   the EMS login page should appear with the demo credentials shown.
7. **Link from WordPress:** in WP admin, add a **"Live Demo"** button/menu item
   pointing to `https://demo.invexom.com` (opens in a new tab).

If the app shows an error, open the app's **log** in the Node.js panel —
send the last 20 lines to your developer.

## PATH B — Your hosting has no Node.js (free external host)

1. Create a free account at **Railway** (railway.app) or **Render** (render.com).
2. Create a new project → *Deploy from a GitHub repo* (or upload this folder).
3. Settings: start command `node server.cjs`. Add a disk/persistent volume if
   offered (keeps demo data between restarts; the app reseeds daily anyway).
4. After deploy, copy the public URL they give you (e.g. `xxx.up.railway.app`).
5. **Point your subdomain:** in your domain DNS (where invexom.com is managed),
   add a `CNAME` record: host `demo`, value = the Railway/Render URL.
   Wait 5–30 min, then open `https://demo.invexom.com`.
6. **Link from WordPress** as in Path A step 7.

*Note:* free tiers may "sleep" after ~15 min of no visitors, so the first
visitor waits ~30–60 s for it to wake. For a sales demo, Path A (or any
paid always-on host) is better.

## Updating the demo later

Re-upload + extract the new zip over the old files (keep the `demo-data`
folder if you ever want to preserve a day's entries — normally it resets
daily by itself), then **Restart App** in the panel.
