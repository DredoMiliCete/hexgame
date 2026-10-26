// Online protocol test: node tests/online.js
// Starts the real server on a free port and plays with simulated players that talk to it over HTTP + Server-Sent Events,
// exactly like the browsers do. Checks lobby rules, answer validation, reconnection, mirror fidelity and that secrets stay secret.
import assert from 'assert/strict';
import { createServer } from '../server/server.js';
import { viewSnapshot } from '../js/netstate.js';
import { Bot, until, makeCall } from './netbot.js';
import { HEROES, MAPS } from '../js/data.js';

const impl = HEROES.filter((h) => h.implemented).map((h) => h.id);
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
let n = 0; const ok = (m) => { n++; console.log('ok -', m); };

const app = createServer(); await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${app.server.address().port}`;
const call = makeCall(base);

async function newMatch({ config = { map: 'Pride Map', first: 0 }, side = 0, auto = true, teams = [shuffle(impl).slice(0, 7), shuffle(impl).slice(0, 7)] } = {}) {
  const a = await call('POST', '/api/rooms', { config, side, name: 'Ana' }); assert.equal(a.status, 200, JSON.stringify(a.body));
  const b = await call('POST', `/api/rooms/${a.body.code}/join`, { name: 'Bruno' }); assert.equal(b.status, 200);
  const A = new Bot(base, app.rooms, a.body.code, a.body.token, a.body.team, { auto, name: 'Ana' }), B = new Bot(base, app.rooms, b.body.code, b.body.token, b.body.team, { auto, name: 'Bruno' });
  await A.connect(); await B.connect();
  const bots = [A, B].sort((x, y) => x.team - y.team); // [Blu bot, Red bot]
  for (const bot of bots) assert.equal((await call('POST', `/api/rooms/${bot.code}/team`, { token: bot.token, heroes: teams[bot.team] })).status, 200);
  return { A, B, bots, teams, code: a.body.code, room: () => app.rooms.get(a.body.code) };
}

// ---------------- lobby rules
{
  assert.equal((await call('GET', '/api/ping')).body.ok, true);
  assert.equal((await call('GET', '/api/rooms/NOPE1')).status, 404);
  assert.equal((await call('POST', '/api/rooms', { config: { mapTiles: [{ x: 0, y: 0, t: 'BS' }] } })).status, 400); // invalid custom map
  const a = await call('POST', '/api/rooms', { config: { map: 'Greed Map', first: 1, startAP: [2, 99] }, side: 1 }); assert.equal(a.body.team, 1);
  const code = a.body.code; assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
  const info = (await call('GET', `/api/rooms/${code}`)).body; assert.deepEqual([info.map, info.first, info.full, info.status], ['Greed Map', 1, false, 'lobby']);
  const b = await call('POST', `/api/rooms/${code}/join`, {}); assert.equal(b.body.team, 0);
  assert.equal((await call('POST', `/api/rooms/${code}/join`, {})).status, 409); // room full
  const t = a.body.token;
  assert.equal((await call('POST', `/api/rooms/${code}/team`, { token: t, heroes: impl.slice(0, 6) })).status, 400); // 6 heroes
  assert.equal((await call('POST', `/api/rooms/${code}/team`, { token: t, heroes: [...impl.slice(0, 6), impl[0]] })).status, 400); // duplicate
  assert.equal((await call('POST', `/api/rooms/${code}/team`, { token: t, heroes: [...impl.slice(0, 6), 'pombo'] })).status, 400); // locked hero
  assert.equal((await call('POST', `/api/rooms/${code}/team`, { token: 'x'.repeat(32), heroes: impl.slice(0, 7) })).status, 403); // not in the room
  const room = app.rooms.get(code); assert.deepEqual(room.config.startAP, [2, 20]); // clamped
  assert.equal((await call('POST', `/api/rooms/${code}/team`, { token: t, heroes: impl.slice(0, 7) })).status, 200); assert.ok(room.players[1].ready && room.status === 'lobby');
  assert.equal((await call('POST', `/api/rooms/${code}/team`, { token: t, heroes: null })).status, 200); assert.ok(!room.players[1].ready); // change of mind
  assert.equal((await call('POST', `/api/rooms/${code}/leave`, { token: b.body.token })).status, 200); assert.equal(room.players[0], null); // seat freed
  const p2 = await call('POST', `/api/rooms/${code}/join`, {}); assert.equal(p2.status, 200);
  assert.equal((await call('POST', `/api/rooms/${code}/leave`, { token: t })).status, 200); assert.ok(app.rooms.has(code), 'the room stays while someone is in it');
  assert.equal((await call('POST', `/api/rooms/${code}/leave`, { token: p2.body.token })).status, 200); assert.ok(!app.rooms.has(code), 'an empty room is removed');
  ok('lobby: create / join / full / team validation / unready / leave');
}
{ // static files: only the game, never the server code or the CSV sources
  const get = async (p) => (await fetch(base + p)).status;
  assert.deepEqual([await get('/'), await get('/js/engine.js'), await get('/css/style.css')], [200, 200, 200]);
  assert.deepEqual([await get('/server/rooms.js'), await get('/data/roster.csv'), await get('/package.json'), await get('/tests/online.js')], [404, 404, 404, 404]);
  const raw = await new Promise((resolve) => { import('node:http').then(({ default: http }) => http.get({ host: '127.0.0.1', port: app.server.address().port, path: '/js/../server/rooms.js' }, (r) => resolve(r.statusCode))); });
  assert.ok(raw === 404 || raw === 403); ok('static server only serves css/js/assets');
}

// ---------------- validation of answers + reconnect (manual bots)
{
  const m = await newMatch({ auto: false }); const [blu, red] = m.bots;
  await until(() => blu.prompt || red.prompt, 3000, 'first prompt'); // placement: Blu or Red chooses their VIP first
  const actor = blu.prompt ? blu : red, other = actor === blu ? red : blu; const p = actor.prompt;
  await until(() => other.wait, 3000, 'wait notice'); assert.equal(other.wait.text, '', 'prompt text must not leak while heroes are face down');
  assert.equal(p.kind, 'choose'); assert.ok(p.options.length === 7 && !p.cancel);
  assert.equal((await other.answer(p.id, 0)).status, 403, 'the other player cannot answer');
  assert.equal((await actor.answer(p.id + 99, 0)).status, 409, 'stale prompt id');
  assert.equal((await actor.answer(p.id, 99)).status, 400, 'option out of range');
  assert.equal((await actor.answer(p.id, null)).status, 400, 'cannot cancel');
  assert.equal((await actor.answer(p.id, 'zero')).status, 400);
  // reconnect: the same prompt comes back, and nothing is lost
  actor.disconnect(); await until(() => m.room().players[actor.team].connected === false, 3000, 'server notices disconnect');
  assert.equal(other.room.players[actor.team].connected, false, 'opponent is told');
  const again = new Bot(base, app.rooms, actor.code, actor.token, actor.team, { auto: false }); await again.connect();
  await until(() => again.prompt && again.mirror && again.snaps.length, 3000, 'replay');
  assert.equal(again.prompt.id, p.id); assert.equal(again.events.find((e) => e.ev === 'room').d.status, 'playing'); assert.ok(again.logs.length > 0);
  assert.equal((await again.answer(p.id, 0)).status, 200); await until(() => again.prompt?.id !== p.id, 3000, 'next prompt');
  ok('answers are validated (turn owner, prompt id, range, cancel) and a reconnect resumes the same prompt');
  again.disconnect(); other.disconnect();
}

// ---------------- full random games through the server, with secrecy + mirror checks on every prompt
for (let i = 0; i < 3; i++) {
  const map = Object.keys(MAPS)[(i * 2) % 5]; const m = await newMatch({ config: { map, first: i % 2, startAP: [i, 0] } });
  await until(() => m.room()?.game?.round >= m.bots[0].stopRound, 20000, `round ${m.bots[0].stopRound} on ${map}`);
  for (const b of m.bots) assert.deepEqual(b.errors, [], `bot errors on ${map}`);
  const g = m.room().game; assert.deepEqual(g.startAP, [i, 0]);
  // logs shown while heroes were face down must not name the opponent's heroes
  for (const bot of m.bots) { const oppNames = m.teams[bot.opp()].filter((id) => !m.teams[bot.team].includes(id)).map((id) => HEROES.find((h) => h.id === id).name); for (const l of bot.logs.filter((x) => x.faceDown)) for (const nm of oppNames) assert.ok(!l.text.includes(nm), `log leaks ${nm}: ${l.text}`); }
  assert.ok(m.bots.every((b) => b.prompts > 15 && b.snaps.length > 15));
  m.bots.forEach((b) => b.disconnect());
  ok(`full game on ${map}: ${m.bots[0].prompts + m.bots[1].prompts} prompts, mirrors identical to the server, no secrets in snapshots or logs`);
}

// ---------------- Squeak's Rats: the opponent can never tell which Rat is Squeak
{
  const { Game } = await import('../js/engine.js');
  const io = { log() {}, refresh() {}, gameOver() {}, hotseat: async () => {}, roll: async () => 3, pickTile: async (t, tiles) => tiles[0], choose: async (t, p, o) => o[Math.floor(Math.random() * o.length)].value, pickHeroes: async (t, c, m, f) => f, command: async () => ({ type: 'pass' }) };
  let lowerHolds = 0, lastListIndexHolds = 0; const TRIALS = 300;
  for (let i = 0; i < TRIALS; i++) {
    const g = new Game('Pride Map', [['squeak', 'oak'], ['hail', 'clark']], io, 0); for (const t of [0, 1]) { const st = g.startTiles(t); g.heroes(t).forEach((h, k) => { h.x = st[k].x; h.y = st[k].y; }); g.vip[t] = g.heroes(t)[0].id; }
    g.phase = 'round'; g.round = 1; g.pool = [6, 6]; g.turn = { team: 0, spent: 0, first: false, used: {} };
    const s = g.findHero(0, 'squeak'); await g.doAction(s, 'ratio');
    const rats = g.ents.filter((e) => e.kind === 'rat'); const real = rats.find((r) => r.holds != null); assert.equal(rats.length, 2);
    if (real.id < rats.find((r) => r !== real).id) lowerHolds++; if (g.ents.indexOf(real) < g.ents.indexOf(rats.find((r) => r !== real))) lastListIndexHolds++;
    const theirs = viewSnapshot(g, 1); assert.ok(theirs.ents.filter((e) => e.kind === 'rat').every((r) => !('holds' in r)), 'holds hidden'); assert.equal(theirs.ents.find((e) => e.name === 'Squeak').inRat, -1);
    const mine = viewSnapshot(g, 0); assert.equal(mine.ents.filter((e) => e.kind === 'rat' && 'holds' in e).length, 1, 'the owner still sees it'); assert.equal(mine.ents.find((e) => e.name === 'Squeak').inRat, real.id);
  }
  for (const c of [lowerHolds, lastListIndexHolds]) assert.ok(c > TRIALS * 0.35 && c < TRIALS * 0.65, `Rat creation order is not random enough (${c}/${TRIALS})`);
  ok("Squeak's Rats: holds/inRat hidden from the opponent, entity ids and order carry no information");
}

// ---------------- custom map sent by the host + game over
{
  const tiles = JSON.parse(JSON.stringify(MAPS['Envy Map']));
  const m = await newMatch({ config: { map: 'My Custom Map', first: 0, mapTiles: tiles } });
  await until(() => m.bots[0].mirror?.round >= 1, 8000, 'custom map game'); assert.equal(m.room().game.mapName, 'My Custom Map'); assert.equal(m.bots[1].mirror.tiles.size, tiles.length);
  m.room().io.gameOver({ team: 1, type: 'test' });
  await until(() => m.bots.every((b) => b.events.some((e) => e.ev === 'over' && e.d.team === 1)), 3000, 'over event'); assert.equal(m.room().status, 'over');
  ok('custom map from the host + game over reaches both players'); m.bots.forEach((b) => b.disconnect());
}

await app.close(); console.log(`\n${n} online checks passed`); process.exit(0);
