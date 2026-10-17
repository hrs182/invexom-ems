
/**
 * `node:module` shim. electron-shim.ts calls createRequire() at module top;
 * in the browser there is nothing to require — return a thrower. The
 * electron-shim wraps the require call in try/catch and falls back to {},
 * so all Electron APIs become undefined (guarded by webMode checks).
 */
export function createRequire(): (id: string) => never {
  return () => {
    throw new Error('require unavailable in browser demo');
  };
}

const moduleShim = { createRequire };
export default moduleShim;
