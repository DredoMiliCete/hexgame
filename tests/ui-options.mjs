// Options / Editable Heroes / HUD layout UI test with jsdom (dev only): JSDOM_FROM=/path/to/dir-with-jsdom/ node tests/ui-options.mjs
import { createRequire } from 'module';
import assert from 'assert/strict';
const require = createRequire(process.env.JSDOM_FROM || import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="app"></div>', { pretendToBeVisual: true, url: 'http://localhost/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, requestAnimationFrame: (f) => setTimeout(f, 0), alert: (m) => { throw new Error('alert: ' + m); }, confirm: () => true });
globalThis.Image = dom.window.Image; globalThis.localStorage = dom.window.localStorage;
process.on('unhandledRejection', (e) => { console.error('UNHANDLED', e); process.exit(1); });
await import('../js/main.js');
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const tick = () => new Promise((r) => setTimeout(r, 5));
const click = async (el) => { assert.ok(el, 'element to click'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await tick(); };
const change = async (el) => { el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await tick(); };
let n = 0; const ok = (m) => { n++; console.log('ok -', m); };

// Editable Heroes is off by default: the hero page shows plain stats
await click($('[data-go="heroes"]')); await click($('.hcard[data-id="vanish"]'));
assert.equal($$('[data-stat]').length, 0); ok('Editable Heroes off: no stat inputs');
await click($('[data-back]')); await click($('[data-go="options"]'));
assert.equal($('#edheroes').checked, false); assert.equal($('#maxsize').value, '13'); ok('Options: Editable Heroes unchecked, default map size 13');
$('#edheroes').checked = true; await change($('#edheroes'));
await click($('[data-back]')); await click($('[data-go="heroes"]')); await click($('.hcard[data-id="vanish"]'));
assert.deepEqual($$('[data-stat]').map((i) => i.dataset.stat), ['hp', 'move', 'atk', 'reach', 'ap']); ok('Editable Heroes on: HP, Move, Attack, Reach and AP are editable');
const base = Number($('[data-stat="hp"]').value);
$('[data-stat="hp"]').value = String(base + 3); await click($('[data-stat-save]'));
assert.equal(Number($('[data-stat="hp"]').value), base + 3); assert.equal($('[data-stat-reset]').disabled, false); ok('stat edit saved');
await click($('[data-back]')); await click($('[data-go="draft"]')); assert.ok(true); await click($('[data-back]'));
await click($('[data-go="heroes"]')); await click($('.hcard[data-id="vanish"]')); await click($('[data-stat-reset]'));
assert.equal(Number($('[data-stat="hp"]').value), base); ok('Reset to CSV');
$('[data-stat="hp"]').value = '9'; await click($('[data-stat-save]'));
await click($('[data-back]')); await click($('[data-go="options"]')); await click($('#oclear'));
assert.ok($$('.msg').some((m) => m.textContent.includes('removed'))); await click($('[data-back]')); await click($('[data-go="heroes"]')); await click($('.hcard[data-id="vanish"]'));
assert.equal(Number($('[data-stat="hp"]').value), base); ok('Reset game cache clears the edited stats');

// Hero kits shown in the hero screen
for (const [id, names] of [['sailor', ['Cheers', 'Metal Leg']], ['monkey', ['Kick Punch Special', 'Last Stand']], ['cigar', ['Consume Fumes', 'Lung Resist']]]) {
  await click($(`.hcard[data-id="${id}"]`)); for (const nm of names) assert.ok($('.detail').textContent.includes(nm), id + ' ' + nm);
}
ok('Sailor, Monkey and Cigar show their full kits');

// in-game top bar
await click($('[data-back]')); await click($('[data-go="constructed"]')); await click($('#go'));
for (const t of [0, 1]) { const sel = $(`[data-comp="${t}"]`); sel.value = 'interrail'; await change(sel); }
await click($('#start')); await tick(); await tick();
assert.ok($('.hudl .hudteam.t0')); assert.ok($('.hudr .hudteam.t1')); assert.equal($$('.hudmid .vball').length, 2); assert.equal($$('.hudmid .vball i').length, 6); assert.equal($$('.hudmid .gold').length, 2); assert.equal($$('.hudmid .bar i').length, 9);
assert.ok($$('.hudmid .objrow > *').map((e) => e.className.split(' ')[0]).join(' ').startsWith('gold vball bar vball gold'));
assert.ok($('.footl [data-act="menu"]') && $('.footr [data-act="rats"]')); assert.equal($$('.hud button').length, 0); ok('top bar: Blu left, Red right, control bar + VIP balls + gold money in the middle; menu buttons at the bottom corners');
console.log(`\n${n} UI checks passed`); process.exit(0);
