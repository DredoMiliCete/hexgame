// Map registry: built-in maps (data/maps.csv -> data.js, read-only) + custom maps made in the Map maker
// (browser localStorage). Also the validation rules a map must pass before it can be saved.
import { MAPS } from './data.js';
import { CONFIG } from './config.js';
import { DIRS, DIR_LIST, key } from './hex.js';

const KEY = 'hexgame.maps.v1';
export const TILE_TYPES = ['BS', 'RS', 'BN', 'RN', 'MM', 'CP', 'MP', 'BT', 'RT', 'BA', 'RA', 'WW', 'WB', 'SB', 'HG', 'HT'];
export const TELEPORTS = ['BT', 'RT'];
// A teleport connects to the first teleport/anchor of its own colour (rules: tiles.csv).
export const TP_TARGETS = { BT: ['BT', 'BA'], RT: ['RT', 'RA'] };
export const SPAWN_MIN = CONFIG.TEAM_SIZE; // Blu Spawn and Red Spawn tiles needed to save a map

// ----- High Ground direction <-> the (+,0) sign notation used in maps.csv -----
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '-' : '0');
export const hgOf = (d) => [sgn(DIRS[d][0]), sgn(DIRS[d][1])];
export function hgDir(hg) {
  if (!Array.isArray(hg) || hg.length !== 2) return null;
  const s = (v) => (v === '+' ? 1 : v === '-' ? -1 : v === '0' ? 0 : NaN);
  const vec = [s(hg[0]), s(hg[1])];
  return DIR_LIST.find((d) => DIRS[d][0] === vec[0] && DIRS[d][1] === vec[1]) || null;
}

// ----- storage -----
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export const isBuiltinMap = (name) => Object.prototype.hasOwnProperty.call(MAPS, name);

function cleanTiles(list) {
  const out = []; const seen = new Set();
  for (const t of Array.isArray(list) ? list : []) {
    if (!t || !Number.isInteger(t.x) || !Number.isInteger(t.y) || t.x < 0 || t.y < 0 || !TILE_TYPES.includes(t.t) || seen.has(key(t.x, t.y))) continue;
    seen.add(key(t.x, t.y));
    const c = { x: t.x, y: t.y, t: t.t };
    if (TELEPORTS.includes(t.t) && Number.isInteger(t.tx) && Number.isInteger(t.ty)) { c.tx = t.tx; c.ty = t.ty; }
    if (t.t === 'HG' && hgDir(t.hg)) c.hg = [...t.hg];
    out.push(c);
  }
  return out;
}
export function loadCustomMaps() {
  try {
    const raw = JSON.parse(store()?.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    const names = new Set();
    return raw.filter((m) => m && typeof m.name === 'string' && m.name.trim() && !isBuiltinMap(m.name) && !names.has(m.name) && names.add(m.name))
      .map((m) => ({ name: m.name, tiles: cleanTiles(m.tiles) }));
  } catch { return []; }
}
function writeCustom(list) { try { store()?.setItem(KEY, JSON.stringify(list)); return !!store(); } catch { return false; } }
export function saveCustomMap(name, tiles) {
  if (isBuiltinMap(name)) return false;
  const list = loadCustomMaps().filter((m) => m.name !== name);
  list.push({ name, tiles: cleanTiles(tiles) });
  return writeCustom(list);
}
export function deleteCustomMap(name) {
  if (isBuiltinMap(name)) return false;
  return writeCustom(loadCustomMaps().filter((m) => m.name !== name));
}
export const customMapExists = (name) => loadCustomMaps().some((m) => m.name === name);

// ----- registry -----
export const getMapTiles = (name) => MAPS[name] || loadCustomMaps().find((m) => m.name === name)?.tiles || null;
export const allMapNames = () => [...Object.keys(MAPS), ...loadCustomMaps().map((m) => m.name)];
export const mapExtent = (tiles) => ({ w: tiles.reduce((a, t) => Math.max(a, t.x + 1), 0), h: tiles.reduce((a, t) => Math.max(a, t.y + 1), 0) });

// ----- validation -----
export function countTiles(tiles) { const c = {}; for (const t of tiles) c[t.t] = (c[t.t] || 0) + 1; return c; }
// Returns a list of human-readable problems; an empty list means the map can be saved.
export function validateMap(tiles) {
  const errors = []; const at = new Map(tiles.map((t) => [key(t.x, t.y), t])); const c = countTiles(tiles);
  if ((c.BS || 0) < SPAWN_MIN) errors.push(`Blu Spawn tiles: ${c.BS || 0}/${SPAWN_MIN}`);
  if ((c.RS || 0) < SPAWN_MIN) errors.push(`Red Spawn tiles: ${c.RS || 0}/${SPAWN_MIN}`);
  for (const t of tiles) {
    if (TELEPORTS.includes(t.t)) {
      const dst = t.tx != null ? at.get(key(t.tx, t.ty)) : null;
      if (!dst || !TP_TARGETS[t.t].includes(dst.t) || (dst.x === t.x && dst.y === t.y)) errors.push(`The teleport at ${t.x},${t.y} is not connected to a ${t.t === 'BT' ? 'Blu' : 'Red'} teleport/anchor`);
    }
    if (t.t === 'HG' && !hgDir(t.hg)) errors.push(`The High Ground tile at ${t.x},${t.y} has no direction`);
  }
  return errors;
}
