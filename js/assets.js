// Image lookup. Drop PNG files in assets/heroes, assets/tokens, assets/tiles - missing files just fall back to placeholders.
import { TOKENS } from './tokens.js';
const cache = new Map();
let listener = null;
let bust = ''; // cache-buster added after a reset, so changed image files are fetched again
export const onAssetLoad = (fn) => { listener = fn; };
export function resetImageCache() { cache.clear(); bust = '?v=' + Date.now(); listener?.(); }
export function probe(rawPath) { // returns the path once it is known to load, else null
  const path = rawPath + bust; const s = cache.get(path);
  if (s === 'ok') return path;
  if (s) return null;
  cache.set(path, 'loading');
  const i = new Image();
  i.onload = () => { cache.set(path, 'ok'); listener?.(); };
  i.onerror = () => cache.set(path, 'bad');
  i.src = path;
  return null;
}
export const heroImage = (def) => (def.image ? probe(`assets/heroes/${def.image}`) : null);
export const tokenImage = (kind) => (TOKENS[kind]?.image ? probe(`assets/tokens/${TOKENS[kind].image}`) : null);
export const tileImage = (type) => probe(`assets/tiles/${type}.png`);
export const heroImagePath = (def) => `assets/heroes/${def.image}`;
