// Lore helpers: home burrows, the hero "case file" (dossier) and the "mercenary for hire" card.
// The home burrow of each hero comes from the `burrow` column of data/roster.csv.
import { THEMES, burrowInfo, burrowKeyOf } from './themes.js';
import { roleChips, roleColor } from './roles.js';
import { portrait, heroColor } from './colors.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const BURROW_FLAVOR = {
  pride: 'Midtown never forgets its own.', wrath: 'The foundries run hot, and so do tempers.', gluttony: 'There is always room for one more on the Great Lawn.',
  greed: 'Everything on the Exchange has a price.', lust: 'The Gallery Quarter looks back at you.', envy: 'The harbor remembers who got the better berth.',
  sloth: 'Nothing moves on the Dust Flats... until it does.',
};
export const homeKey = (d) => (d?.burrow && THEMES[d.burrow] ? d.burrow : null);
const burrowName = (key) => burrowInfo(THEMES[key]).title;
export const isHome = (d, mapName) => !!homeKey(d) && homeKey(d) === burrowKeyOf(mapName);

// ----- badges -----
export const burrowBadge = (d) => { const k = homeKey(d); return k ? `<span class="bbadge" style="--bc:${THEMES[k].vars['--gold']}" title="Home burrow">${esc(burrowName(k).toUpperCase())}</span>` : ''; };

// ----- the case file: mugshot + typed note -----
export function dossierHtml(d, { compact = false, mapName = '' } = {}) {
  const num = (d.num || '').split('/')[0] || '--'; const home = mapName && isHome(d, mapName);
  const fields = [['Name', `<b>${esc(d.name)}</b>`], ['Specialty', roleChips(d)], homeKey(d) ? ['Turf', `${burrowBadge(d)}${home ? ' <span class="hometag">home turf</span>' : ''}`] : null].filter(Boolean);
  return `<div class="dossier ${compact ? 'compact' : ''}" style="--hc:${heroColor(d.id)}">
    <div class="dsr-top"><span>Case file No. ${esc(num)}</span>${d.class ? `<span class="dsr-stamp" style="--rc:${roleColor(d.class)}">${esc(d.class)}</span>` : ''}</div>
    <div class="dsr-body"><div class="mug">${portrait(d, 'lg')}<i class="ruler"></i></div><dl>${fields.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>
    ${compact ? '' : `<p class="dsr-note">${d.blurb ? esc(d.blurb) : 'File still being typed up...'}</p>`}</div>`;
}

// ----- "mercenary for hire" card (draft screen) -----
export function hireCardHtml(d) {
  const line = (d.blurb || '').split(/(?<=[.!?])\s/)[0];
  return `<div class="hirecard" style="--hc:${heroColor(d.id)}"><div class="hc-top"><span>&#9733; Mercenary for hire &#9733;</span></div>
    <div class="hc-name">${esc(d.name)}</div><div class="hc-roles">${roleChips(d)}</div>
    ${line ? `<div class="hc-line">&ldquo;${esc(line)}&rdquo;</div>` : ''}
    <div class="hc-foot"><span>${d.implemented ? `Rate: <b>${d.ap} AP</b> per round` : 'Rate: on request'}</span></div></div>`;
}

// ----- game log flavour (pure, used by the engine at the start of round 1) -----
// heroes: [{ name, def, team }]
export function turfLines(mapName, heroes, teamNames) {
  const key = burrowKeyOf(mapName); const out = [];
  if (key) out.push(`${burrowName(key).toUpperCase()}: ${BURROW_FLAVOR[key]}`);
  const home = heroes.filter((h) => key && homeKey(h.def) === key);
  if (home.length) out.push(`Home turf: ${home.map((h) => `${h.name} (${teamNames[h.team]})`).join(', ')} know${home.length === 1 ? 's' : ''} these streets.`);
  return out;
}
