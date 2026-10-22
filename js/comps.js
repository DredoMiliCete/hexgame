// Saved team compositions (Compbuilder). Stored in the browser's localStorage; "Interrail Comp" is built in.
const KEY = 'hexgame.comps.v1';
export const BUILTIN = [{ id: 'interrail', name: 'Interrail Comp', builtin: true, heroes: ['vanish', 'glove', 'squeak', 'greyson', 'tune', 'income', 'hail'] }];
export function loadComps() {
  let mine = [];
  try { const raw = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(raw)) mine = raw.filter((c) => c && c.id && c.name && Array.isArray(c.heroes)); } catch { /* ignore */ }
  return [...BUILTIN, ...mine];
}
export function saveComps(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.filter((c) => !c.builtin))); return true; } catch { return false; }
}
export const newId = () => 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
