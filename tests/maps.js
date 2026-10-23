// Map maker checks (model, save rules, storage): node tests/maps.js
import assert from 'assert/strict';
import { MapModel } from '../js/mapedit.js';
import { validateMap, saveCustomMap, loadCustomMaps, deleteCustomMap, getMapTiles, allMapNames, isBuiltinMap, hgOf, hgDir, SPAWN_MIN } from '../js/maps.js';
import { MAPS } from '../js/data.js';
import { DIR_LIST } from '../js/hex.js';
import { Game } from '../js/engine.js';
globalThis.localStorage = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = String(v); }, removeItem(k) { delete this.d[k]; } };
let n = 0; const ok = (name) => { n++; console.log('ok -', name); };
const io = { log() {}, refresh() {}, gameOver() {}, hotseat: async () => {}, roll: async () => 3, pickTile: async (t, tiles) => tiles[0], choose: async (t, p, o) => o[0].value, pickHeroes: async (t, c, m, f) => f, command: async () => ({ type: 'pass' }) };
const spawnRow = (m, type, y) => { for (let x = 0; x < SPAWN_MIN; x++) m.place(x, y, type); };

{ // built-in maps all satisfy the save rules
  // The map data is the user's: a broken teleport in maps.csv is reported (see tools/build_data.py) but must not hide other problems.
  for (const name of Object.keys(MAPS)) {
    const errs = validateMap(MAPS[name]); const other = errs.filter((e) => !/teleport/.test(e));
    assert.deepEqual(other, [], name); if (errs.length) console.warn('WARN  ' + name + ': ' + errs.join('; '));
  }
  ok('built-in maps are valid (teleport warnings aside)');
}
{ // 7 Blu + 7 Red spawn tiles are required to save
  const m = new MapModel(); spawnRow(m, 'BS', 0); for (let x = 0; x < 6; x++) m.place(x, 1, 'RS');
  assert.equal(validateMap(m.list()).length, 1); assert.match(validateMap(m.list())[0], /Red Spawn tiles: 6\/7/);
  m.place(6, 1, 'RS'); assert.deepEqual(validateMap(m.list()), []);
  const bad = new MapModel(); for (let x = 0; x < 7; x++) bad.place(x, 1, 'RS'); assert.match(validateMap(bad.list())[0], /Blu Spawn tiles: 0\/7/); ok('save rule: 7 Blu Spawn and 7 Red Spawn tiles');
}
{ // High Ground: needs a direction, stored in the (+,0) notation and read back by the engine
  const m = new MapModel(); assert.throws(() => m.placeHighGround(2, 2, 'SIDEWAYS'));
  for (const d of DIR_LIST) { m.placeHighGround(1, 1, d); assert.equal(hgDir(m.get(1, 1).hg), d); assert.deepEqual(m.get(1, 1).hg, hgOf(d)); }
  assert.throws(() => m.place(3, 3, 'HG')); assert.deepEqual(hgOf('UP_RIGHT'), ['+', '0']);
  const bare = [{ x: 0, y: 0, t: 'HG' }]; assert.match(validateMap(bare).join(), /no direction/);
  saveCustomMap('HG Test', m.list()); const g = new Game('HG Test', [['driver'], ['hail']], io, 0); assert.equal(g.tile(1, 1).hgd, 'UP_LEFT'); ok('High Ground needs a direction and the engine reads it');
}
{ // teleports connect to a teleport/anchor of their own colour
  const m = new MapModel(); m.place(5, 5, 'BA'); m.place(6, 5, 'RA'); m.place(7, 5, 'BN');
  m.placeTeleport(1, 1, 'B', { x: 5, y: 5 }); assert.deepEqual([m.get(1, 1).tx, m.get(1, 1).ty], [5, 5]);
  assert.throws(() => m.placeTeleport(2, 2, 'B', { x: 6, y: 5 }), /colour/); // Red anchor
  assert.throws(() => m.placeTeleport(2, 2, 'B', { x: 7, y: 5 }));           // plain tile
  assert.throws(() => m.placeTeleport(2, 2, 'B', { x: 9, y: 9 }));           // void
  assert.throws(() => m.placeTeleport(2, 2, 'B', { x: 2, y: 2 }));           // itself
  m.placeTeleport(3, 3, 'B', { x: 1, y: 1 }); assert.equal(m.get(3, 3).t, 'BT'); // connect to an existing teleport
  m.placeTeleport(8, 8, 'R', { x: 6, y: 5 }); assert.equal(m.get(8, 8).t, 'RT'); assert.deepEqual(validateMap(m.list()).filter((e) => /teleport/.test(e)), []); ok('teleports connect to existing teleport/anchor of their colour');
}
{ // creating a new teleport (pair) or a new anchor together with the teleport
  const m = new MapModel(); m.placeTeleportNew(1, 1, 'R', 'T', { x: 6, y: 4 });
  assert.deepEqual([m.get(1, 1).t, m.get(1, 1).tx, m.get(1, 1).ty], ['RT', 6, 4]); assert.deepEqual([m.get(6, 4).t, m.get(6, 4).tx, m.get(6, 4).ty], ['RT', 1, 1]);
  m.placeTeleportNew(2, 2, 'B', 'A', { x: 3, y: 3 }); assert.equal(m.get(3, 3).t, 'BA'); assert.equal(m.get(2, 2).tx, 3);
  assert.throws(() => m.placeTeleportNew(4, 4, 'B', 'A', { x: 3, y: 3 }), /empty/); assert.throws(() => m.placeTeleportNew(4, 4, 'B', 'A', { x: 4, y: 4 }));
  assert.equal(validateMap(m.list()).filter((e) => /teleport/.test(e)).length, 0); ok('new teleport/anchor created together with the teleport');
}
{ // removing a teleport target also removes the teleports that would dangle (cascading)
  const m = new MapModel(); m.place(5, 5, 'BA'); m.placeTeleport(1, 1, 'B', { x: 5, y: 5 }); m.placeTeleport(2, 2, 'B', { x: 1, y: 1 });
  assert.equal(m.brokenBy(5, 5, null).length, 2); assert.equal(m.brokenBy(5, 5, 'BT').length, 0); assert.equal(m.brokenBy(5, 5, 'RT').length, 2); assert.equal(m.brokenBy(5, 5, 'BN').length, 2);
  m.place(5, 5, 'BN'); assert.equal(m.tiles.size, 1); assert.equal(m.get(5, 5).t, 'BN'); // both teleports removed
  const p = new MapModel(); p.placeTeleportNew(1, 1, 'B', 'T', { x: 4, y: 4 }); p.erase(4, 4); assert.equal(p.tiles.size, 0); ok('erasing/replacing a link target removes dangling teleports');
}
{ // undo restores everything, including cascades
  const m = new MapModel(); m.place(5, 5, 'BA'); m.placeTeleport(1, 1, 'B', { x: 5, y: 5 }); const before = JSON.stringify(m.list());
  m.erase(5, 5); assert.equal(m.tiles.size, 0); assert.ok(m.undo()); assert.equal(JSON.stringify(m.list()), before);
  m.clear(); assert.ok(m.undo()); assert.equal(JSON.stringify(m.list()), before); assert.equal(m.place(5, 5, 'BA'), false); ok('undo');
}
{ // storage: save / list / load / delete custom maps; built-in maps are protected
  const tiles = [{ x: 0, y: 0, t: 'BS' }, { x: 1, y: 0, t: 'RS' }];
  assert.equal(saveCustomMap('Pride Map', tiles), false); assert.equal(deleteCustomMap('Pride Map'), false); assert.ok(isBuiltinMap('Pride Map'));
  assert.ok(saveCustomMap('Mine', tiles)); assert.ok(allMapNames().includes('Mine')); assert.deepEqual(getMapTiles('Mine'), tiles); assert.equal(getMapTiles('Pride Map'), MAPS['Pride Map']);
  assert.ok(saveCustomMap('Mine', [...tiles, { x: 2, y: 0, t: 'MM' }])); assert.equal(getMapTiles('Mine').length, 3);
  assert.ok(deleteCustomMap('Mine')); assert.ok(!allMapNames().includes('Mine')); assert.equal(getMapTiles('Mine'), null);
  localStorage.setItem('hexgame.maps.v1', '{not json'); assert.deepEqual(loadCustomMaps(), []); ok('custom maps: save, overwrite, delete, built-ins protected, corrupt storage ignored');
}
{ // a map made with the model plays: placement + pregame on a custom 7v7 map
  const m = new MapModel(); spawnRow(m, 'BS', 0); spawnRow(m, 'RS', 3); for (let x = 0; x < 8; x++) { m.place(x, 1, 'BN'); m.place(x, 2, 'RN'); }
  assert.deepEqual(validateMap(m.list()), []); saveCustomMap('Playable', m.list());
  const g = new Game('Playable', [['vanish', 'glove', 'driver', 'sailor', 'squeak', 'monkey', 'greyson'], ['hail', 'oak', 'clark', 'bullseye', 'cigar', 'tune', 'claws']], { ...io, pickTile: async () => ({ auto: true }) }, 0);
  await g.placementFor(0); await g.placementFor(1); assert.equal(g.heroes(0).filter((h) => h.x != null).length, 7); ok('a custom map can be played');
}
console.log(`\n${n} map checks passed`);
