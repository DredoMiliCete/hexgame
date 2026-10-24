// Role chips / tooltip and burrow theming in the UI (jsdom, dev only): JSDOM_FROM=/path/with/jsdom/ node tests/ui-theme.mjs
import { createRequire } from 'module';
import assert from 'assert/strict';
const require = createRequire(process.env.JSDOM_FROM || import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="app"></div>', { pretendToBeVisual: true, url: 'http://localhost/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, requestAnimationFrame: (f) => setTimeout(f, 0), alert: (m) => { throw new Error('alert: ' + m); }, confirm: () => true });
globalThis.Image = dom.window.Image; globalThis.localStorage = dom.window.localStorage;
process.on('unhandledRejection', (e) => { console.error('UNHANDLED', e); process.exit(1); });
const { ROLES, SUBROLES } = await import('../js/data.js');
await import('../js/main.js');
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const tick = () => new Promise((r) => setTimeout(r, 5));
const ev = (el, type) => el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true }));
const click = async (el) => { assert.ok(el, 'missing element'); ev(el, 'click'); await tick(); };
let n = 0; const ok = (m) => { n++; console.log('ok -', m); };

// menu: title + a burrow backdrop
assert.ok($('.menu h1').textContent === 'Turfwars'); assert.ok($('.menu .scenery svg')); assert.match($('.menu').dataset.burrow, /^(pride|wrath|gluttony|greed|lust|envy|sloth)$/); ok('menu: Turfwars + burrow backdrop');

// hero panel: coloured chips + hover tooltip with the roles.csv description
await click($('[data-go="heroes"]'));
const role = $('.hcard .rchip.role'); assert.ok(role.style.getPropertyValue('--rc') === ROLES[role.dataset.role].color);
ev(role, 'mouseover'); const tip = $('#roletip'); assert.ok(!tip.hidden); assert.ok(tip.textContent.includes(ROLES[role.dataset.role].desc)); assert.ok(tip.textContent.includes(role.dataset.role));
const sub = $('.hcard .rchip.subrole'); ev(sub, 'mouseover'); const sd = SUBROLES[sub.dataset.subrole];
assert.ok(tip.textContent.includes(sd.desc) && tip.textContent.includes(sd.parent)); assert.equal(sub.style.getPropertyValue('--rc'), sd.color);
ev($('h2'), 'mouseover'); assert.ok(tip.hidden); ok('role / subrole chips: colours from roles.csv, description on hover, hidden on leave');

// setup: burrow card follows the selected map
await click($('[data-back]')); await click($$('[data-go]')[1]); const sel = $('#map');
sel.value = 'Envy Map'; sel.dispatchEvent(new dom.window.Event('change')); assert.ok($('#burrowcard').textContent.includes('ENVY')); sel.value = ''; sel.dispatchEvent(new dom.window.Event('change')); assert.ok($('#burrowcard').textContent.includes('RANDOM')); ok('setup: burrow card');

// game: theme applied (built-in map) and Downtown for a custom map
async function startOn(map) {
  await click($$('[data-go]')[1]); $('#map').value = map; await click($('#go'));
  for (const t of [0, 1]) { const s = $(`[data-comp="${t}"]`); s.value = 'interrail'; s.dispatchEvent(new dom.window.Event('change')); await tick(); }
  await click($('#start')); await tick(); await tick();
}
await click($('[data-back]')); await startOn('Sloth Map');
let game = $('.game'); assert.equal(game.dataset.burrow, 'sloth'); assert.ok(game.getAttribute('style').includes('--gold')); assert.ok($('#scenery svg.scn')); assert.ok($('#plaque').textContent.includes('SLOTH'));
assert.ok($('#board defs pattern#tx-sand')); assert.ok($$('#board polygon[fill^="url(#tx-"]').length > 50); ok('game: Sloth theme (variables, backdrop, plaque, tile textures)');
await click($('[data-act=menu]'));
globalThis.localStorage.setItem('hexgame.maps.v1', JSON.stringify([{ name: 'Mine', tiles: JSON.parse(JSON.stringify((await import('../js/data.js')).MAPS['Pride Map'])) }]));
await startOn('Mine'); game = $('.game'); assert.equal(game.dataset.burrow, 'downtown'); assert.ok($('#plaque').textContent.includes('Custom map')); ok('game: custom map uses the Downtown look');
console.log(`\n${n} theme UI checks passed`); process.exit(0);
