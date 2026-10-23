// Editable hero stats ("Editable Heroes" option). Overrides live in localStorage and are applied to the shared HEROES
// objects, so the draft, constructed mode and the game itself all use them. They only apply while the option is on.
import { HEROES } from './data.js';
import { getEditableHeroes } from './options.js';
const KEY = 'hexgame.stats.v1';
export const STAT_FIELDS = [['hp', 'HP', 1, 40], ['move', 'Move', 1, 12], ['atk', 'Attack', 0, 12], ['reach', 'Reach', 1, 12], ['ap', 'AP', 0, 12]];
const BASE = new Map(HEROES.filter((h) => h.implemented).map((h) => [h.id, Object.fromEntries(STAT_FIELDS.map(([k]) => [k, h[k]]))]));
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export const baseStats = (id) => BASE.get(id);
export function loadOverrides() {
  try { const o = JSON.parse(store()?.getItem(KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
const clamp = (stats) => {
  const out = {};
  for (const [k, , lo, hi] of STAT_FIELDS) { const v = Math.round(Number(stats?.[k])); if (Number.isFinite(v)) out[k] = Math.min(hi, Math.max(lo, v)); }
  return out;
};
const writeAll = (o) => { try { store()?.setItem(KEY, JSON.stringify(o)); return !!store(); } catch { return false; } };
export function getHeroOverride(id) { return loadOverrides()[id] || null; }
export function setHeroStats(id, stats) { // keeps only the values that differ from the CSV
  if (!BASE.has(id)) return false;
  const o = loadOverrides(); const c = clamp(stats); const diff = {};
  for (const k of Object.keys(c)) if (c[k] !== BASE.get(id)[k]) diff[k] = c[k];
  if (Object.keys(diff).length) o[id] = diff; else delete o[id];
  return writeAll(o);
}
export function resetHeroStats(id) { const o = loadOverrides(); delete o[id]; return writeAll(o); }
// Puts base (CSV) or overridden values on the HEROES objects.
export function applyHeroStats() {
  const ov = getEditableHeroes() ? loadOverrides() : {};
  for (const h of HEROES) if (BASE.has(h.id)) Object.assign(h, BASE.get(h.id), clamp(ov[h.id] || {}));
}
