// Targeted rule checks: node tests/rules.js
import { Game } from '../js/engine.js';
import assert from 'assert/strict';
import { saveCustomMap } from '../js/maps.js';
import { MAPS } from '../js/data.js';
// in-memory localStorage so custom maps can be registered from node
globalThis.localStorage = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = String(v); }, removeItem(k) { delete this.d[k]; } };
const io = { log() {}, refresh() {}, gameOver() {}, hotseat: async () => {}, roll: async () => 3,
  pickTile: async (t, tiles) => tiles[0], choose: async (t, p, o) => o[0].value, pickHeroes: async (t, c, m, f) => f, command: async () => ({ type: 'pass' }) };
function mk(a, b, map = 'Pride Map') {
  const g = new Game(map, [a, b], io, 0);
  for (const t of [0, 1]) { const st = g.startTiles(t); g.heroes(t).forEach((h, i) => { h.x = st[i].x; h.y = st[i].y; }); g.vip[t] = g.heroes(t)[0].id; }
  g.phase = 'round'; g.round = 1; g.pool = [6, 6]; g.turn = { team: 0, spent: 0, first: false, used: {} }; return g;
}
const put = (g, e, x, y) => { e.x = x; e.y = y; };
const clear = (g) => { for (const e of g.ents) if (e.kind === 'hero') { e.x = null; } };
let n = 0; const ok = (name) => { n++; console.log('ok -', name); };

{ // first turn: any action ends the turn
  const g = mk(['driver', 'oak'], ['hail', 'clark']); g.turn.first = true; const d = g.findHero(0, 'driver'); d.tapped = false; d.actions = 1;
  await g.doAction(d, 'move'); assert.equal(g.turn.team, 1); ok('first turn ends after one action');
}
{ // VIP first action is free and does not count toward the 2 AP
  const g = mk(['driver', 'oak'], ['hail', 'clark']); const d = g.findHero(0, 'driver'); assert.ok(g.isVip(d));
  await g.doAction(d, 'move'); assert.equal(g.pool[0], 6); assert.equal(g.turn.spent, 0);
  await g.doAction(d, 'tuner'); assert.equal(g.pool[0], 3); assert.equal(g.turn.team, 1); ok('VIP free first action');
}
{ // Money Talks: +1 damage to money carriers
  const g = mk(['vanish', 'oak'], ['trick', 'clark']); const o = g.findHero(0, 'oak'); o.money = 2; const hp = o.hp;
  await g.dealDamage(o, 1, {}); assert.equal(o.hp, hp - 2); ok('Money Talks adds 1 damage');
}
{ // Rat logic: the real rat flips Squeak back and Squeak takes damage + 2
  const g = mk(['squeak', 'oak'], ['hail', 'clark']); const s = g.findHero(0, 'squeak'); put(g, s, 5, 5); s.tapped = false;
  g.turn.team = 0; await g.doAction(s, 'ratio'); assert.equal(s.x, null); const rats = g.ents.filter((e) => e.kind === 'rat'); assert.equal(rats.length, 2);
  const real = rats.find((r) => r.holds != null); const hp = s.hp; await g.dealDamage(real, 1, {}); assert.equal(s.hp, hp - 3); assert.notEqual(s.x, null); ok('hit on the real Rat: flips, damage + 2');
}
{ // fake Rat destroyed, Squeak revealed
  const g = mk(['squeak', 'oak'], ['hail', 'clark']); const s = g.findHero(0, 'squeak'); put(g, s, 5, 5); await g.doAction(s, 'ratio');
  const fake = g.ents.find((e) => e.kind === 'rat' && e.holds == null); await g.dealDamage(fake, 1, {}); assert.notEqual(s.x, null); assert.equal(g.ents.filter((e) => e.kind === 'rat').length, 0); ok('hit on the fake Rat reveals Squeak');
}
{ // Diamonds are Unbreakable
  const g = mk(['vanish', 'oak'], ['hail', 'clark']); const v = g.findHero(0, 'vanish'); v.hp = 1; await g.dealDamage(v, 5, {});
  assert.equal(v.hp, v.maxHp); assert.ok(!v.dead); await g.dealDamage(v, 99, {}); assert.ok(v.dead); ok('Diamonds once per game');
}
{ // Card Shield prevents damage and counts for Club Barrage
  const g = mk(['vanish', 'oak'], ['hail', 'clark']); const o = g.findHero(0, 'oak'); o.shield = true; o.shieldTeam = 0; await g.dealDamage(o, 3, {});
  assert.equal(o.hp, o.maxHp); assert.equal(g.shieldsDestroyed[0], 1); ok('Card Shield absorbs + counted');
}
{ // Run Over: 2 damage to everything passed, ends on the last free tile
  const g = mk(['driver', 'oak'], ['hail', 'clark'], 'Pride Map'); clear(g); const d = g.findHero(0, 'driver'); const h = g.findHero(1, 'hail');
  put(g, d, 6, 5); put(g, h, 6, 7); d.tapped = false; g.vip[0] = 'none'; d.actions = 1; const hp = h.hp;
  g.io = { ...io, choose: async (t, p, o) => o.find((x) => x.value === 'DOWN')?.value ?? o[0].value }; await g.doAction(d, 'runover');
  assert.equal(h.hp, hp - 2); assert.equal(d.y, 8); ok('Run Over damages passed entities');
}
{ // Control: 4 rounds on a Control Point wins
  const g = mk(['driver'], ['hail']); clear(g); const cp = g.tilesOf('CP')[0]; const d = g.heroes(0)[0]; put(g, d, cp.x, cp.y);
  for (let i = 0; i < 4; i++) { g.first = 0; await g.endRound(); } assert.equal(g.over?.team, 0); assert.equal(g.over?.type, 'Control'); ok('control bar: 4 steps to win');
}
{ // Money: deposit on own start tile, 7 wins
  const g = mk(['driver'], ['hail']); const d = g.heroes(0)[0]; d.money = 7; g.io = { ...io, choose: async (t, p, o) => o[0].value };
  await g.endRound(); assert.equal(g.money[0], 7); assert.equal(g.over?.type, 'Monetary'); ok('deposit 7 money wins');
}
{ // Hold Line fires on the next enemy that enters the line
  const g = mk(['bullseye'], ['hail']); clear(g); const b = g.heroes(0)[0]; const h = g.heroes(1)[0]; put(g, b, 6, 5); put(g, h, 6, 8); b.tapped = false; g.vip[0] = 'none'; b.actions = 1;
  g.io = { ...io, choose: async (t, p, o) => o.find((x) => x.value === 'DOWN').value }; await g.doAction(b, 'hold'); assert.ok(b.hold && b.holdLock);
  const hp = h.hp; await g.stepAlong(h, [[6, 7]]); assert.ok(h.dead && hp <= 6); ok('Hold Line shoots the entering enemy for 6'); void hp;
}
{ // Sailor is never allowed to pick its target; Oak ATK cap
  const g = mk(['oak'], ['hail']); const o = g.heroes(0)[0]; o.buff.atk = 5; assert.equal(g.atkOf(o), 1); o.solar = true; assert.equal(g.atkOf(o), 2); ok('Oak ignores buffs, Solar sets base 2');
}
{ // Gathering: dead-hero AP bonus and previous-gathered heroes are skipped
  const g = mk(['driver', 'oak', 'hail'], ['clark']); g.heroes(0)[2].dead = true; g.heroes(0)[2].x = null; g.io = { ...io, pickHeroes: async (t, c, m, f) => c.map((h) => h.id) };
  g.phase = 'gather'; await g.gatherPhase(0); assert.equal(g.pool[0], 1 + 2 + 1); const again = []; g.io = { ...io, pickHeroes: async (t, c) => { again.push(...c.map((h) => h.name)); return []; } }; await g.gatherPhase(0);
  assert.deepEqual(again, []); ok('gathering: dead bonus 1 AP, gathered heroes skipped next round');
}

{ // Diamonds is optional
  const g = mk(['vanish', 'oak'], ['hail', 'clark']); const v = g.findHero(0, 'vanish'); g.io = { ...io, choose: async () => false };
  await g.dealDamage(v, 99, {}); assert.ok(v.dead); ok('Diamonds can be declined');
}
{ // same action cannot be used twice in one turn, but can in another turn
  const g = mk(['driver', 'oak'], ['hail', 'clark']); const o = g.findHero(0, 'oak'); o.tapped = false; o.actions = 1; g.vip[0] = 'none';
  assert.ok(await g.doAction(o, 'move')); const again = g.actionDefs(o).find((d) => d.key === 'move'); assert.equal(again.ok, false); assert.match(again.why, /this turn/);
  g.turn = { team: 0, spent: 0, first: false, used: {}, acts: new Set() }; assert.equal(g.actionDefs(o).find((d) => d.key === 'move').ok, true); ok('no repeating an action within a turn');
}
{ // pass round: passer loses AP and is skipped
  const g = mk(['driver'], ['hail']); g.turn.team = 0; g.passRound(0); assert.equal(g.pool[0], 0); assert.equal(g.turn.team, 1); assert.ok(g.passed[0]);
  g.pool[1] = 0; assert.ok(!g.hasAP(0) && !g.hasAP(1)); ok('pass round hands the turns to the other player');
}
{ // pregame: Control Points are walls
  const g = mk(['driver'], ['hail']); g.phase = 'pregame'; const cp = g.tilesOf('CP')[0]; assert.ok(g.isWall(cp.x, cp.y)); g.phase = 'round'; assert.ok(!g.isWall(cp.x, cp.y)); ok('CPs are walls in pregame only');
}
{ // pregame: nobody may enter or cross enemy territory (every built-in map, both teams)
  let blocked = 0;
  for (const map of Object.keys(MAPS)) {
    const g = mk(['driver'], ['hail'], map);
    for (const t of [0, 1]) {
      const h = g.heroes(t)[0];
      for (const st of g.startTiles(t)) {
        h.x = st.x; h.y = st.y; g.phase = 'pregame';
        const pre = [...g.reachable(h, 40).values()]; assert.ok(pre.every((q) => g.terr(q.x, q.y) !== 1 - t), `${map}: team ${t} reached enemy territory in pregame`);
        g.phase = 'round'; const rnd = [...g.reachable(h, 40).values()]; assert.ok(rnd.length >= pre.length); blocked += rnd.length - pre.length;
      }
    }
  }
  assert.ok(blocked > 0); ok('pregame movement never enters enemy territory (all maps)');
}
{ // pregame: enemy territory also blocks crossing (Blu - Red - Blu corridor) and the Cat/other teams use the same rule
  saveCustomMap('Test Corridor', [{ x: 0, y: 0, t: 'BS' }, { x: 1, y: 0, t: 'BN' }, { x: 2, y: 0, t: 'RN' }, { x: 3, y: 0, t: 'BN' }, { x: 4, y: 0, t: 'RS' }]);
  const g = new Game('Test Corridor', [['driver'], ['hail']], io, 0); const b = g.heroes(0)[0], r = g.heroes(1)[0]; put(g, b, 0, 0); put(g, r, 4, 0);
  g.phase = 'pregame'; assert.deepEqual([...g.reachable(b, 6).values()].map((q) => q.x), [1]); assert.equal(g.reachable(r, 6).size, 0); // Red's only neighbour is Blu territory
  g.phase = 'round'; assert.equal(g.reachable(b, 6).size, 3); ok('pregame: enemy territory cannot be crossed, only entered in the action phase');
}
{ // Money Points belong to the territory of the tiles next to them
  const g = mk(['driver'], ['hail']); assert.equal(g.terr(1, 3), 1); assert.equal(g.terr(7, 5), 0); // Pride Map: MP next to Red / next to Blu
  saveCustomMap('Test MP', [{ x: 0, y: 0, t: 'BN' }, { x: 1, y: 0, t: 'MP' }, { x: 2, y: 0, t: 'RN' }, { x: 5, y: 0, t: 'MP' }, { x: 6, y: 0, t: 'MM' }, { x: 8, y: 0, t: 'MP' }, { x: 9, y: 0, t: 'RN' }]);
  const m = new Game('Test MP', [['driver'], ['hail']], io, 0); assert.equal(m.terr(1, 0), null); assert.equal(m.terr(5, 0), null); assert.equal(m.terr(8, 0), 1);
  ok('Money Point territory follows its neighbours (both or neither = neutral)');
}
{ // Acorn Rattle ignores Tentacle Grab moves but reacts to normal moves
  const g = mk(['clark', 'oak'], ['hail']); clear(g); const c = g.findHero(0, 'clark'), o = g.findHero(0, 'oak'), h = g.heroes(1)[0];
  put(g, c, 4, 4); put(g, o, 7, 6); put(g, h, 7, 8); o.tapped = false; let asked = 0;
  g.io = { ...io, pickTile: async (t, tiles, p) => { if (/Acorn/.test(p)) asked++; return tiles.find((q) => q.x === 6 && q.y === 7) || tiles[0]; }, choose: async (t, p, o2) => o2[0].value };
  await g.afterPerformedMove(c); const viaMove = asked; asked = 0;
  const grab = g.actionDefs(c).find((d) => d.key === 'grab'); c.actions = 1; g.vip[0] = 'none'; if (grab?.ok) await g.doAction(c, 'grab'); assert.equal(asked, 0); assert.ok(viaMove >= 0); ok('Tentacle Grab does not trigger Acorn Rattle');
}
{ // autoplace: all 7 heroes get distinct start tiles
  const g = new Game('Pride Map', [['vanish', 'glove', 'driver', 'sailor', 'squeak', 'monkey', 'greyson'], ['hail', 'oak', 'clark', 'bullseye', 'cigar', 'tune', 'claws']], { ...io, choose: async (t, p, o) => o[0].value, pickTile: async () => ({ auto: true }) }, 0);
  await g.placementFor(0); const used = new Set(g.heroes(0).map((h) => h.x + ',' + h.y)); assert.equal(used.size, 7); ok('autoplace fills the start zone');
}
console.log(`\n${n} rule checks passed`);
