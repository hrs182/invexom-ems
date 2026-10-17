/** `node:child_process` shim — hardware fingerprinting is desktop-only. */
export function execFileSync(): never {
  throw new Error('child_process unavailable in browser demo');
}
export function execSync(): never {
  throw new Error('child_process unavailable in browser demo');
}
export function spawnSync(): never {
  throw new Error('child_process unavailable in browser demo');
}

const cpShim = { execFileSync, execSync, spawnSync };
export default cpShim;
