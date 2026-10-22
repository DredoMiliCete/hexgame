// In-game options (stored in the browser's localStorage).
const KEY = 'hexgame.options.v1';
export const DEFAULT_MAX_MAP_SIZE = 12;   // map maker grid: coordinates 0,0 to 11,11
export const MAX_MAP_SIZE_LIMIT = 30;     // upper bound of the option (bigger grids get hard to click)
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
function read() { try { const o = JSON.parse(store()?.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
export function getMaxMapSize() {
  const n = Math.floor(Number(read().maxMapSize));
  return Number.isFinite(n) ? Math.min(MAX_MAP_SIZE_LIMIT, Math.max(DEFAULT_MAX_MAP_SIZE, n)) : DEFAULT_MAX_MAP_SIZE;
}
export function setMaxMapSize(n) {
  const v = Math.min(MAX_MAP_SIZE_LIMIT, Math.max(DEFAULT_MAX_MAP_SIZE, Math.floor(Number(n)) || DEFAULT_MAX_MAP_SIZE));
  try { store()?.setItem(KEY, JSON.stringify({ ...read(), maxMapSize: v })); } catch { return null; }
  return v;
}
