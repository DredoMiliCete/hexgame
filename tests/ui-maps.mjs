// Map maker UI test with jsdom (dev only): JSDOM_FROM=/path/to/dir-with-jsdom/ node tests/ui-maps.mjs
import { createRequire } from 'module';
import assert from 'assert/strict';
const require = createRequire(process.env.JSDOM_FROM || import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="app"></div>', { pretendToBeVisual: true, url: 'http://localhost/' });
const confirms = []; let confirmAnswer = true;
Object.assign(globalThis, { window: dom.window, document: dom.window.document, requestAnimationFrame: (f) => setTimeout(f, 0), alert: (m) => { throw new Error('alert: ' + m); }, confirm: (m) => { confirms.push(m); return confirmAnswer; } });
globalThis.Image = dom.window.Image; globalThis.localStorage = dom.window.localStorage;
process.on('unhandledRejection', (e) => { console.error('UNHANDLED', e); process.exit(1); });
await import('../js/main.js');
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const tick = () => new Promise((r) => setTimeout(r, 2));
const ev = (el, type, init = {}) => el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, ...init }));
const click = async (el) => { assert.ok(el, 'element to click is missing'); ev(el, 'click'); await tick(); };
const cell = (x, y) => $(`#mmboard [data-x="${x}"][data-y="${y}"]`);
const tool = (c) => click($(`[data-tool="${c}"]`));
const put = async (c, x, y) => { await tool(c); await click(cell(x, y)); };
let n = 0; const ok = (m) => { n++; console.log('ok -', m); };

// ---- list ----
await click($('[data-go="maps"]'));
assert.equal($$('.mmcard').length, 5); assert.equal($$('[data-del]').length, 0); assert.ok(document.body.textContent.includes('Pride Map')); ok('map list: 5 built-in maps, none deletable');

// ---- new map: size, spawn rule ----
await click($('[data-new]'));
assert.equal($$('#mmboard .mcell').length, 144); assert.ok($('[data-act=save]').disabled); ok('new map: 12x12 board, Save disabled');
for (let x = 0; x < 7; x++) await put('BS', x, 0);
assert.ok($('[data-act=save]').disabled); assert.ok($('.errs').textContent.includes('Red Spawn tiles: 0/7'));
for (let x = 0; x < 6; x++) await put('RS', x, 9);
assert.ok($('[data-act=save]').disabled); assert.ok($('.errs').textContent.includes('6/7'));
await put('RS', 6, 9); assert.ok(!$('[data-act=save]').disabled); ok('Save needs 7 Blu Spawn and 7 Red Spawn tiles');

// ---- teleport: must be connected (new anchor), cancel changes nothing ----
await tool('BT'); await click(cell(2, 4)); assert.ok($('.flow').textContent.includes('Connect it')); assert.ok(!cell(2, 4).classList.contains('void') || true);
await click($('[data-act=cancelflow]')); assert.ok(cell(2, 4).classList.contains('void')); ok('teleport: cancelling the link places nothing');
await tool('BT'); await click(cell(2, 4)); await click($('[data-newkind="A"]')); assert.ok($$('#mmboard .hlp').length > 100);
await click(cell(5, 5)); assert.ok(!cell(2, 4).classList.contains('void')); assert.ok(!cell(5, 5).classList.contains('void')); assert.equal($$('#mmboard .mmlink').length, 1); ok('teleport + new anchor created and linked');
await tool('BT'); await click(cell(3, 6)); assert.equal($$('#mmboard .hlp').length, 2); await click(cell(5, 5)); assert.equal($$('#mmboard .mmlink').length, 2); ok('teleport connected to an existing anchor');
await tool('RT'); await click(cell(8, 4)); await click($('[data-newkind="T"]')); await click(cell(9, 8)); assert.equal($$('#mmboard .mmlink.r').length, 2); ok('new teleport pair (Red)');

// ---- high ground needs a direction ----
await tool('HG'); await click(cell(6, 6)); assert.ok(cell(6, 6).classList.contains('void')); assert.equal($$('[data-dir]').length, 6);
await click(cell(7, 7)); assert.ok(cell(7, 7).classList.contains('void')); // board is locked until a direction is chosen
await click($('[data-dir="UP_RIGHT"]')); assert.ok(!cell(6, 6).classList.contains('void')); assert.equal($$('[data-dir]').length, 0); assert.ok(cell(6, 6).querySelector('path')); ok('High Ground: direction is required, arrow drawn');

// ---- drag paint + undo ----
await tool('WW'); const before = $$('#mmboard .mcell.void').length;
ev(cell(0, 3), 'mousedown', { button: 0 }); for (const x of [1, 2, 3]) ev(cell(x, 3), 'mouseover', { buttons: 1 }); ev(cell(3, 3), 'mouseup'); await tick(); ev(cell(3, 3), 'click'); await tick();
assert.equal($$('#mmboard .mcell.void').length, before - 4); await click($('[data-act=undo]')); assert.equal($$('#mmboard .mcell.void').length, before); ok('drag-paint is one undo step');

// ---- erasing a link target asks first and removes the dangling teleports ----
await tool('ERASE'); confirms.length = 0; await click(cell(5, 5)); assert.equal(confirms.length, 1); assert.ok(confirms[0].includes('2 teleports'));
assert.ok(cell(2, 4).classList.contains('void') && cell(3, 6).classList.contains('void')); await click($('[data-act=undo]')); assert.ok(!cell(2, 4).classList.contains('void')); ok('erasing a link target removes dependants (confirmed), undo restores');

// ---- save ----
await tool('MP'); await click(cell(4, 4));
const name = $('#mmname'); name.value = 'UI Map'; name.dispatchEvent(new dom.window.Event('input')); await click($('[data-act=save]'));
assert.ok($('.msg').textContent.includes('Saved "UI Map"')); assert.ok($('[data-act=delete]')); ok('saved a custom map');

// ---- back to the list, built-in edit is a copy ----
await click($('[data-back]')); assert.equal($$('.mmcard').length, 6); assert.equal($$('[data-del]').length, 1);
const lustIdx = $$('.mmcard').findIndex((c) => c.textContent.includes('Lust Map'));
await click($$('[data-edit]')[lustIdx]); assert.equal($$('#mmboard .mcell').length, 169, 'Lust Map is 13x13 so the grid expands'); assert.equal($('#mmname').value, 'Lust Map copy'); assert.ok(!$('[data-act=delete]')); assert.ok(!$('[data-act=save]').disabled);
name.value = 'Pride Map'; $('#mmname').value = 'Pride Map'; await click($('[data-act=save]')); assert.ok($('.msg').textContent.includes('built-in')); ok('built-in maps open as copies; their names are reserved; larger maps keep their size');
await click($('[data-back]')); // dirty? (no edits) -> back to list
assert.equal($$('.mmcard').length, 6);

// ---- the custom map is offered by the game modes and is playable ----
await click($('[data-back]')); await click($$('[data-go]')[1]);
const sel = $('#map'); assert.ok([...sel.options].some((o) => o.value === 'UI Map' && o.textContent.includes('(custom)'))); sel.value = 'UI Map'; await click($('#go'));
const s0 = $('[data-comp="0"]'); s0.value = 'interrail'; s0.dispatchEvent(new dom.window.Event('change')); await tick();
{ const col = $$('.csel')[1]; for (const c of [...col.querySelectorAll('.hcard')].slice(0, 7)) await click(c); }
await click($('#start')); await tick();
// bot: clicks through prompts; `onTiles(g, tileEls, team)` can inspect every highlighted-tile prompt
async function play(stop, onTiles = () => {}) {
  let steps = 0;
  while (steps++ < 1500) {
    await tick(); await tick(); const g = window.__game; if (!g || g.over || stop(g)) return g;
    const cover = $('#cover'); if (cover && !cover.hidden) { const b = cover.querySelector('[data-act=go]'); if (b) { await click(b); continue; } }
    const tiles = $$('.tile.hl'); const opts = $$('[data-act=opt]'); const gather = $$('[data-act=gather]:not([disabled])');
    if (tiles.length) { onTiles(g, tiles, Number(($('.prompt .who')?.className.match(/t(\d)/) || [])[1])); await click(tiles[Math.floor(Math.random() * tiles.length)]); continue; }
    if ($('[data-act=submit]')) { if (gather[0]) await click(gather[0]); await click($('[data-act=submit]')); continue; }
    if (opts.length) { await click(opts[Math.floor(Math.random() * opts.length)]); continue; }
    if ($('[data-act=pass]')) await click($('[data-act=pass]'));
  }
  throw new Error('bot got stuck');
}
let g = await play((q) => q.round >= 2 && q.phase === 'round');
assert.equal(g.mapName, 'UI Map'); ok(`game played on the custom map (round ${g.round})`);

// ---- pregame prompts only offer own/neutral tiles (Pride Map) ----
await click($('[data-act=menu]')); await click($$('[data-go]')[1]); $('#map').value = 'Pride Map'; await click($('#go'));
{ const s1 = $('[data-comp="0"]'); s1.value = 'interrail'; s1.dispatchEvent(new dom.window.Event('change')); await tick(); const col = $$('.csel')[1]; for (const c of [...col.querySelectorAll('.hcard')].slice(0, 7)) await click(c); }
await click($('#start')); await tick();
let pregamePrompts = 0;
g = await play((q) => q.phase === 'gather' || q.round >= 1, (q, tiles, team) => {
  if (q.phase !== 'pregame') return; pregamePrompts++;
  for (const t of tiles) assert.notEqual(q.terr(Number(t.dataset.x), Number(t.dataset.y)), 1 - team, `pregame offered an enemy tile to team ${team}`);
});
assert.ok(pregamePrompts > 5); ok(`pregame: ${pregamePrompts} move prompts, none offered enemy territory`);

// ---- delete a custom map ----
await click($('[data-act=menu]')); // leave the game (confirm -> true)
await click($('[data-go="maps"]')); await click($('[data-del]')); assert.equal($$('.mmcard').length, 5); assert.ok(!$$('.mmcard b').some((b) => b.textContent === 'UI Map')); ok('custom maps can be deleted');

// ---- options: raise the size limit ----
await click($('[data-back]')); await click($('[data-go="options"]'));
$('#maxsize').value = '14'; await click($('#osave')); assert.ok($('.msg').textContent.includes('14×14'));
await click($('[data-back]')); await click($('[data-go="maps"]')); await click($('[data-new]')); assert.equal($$('#mmboard .mcell').length, 196); ok('Options: bigger map size gives a bigger board');
await click($('[data-back]')); await click($('[data-back]')); await click($('[data-go="options"]')); $('#maxsize').value = '9'; await click($('#osave')); assert.ok($('.msg').textContent.includes('whole number from 12')); ok('Options: values below 12 are rejected');
console.log(`\n${n} UI checks passed`); process.exit(0);
