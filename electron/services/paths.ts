import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/**
 * All filesystem locations. Portable builds keep data next to the exe
 * (USB-friendly); installed builds use the OS user-data dir.
 */
export function isPortable(): boolean {
  return !!process.env.PORTABLE_EXECUTABLE_DIR;
}

export function appDataDir(): string {
  if (isPortable()) {
    const exeDir = process.env.PORTABLE_EXECUTABLE_DIR as string;
    return path.join(exeDir, 'EMS-Data');
  }
  return app.getPath('userData');
}

export interface EmsPaths {
  dataDir: string;
  dbEnc: string; // AES-256-GCM encrypted database file (at rest)
  keymeta: string; // salt + per-user wrapped DB keys (no secrets in plain)
  workingDir: string; // per-launch unique session DB files (see database.ts)
  backupsDir: string;
  assetsDir: string; // logos, etc.
  installJson: string; // install timestamp (demo clock)
}

export function emsPaths(): EmsPaths {
  const dataDir = appDataDir();
  const workingDir = path.join(dataDir, 'working');
  return {
    dataDir,
    dbEnc: path.join(dataDir, 'invexom-ems.db.enc'),
    keymeta: path.join(dataDir, 'keymeta.json'),
    workingDir,
    backupsDir: path.join(dataDir, 'backups'),
    assetsDir: path.join(dataDir, 'assets'),
    installJson: path.join(dataDir, 'install.json'),
  };
}

export function ensureDirs(): EmsPaths {
  const p = emsPaths();
  for (const d of [p.dataDir, p.workingDir, p.backupsDir, p.assetsDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
  if (!fs.existsSync(p.installJson)) {
    fs.writeFileSync(p.installJson, JSON.stringify({ installedAt: new Date().toISOString() }, null, 2));
  }
  return p;
}
