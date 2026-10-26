// Online play through the real UI (jsdom, dev only): JSDOM_FROM=/path/with/jsdom/ node tests/ui-online.mjs
// One player uses the actual screens (create room, lobby, game), the opponent is a simulated client. The server is the real one.
import { createRequire } from 'module';
import assert from 'assert/strict';
import { createServer } from '../server/server.js';
import { Bot, until, makeCall } from './netbot.js';
const require = createRequire(process.env.JSDOM_FROM || import.meta.url);
const { JSDOM } = require('jsdom');

const app = createServer(); await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${app.server.address().port}`; const call = makeCall(base);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// EventSource for jsdom (browsers have it): reconnects by itself, like the real thing
class ES {
  static all = [];
  constructor(url) { this.url = String(url); this.listeners = {}; this.closed = false; ES.last = this; ES.all.push(this); this.run(); }
  addEventListener(n, f) { (this.listeners[n] ||= []).push(f); }
  close() { this.closed = true; this.ac?.abort(); }
  async run() {
    while (!this.closed) {
      this.ac = new AbortController();
      try {
        const res = await fetch(this.url, { signal: this.ac.signal }); this.onopen?.();
        const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
        for (;;) {
          const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2); let ev = 'message', data = '';
            for (const line of chunk.split('\n')) { if (line.startsWith('event:')) ev = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
            if (data) for (const f of this.listeners[ev] || []) f({ data });
          }
        }
      } catch { /* aborted or network error */ }
      if (this.closed) return; this.onerror?.(); await sleep(150);
    }
  }
}
function boot(url) {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { pretendToBeVisual: true, url });
  dom.window.prompt = () => null;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, location: dom.window.location, history: dom.window.history, localStorage: dom.window.localStorage, requestAnimationFrame: (f) => setTimeout(f, 0), alert: (m) => { throw new Error('alert: ' + m); }, confirm: () => true, EventSource: ES });
  globalThis.Image = dom.window.Image; return dom;
}
let dom = boot(`${base}/`);
process.on('unhandledRejection', (e) => { console.error('UNHANDLED', e); process.exit(1); });
const { HEROES } = await import('../js/data.js');
await import('../js/main.js');
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const tick = (ms = 5) => sleep(ms);
const click = async (el) => { assert.ok(el, 'missing element'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await tick(); };
const change = async (el) => { el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await tick(); };
let n = 0; const ok = (m) => { n++; console.log('ok -', m); };

// ---- create a room from the menu
assert.ok($('[data-go="online"]'), 'menu has Play online'); await click($('[data-go="online"]'));
assert.ok($('#create') && $('#join')); $('#oname').value = 'Ana'; $('#map').value = 'Pride Map'; $('#first').value = '0'; $('#side').value = '0';
await click($('#create')); await until(() => $('.roomcode b'), 3000, 'lobby');
const code = $('.roomcode b').textContent; assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/); assert.equal($$('.steps .step').length, 3);
assert.ok($('#link').value.endsWith(`?room=${code}`)); assert.ok($('.prow.t1 .empty'), 'waiting for the opponent'); assert.ok(location.hash === `#room=${code}`);
assert.ok(document.body.textContent.includes('You are'));
ok(`lobby: room ${code}, invite link, steps, waiting for opponent`);

// ---- the opponent joins; both pick teams
const j = await call('POST', `/api/rooms/${code}/join`, { name: 'Bruno' }); assert.equal(j.body.team, 1);
const oppIds = HEROES.filter((h) => h.implemented).map((h) => h.id).sort(() => Math.random() - 0.5).slice(0, 7);
const bot = new Bot(base, app.rooms, code, j.body.token, 1, { name: 'Bruno' }); bot.stopRound = 99; await bot.connect();
await until(() => $('.prow.t1')?.textContent.includes('Bruno') && $('.prow.t1 .dot.on'), 3000, 'opponent shown online');
$('#comp').value = 'interrail'; await change($('#comp')); assert.equal($$('.hcard.on').length, 7); assert.ok(!$('#ready').disabled);
const myIds = $$('.hcard.on').map((b) => b.dataset.id);
await click($('#ready')); await until(() => $('#unready'), 3000, 'locked in'); assert.ok(document.body.textContent.includes('locked in'));
await click($('#unready')); await until(() => $('#ready'), 3000, 'unlocked'); await click($('#ready')); await until(() => $('#unready'), 3000, 'locked again');
bot.auto = true; assert.equal((await call('POST', `/api/rooms/${code}/team`, { token: j.body.token, heroes: oppIds })).status, 200);
await until(() => $('.game'), 5000, 'game screen'); assert.equal(app.rooms.get(code).status, 'playing');
ok('lobby: pick a composition, Ready / Change team, game starts when both are ready');

// ---- play: the UI answers its own prompts, the bot answers the other side's
const oppNames = oppIds.filter((id) => !myIds.includes(id)).map((id) => HEROES.find((h) => h.id === id).name);
let waited = false, steps = 0, sawFaceDownDom = false, acted = 0, secretDomLeak = null;
const g = () => window.__game;
while (steps++ < 2500) {
  await tick(3);
  if (g().round >= 3 && g().phase === 'round') break;
  if (g().faceDown) { sawFaceDownDom = true; const hit = oppNames.find((nm) => document.body.textContent.includes(nm)); if (hit) secretDomLeak = hit; }
  if ($('.prompt .msg')?.textContent.includes('Waiting for')) waited = true;
  const tiles = $$('.tile.hl'), opts = $$('[data-act=opt]'), gather = $$('[data-act=gather]:not([disabled])');
  if (tiles.length) { await click(tiles[Math.floor(Math.random() * tiles.length)]); continue; }
  if ($('[data-act=submit]')) { if (gather[0]) await click(gather[0]); await click($('[data-act=submit]')); continue; }
  if (opts.length) { await click(opts[Math.floor(Math.random() * opts.length)]); continue; }
  if ($('[data-act=pass]')) { const btns = $$('[data-act=do]:not([disabled])'); if (g().round < 3 && acted < 8 && btns.length) { await click(btns[Math.floor(Math.random() * btns.length)]); acted++; } else await click($('[data-act=pass]')); }
}
assert.ok(steps < 2500, 'the game did not progress'); assert.equal(secretDomLeak, null, `the opponent's hero ${secretDomLeak} was visible while face down`);
assert.ok(sawFaceDownDom && waited && acted > 0, JSON.stringify({ sawFaceDownDom, waited, acted }));
assert.deepEqual(bot.errors, []); assert.ok($('.hudteam .tag.you') || document.body.textContent.includes('you')); assert.ok($$('.log div, #log div, #log p').length > 5);
ok(`game: played to round ${g().round} through the UI (${acted} actions), waiting notices shown, opponent's heroes never in the page while face down`);

// ---- connection drop: banner, automatic reconnect, play continues
{
  const before = g().round; ES.last.ac.abort(); await until(() => $('.netbanner') && !$('.netbanner').hidden, 3000, 'offline banner');
  await until(() => $('.netbanner').hidden, 5000, 'reconnected'); assert.ok(app.rooms.get(code).players[0].connected); assert.ok(g().round >= before);
  ok('connection drop: banner, automatic reconnect');
}

// ---- leave to the menu and resume from "Play online"
{
  const round = g().round; await click($('[data-act=menu]')); await until(() => $('.menu'), 3000, 'menu');
  await click($('[data-go="online"]')); assert.ok($('#resume'), 'resume offered'); assert.ok($('.resume').textContent.includes(code));
  await click($('#resume')); await until(() => $('.game') && window.__game.ents.length > 10, 5000, 'back in the game'); assert.ok(g().round >= round);
  ok('leave and resume the same game');
}

// ---- the other side's tab reload: rejoin with the saved session (#room=CODE) after a fresh page load
{
  const saved = dom.window.localStorage.getItem('hexgame.online.v1'); app.rooms.get(code).io.gameOver({ team: 0, type: 'test' });
  await until(() => $('.cover') && !$('.cover').hidden || document.body.textContent.toLowerCase().includes('wins') || document.body.textContent.toLowerCase().includes('victory'), 3000, 'game over screen');
  ES.all.forEach((e) => e.close()); // like closing the old tab
  dom = boot(`${base}/#room=${code}`); dom.window.localStorage.setItem('hexgame.online.v1', saved);
  await import('../js/main.js?reload'); await until(() => $('.game') || $('.page'), 3000, 'reloaded page');
  ok('game over reaches the UI; a reload with #room=CODE reconnects');
}

// ---- invite link: the join page is prefilled
{
  dom = boot(`${base}/?room=ABCDE`); await import('../js/main.js?invite'); await until(() => $('#code'), 3000, 'join page');
  assert.equal($('#code').value, 'ABCDE'); assert.ok($('.onbox .hint b')?.textContent === 'ABCDE'); await click($('#join')); await until(() => $('#note').textContent.length > 0, 3000, 'error for unknown room');
  assert.ok($('#note').textContent.toLowerCase().includes('not found')); ok('invite link prefills the code; unknown rooms give a clear error');
}

bot.disconnect(); await app.close(); console.log(`\n${n} online UI checks passed`); process.exit(0);
