/** `node:os` shim — only homedir/tmpdir/platform are touched in dead branches. */
export function homedir(): string { return '/browser'; }
export function tmpdir(): string { return '/tmp'; }
export function platform(): string { return 'browser'; }
export function arch(): string { return 'x64'; }

const osShim = { homedir, tmpdir, platform, arch };
export default osShim;
