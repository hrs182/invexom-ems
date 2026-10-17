/**
 * Browser globals that Node services expect. Imported FIRST (before any
 * service module evaluates) by src/lib/ipc.ts's browser-demo branch.
 */
import { Buffer } from 'buffer';

const g = globalThis as any;

if (!g.Buffer) g.Buffer = Buffer;

if (!g.process) {
  g.process = {
    env: {} as Record<string, string | undefined>,
    platform: 'browser',
    arch: 'x64',
    pid: 1,
    versions: {},
    cwd: () => '/',
    nextTick: (fn: (...a: any[]) => void, ...a: any[]) => setTimeout(() => fn(...a), 0),
  };
}

if (typeof g.__dirname === 'undefined') g.__dirname = '/browser';
if (typeof g.__filename === 'undefined') g.__filename = '/browser/app.js';

export {};
