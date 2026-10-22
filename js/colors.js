// Hero colour identities (used on panels, cards and buttons - NOT on the board, where tokens keep the Blu/Red rings).
// Placeholder palette: change freely.
import { HEROES } from './data.js';
import { heroImage } from './assets.js';
export const HERO_COLORS = {
  vanish: '#d4a72c', glove: '#b04a9e', driver: '#e8743b', sailor: '#2fa5a0', squeak: '#a39580', monkey: '#9a6a3a', greyson: '#5a6ee0', trick: '#8a4ad0',
  tune: '#3fb86b', claws: '#d96f9c', income: '#8cc21a', hail: '#6ec6f0', oak: '#5b8c3a', clark: '#c9ab72', bullseye: '#8f9aa6', cigar: '#9b7a62',
  joniclan: '#e06fb3', manucss: '#4fb3a1', pombo: '#a0c4ff', sonecas: '#c7b3ff',
};
export const heroColor = (id) => HERO_COLORS[id] || '#889';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function portrait(def, cls = '') {
  const st = `style="--hc:${heroColor(def.id)}"`; const p = heroImage(def);
  return p ? `<img class="por ${cls}" ${st} src="${p}" alt="">` : `<span class="por ph ${cls}" ${st}>${esc(def.name.slice(0, 2))}</span>`;
}
export const portraitById = (id, cls = '') => { const d = HEROES.find((h) => h.id === id); return d ? portrait(d, cls) : ''; };
