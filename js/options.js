// In-game options (stored in the browser's localStorage) and the "reset game cache" action.
import { resetImageCache } from './assets.js';
const KEY = 'hexgame.options.v1';
export const DEFAULT_MAX_MAP_SIZE = 13;   // map maker grid: coordinates 0,0 to 12,12
export const MAX_MAP_SIZE_LIMIT = 30;     // upper bound of the option (bigger grids get hard to click)
// Everything the reset action wipes (the options themselves are kept).
export const CACHE_KEYS = ['hexgame.comps.v1', 'hexgame.maps.v1', 'hexgame.stats.v1'];
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
function read() { try { const o = JSON.parse(store()?.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
function write(patch) { try { store()?.setItem(KEY, JSON.stringify({ ...read(), ...patch })); return !!store(); } catch { return false; } }
export function getMaxMapSize() {
  const n = Math.floor(Number(read().maxMapSize));
  return Number.isFinite(n) ? Math.min(MAX_MAP_SIZE_LIMIT, Math.max(DEFAULT_MAX_MAP_SIZE, n)) : DEFAULT_MAX_MAP_SIZE;
}
export function setMaxMapSize(n) {
  const v = Math.min(MAX_MAP_SIZE_LIMIT, Math.max(DEFAULT_MAX_MAP_SIZE, Math.floor(Number(n)) || DEFAULT_MAX_MAP_SIZE));
  return write({ maxMapSize: v }) ? v : null;
}
// "Editable Heroes": when on, the Hero abilities screen lets you change HP / Move / Attack / Reach / AP (off by default).
export const getEditableHeroes = () => read().editableHeroes === true;
export const setEditableHeroes = (on) => write({ editableHeroes: !!on });
// Removes custom compositions, custom maps, edited hero stats and the loaded-image cache. Returns the number of stored items removed.
export function resetGameCache() {
  let n = 0;
  for (const k of CACHE_KEYS) { try { if (store()?.getItem(k) != null) n++; store()?.removeItem(k); } catch { /* ignore */ } }
  resetImageCache();
  return n;
}
