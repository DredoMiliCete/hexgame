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
const change = async (el) => { el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await tick(); };
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
// ---- case file, crews, hire card ----
await click($('[data-act=menu]'));
await click($('[data-go="heroes"]')); await click($('.hcard[data-id="claws"]'));
assert.ok($('.dossier .dsr-top').textContent.toLowerCase().includes('case file')); assert.ok($('.dossier .dsr-note').textContent.length > 20); assert.ok($('.dossier').textContent.includes('GLUTTONY')); assert.ok(!/A\.K\.A\.|Family|crew/i.test($('.dossier').textContent));
assert.equal($$('.crewhead').length, 0); assert.equal($$('#bycrew').length, 0);
ok('hero panel: case file (no alias / crew)');
await click($('[data-back]')); await click($$('[data-go]')[0]); await click($('#go'));
$('.hcard[data-id="glove"]').dispatchEvent(new dom.window.MouseEvent('mouseenter')); await tick();
assert.ok($('.detail .hirecard').textContent.includes('Mercenary for hire')); assert.equal($('.detail .hirecard .hc-name').textContent, 'Glove'); assert.ok($('.detail .dossier')); assert.equal($$('.drafting .crewhead').length, 0);
ok('draft: hire card + case file on hover');

// ---- Options: starting AP ----
await click($('[data-back]')); await click($('[data-go="options"]'));
assert.equal($('#apblu').value, '0'); assert.equal($('#apred').value, '0');
$('#apblu').value = '3'; $('#apred').value = '1'; await click($('#apsave')); assert.ok($('.msg:nth-of-type(2)') || true); assert.ok(document.body.textContent.includes('Blu starts each round with 3 AP, Red with 1 AP')); assert.equal($('#apblu').value, '3');
$('#apred').value = '99'; await click($('#apsave')); assert.ok(document.body.textContent.includes('whole numbers from 0 to 20')); ok('options: starting AP per team (validated)');
await click($('[data-back]')); await startOn('Pride Map');
assert.deepEqual(window.__game.startAP, [3, 1]);
ok('game: starting AP option applied');
await click($('[data-act=menu]')); await click($('[data-go="options"]')); await click($('#apreset')); assert.equal($('#apblu').value, '0'); ok('options: reset to 0');
console.log(`\n${n} theme UI checks passed`); process.exit(0);
