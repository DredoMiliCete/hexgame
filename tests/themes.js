// Burrow theme + role checks: node tests/themes.js
import assert from 'assert/strict';
import { THEMES, DEFAULT_THEME, themeFor, sceneryHtml, plaqueHtml, patternDefs, PATTERNS, burrowInfo } from '../js/themes.js';
import { MAPS, HEROES, ROLES, SUBROLES, PLACES } from '../js/data.js';
let n = 0; const ok = (m) => { n++; console.log('ok -', m); };

// sRGB -> CIE Lab, then the CIE76 colour difference
const lab = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const [x, y, z] = [(c[0] * 0.4124 + c[1] * 0.3576 + c[2] * 0.1805) / 0.95047, c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722, (c[0] * 0.0193 + c[1] * 0.1192 + c[2] * 0.9505) / 1.08883];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};
const dE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

{ // every built-in map has its own burrow theme, and the lore file knows the burrow
  for (const name of Object.keys(MAPS)) { const t = themeFor(name); assert.ok(!t.custom, name); assert.equal(`${t.sin} Map`, name); assert.ok(PLACES[t.sin]?.desc, `lore for ${t.sin}`); }
  assert.equal(Object.keys(THEMES).length, 7); assert.ok(themeFor('My Own Map').custom); assert.equal(themeFor('My Own Map'), DEFAULT_THEME); ok('7 burrows <-> 7 built-in maps, custom maps get the Downtown look');
}
{ // gameplay colours stay readable in every theme: Blu / Red / Middle / Wall tiles, and Blu vs Red start tiles
  const MIN = 22;
  for (const t of Object.values(THEMES)) {
    const c = t.tiles;
    for (const [a, b] of [['BN', 'RN'], ['BN', 'MM'], ['RN', 'MM'], ['BN', 'WW'], ['RN', 'WW'], ['MM', 'WW'], ['BS', 'RS'], ['BS', 'BN'], ['RS', 'RN'], ['MP', 'MM'], ['CP', 'MM'], ['CP', 'MP']]) {
      assert.ok(dE(c[a], c[b]) >= MIN, `${t.key}: ${a} vs ${b} too similar (dE ${dE(c[a], c[b]).toFixed(1)})`);
    }
    for (const code of Object.keys(DEFAULT_THEME.tiles)) assert.match(c[code], /^#[0-9a-f]{6}$/i, `${t.key}.${code}`);
    for (const id of Object.values(t.tex).filter(Boolean)) assert.ok(PATTERNS[id], `${t.key}: unknown texture ${id}`);
  }
  ok('territory / wall / objective colours are distinguishable in all themes');
}
{ // backdrops and plaques render; ids inside a backdrop are unique per call
  for (const t of Object.values(THEMES)) { const s = sceneryHtml(t); assert.ok(s.startsWith('<svg') && s.length > 800 && s.length < 60000, `${t.key} svg size ${s.length}`); assert.ok(plaqueHtml(t).includes(burrowInfo(t).title.toUpperCase())); }
  assert.notEqual(sceneryHtml(THEMES.pride), sceneryHtml(THEMES.pride)); assert.ok(patternDefs().includes('tx-grass')); ok('backdrops, plaques, textures');
}
{ // roles.csv: every hero role/subrole has a colour and a description
  for (const h of HEROES) if (h.class) { assert.ok(ROLES[h.class]?.desc && ROLES[h.class].color, h.class); assert.ok(SUBROLES[h.subrole]?.desc, h.subrole); assert.ok(ROLES[SUBROLES[h.subrole].parent], 'parent role'); }
  assert.equal(Object.keys(ROLES).length, 4); assert.equal(Object.keys(SUBROLES).length, 12); ok('roles: colours and descriptions for 4 roles + 12 subroles');
}
console.log(`\n${n} theme checks passed`);
