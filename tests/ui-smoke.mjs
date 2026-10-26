// UI smoke test with jsdom (dev only): node tests/ui-smoke.mjs   (needs `npm i jsdom` somewhere resolvable)
import { createRequire } from 'module';
const require = createRequire(process.env.JSDOM_FROM || import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="app"></div>', { pretendToBeVisual: true, url: 'http://localhost/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, requestAnimationFrame: (f) => setTimeout(f, 0), alert: (m) => { throw new Error('alert: ' + m); }, confirm: () => true });
globalThis.Image = dom.window.Image; globalThis.localStorage = dom.window.localStorage;
process.on('unhandledRejection', (e) => { console.error('UNHANDLED', e); process.exit(1); });
await import('../js/main.js');
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const tick = () => new Promise((r) => setTimeout(r, 2));
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
click($('[data-go="comps"]')); await tick();           // compbuilder
if (!document.body.textContent.includes('Interrail Comp')) throw new Error('Interrail Comp missing');
click($('[data-new]')); await tick(); for (const c of $$('.hcard').slice(0, 7)) { click(c); await tick(); }
const nm = $('#cname'); nm.value = 'Test comp'; nm.dispatchEvent(new dom.window.Event('input')); click($('#csave')); await tick();
if (!document.body.textContent.includes('Saved.')) throw new Error('comp not saved');
click($('[data-back]')); await tick();
click($$('[data-go]')[1]); await tick();           // constructed
click($('#go')); await tick();
const sel0 = $('[data-comp="0"]'); sel0.value = 'interrail'; sel0.dispatchEvent(new dom.window.Event('change')); await tick();
{ const col = $$('.csel')[1]; for (const c of [...col.querySelectorAll('.hcard')].slice(0, 7)) { click(c); await tick(); } }
click($('#start')); await tick();
console.log('game started with saved comp + custom comp');
let steps = 0, kinds = {}, consecEnd = 0;
while (steps++ < 1500) {
  await tick(); await tick();
  const g = window.__game; if (!g || g.over) break;
  if (process.env.STOP_ROUND && g.round >= Number(process.env.STOP_ROUND) && g.phase === 'round' && $('[data-act=pass]')) break;
  const cover = $('#cover'); if (cover && !cover.hidden) { const b = cover.querySelector('[data-act=go]'); if (b) { click(b); kinds.cover = 1; continue; } }
  const tiles = $$('.tile.hl'); const opts = $$('[data-act=opt]'); const gather = $$('[data-act=gather]:not([disabled])');
  if (tiles.length) { click(tiles[Math.floor(Math.random() * tiles.length)]); kinds.tile = (kinds.tile || 0) + 1; continue; }
  if ($('[data-act=submit]')) { if (gather[0]) click(gather[0]); click($('[data-act=submit]')); kinds.gather = (kinds.gather || 0) + 1; continue; }
  if (opts.length) { click(opts[Math.floor(Math.random() * opts.length)]); kinds.opt = (kinds.opt || 0) + 1; continue; }
  if ($('[data-act=pass]')) {
    const mine = g.ents.filter((e) => g.team(e) === g.turn.team && !e.dead && (e.x != null) && g.actionDefs(e).some((d) => d.ok));
    if (!mine.length || Math.random() < 0.03) { click($('[data-act=pass]')); kinds.end = (kinds.end || 0) + 1; if (++consecEnd > 40) { kinds.end = 9999; break; } continue; }
    const e = mine[Math.floor(Math.random() * mine.length)]; await tick();
    const sel = window.__game.ents.find((x) => x.id === e.id); void sel;
    consecEnd = 0; const btns = $$('[data-act=do]:not([disabled])'); if (btns.length) { click(btns[Math.floor(Math.random() * btns.length)]); kinds.act = (kinds.act || 0) + 1; }
    
  }
}
if (kinds.end >= 9999) { const g = window.__game; console.log('STALL', g.phase, 'round', g.round, JSON.stringify(g.turn), 'pool', g.pool, 'glove', g.glovePool); console.log(g.logs.slice(-12).join('\n')); for (const t of [0, 1]) for (const e of g.heroes(t)) console.log(t, e.name, 'x', e.x, 'dead', e.dead, 'tapped', e.tapped, g.actionDefs(e).map((d) => d.key + ':' + (d.ok ? 'ok' : d.why)).join(',')); }
console.log('UI smoke finished, steps', steps, JSON.stringify(kinds), 'round', window.__game.round);
console.log('board has', $$('.tile').length, 'tiles and', $$('.ent').length, 'tokens; log lines', $$('#log div').length);
console.log('dock:', $('#dock').className, '| summary visible:', !$('#summary').hidden, '| hud active:', !!$('.hudteam.active'), '| ecols:', $$('.ecol').length);
process.exit(0);
