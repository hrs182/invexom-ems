/** `node:https` shim — the updater never runs in the browser demo. */
export function request(): never {
  throw new Error('https unavailable in browser demo');
}
export function get(): never {
  throw new Error('https unavailable in browser demo');
}

const httpsShim = { request, get };
export default httpsShim;
