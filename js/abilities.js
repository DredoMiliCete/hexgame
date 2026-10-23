// Hero abilities. Each hero returns a list of action definitions built with D().
// Convention inside run(): make all choices first (return = cancel, nothing spent), then A.commit() pays the AP, then apply effects.
import { DIR_LIST, step, key, hexDist, OPP, DIRS } from './hex.js';

export const D = (key2, label, cost, run, o = {}) => ({ key: key2, label, cost, run, ...o });
export const rand = (a) => a[Math.floor(Math.random() * a.length)];
const src = (g, e) => ({ hero: e, team: g.team(e) });
const SONGS = ['Classical', 'Rock', 'Jazz'];
const START_T = ['BS', 'RS'];
const hasTargets = (g, e, r) => (g.attackTargets(e, r === undefined ? {} : { reach: r }).length ? null : 'No target in reach');
const enemiesOf = (g, e, list) => list.filter((x) => g.team(x) !== g.team(e));
const alliesOf = (g, e, list) => list.filter((x) => g.team(x) === g.team(e));

async function moveUpTo2(g, by, ent, label) {
  const reach = g.reachable(ent, 2); const tiles = [...reach.values()]; if (!tiles.length) return;
  const t = await g.pickTile(by, tiles, label, { cancel: true, cancelLabel: 'Skip' });
  if (t) { g.setPos(ent, t.x, t.y); await g.onEnter(ent, { move: true }); }
}

const IMPL = {
  vanish: (g, e) => [
    D('hearty', 'Hearty Shield', 1, async (g2, h, A) => {
      const list = [h, ...g2.scan(h, g2.reachOf(h)).map((v) => v.ent)].filter((x) => g2.team(x) === g2.team(h) && !x.snow && x.givenShield !== g2.round);
      const t = await g2.pickEnt(g2.team(h), list, 'Hearty Shield: choose an ally within reach (or Vanish)'); if (!t) return;
      A.commit(); t.shield = true; t.shieldTeam = g2.team(h); t.givenShield = g2.round; g2.log(`${t.name} receives a Card Shield.`);
    }, { desc: 'Give an ally within reach (or Vanish) a Card Shield. Not twice on the same entity per round.' }),
    D('club', 'Club Barrage', 1, async (g2, h, A) => {
      const t = await g2.pickEnt(g2.team(h), g2.attackTargets(h, { reach: 1 }).map((v) => v.ent), 'Club Barrage: choose a target (reach 1)'); if (!t) return;
      A.commit(); const X = g2.shieldsDestroyed[g2.team(h)];
      await g2.attack(h, t, 3 * X); g2.stun(h);
    }, { desc: 'Attack for 3 x (your Card Shields destroyed this round) with 1 Reach. Stun Vanish.', avail: (g2, h) => hasTargets(g2, h, 1) }),
  ],
  glove: (g, e) => [
    D('crash', 'Crash', 2, async (g2, h, A) => {
      A.commit(); let n = 0;
      for (;;) {
        const r = await g2.rollDie(h, 'Crash');
        if (r >= 5) { g2.log('Crash fails: no attack.'); return; }
        n++;
        const T = g2.attackTargets(h);
        const opts = [{ label: `Roll again (${n} success${n > 1 ? 'es' : ''})`, value: 'again' }];
        if (T.length) opts.push({ label: `Attack for ${2 * n}`, value: 'atk' });
        const c = await g2.io.choose(g2.team(h), `Crash: ${n} success${n > 1 ? 'es' : ''} so far`, opts, { cancel: false });
        if (c === 'atk') { const t = await g2.pickEnt(g2.team(h), T.map((v) => v.ent), `Crash: attack for ${2 * n}`, false); if (t) await g2.attack(h, t, 2 * n); return; }
      }
    }, { desc: 'Roll d6: below 5 = success, then roll again or attack for 2 x successes. 5-6 = nothing.', avail: (g2, h) => hasTargets(g2, h) }),
  ],
  driver: (g, e) => [
    D('runover', 'Run Over', 2, async (g2, h, A) => {
      const plans = {};
      for (const d of DIR_LIST) { const w = g2.lineWalk(h, d); let L = -1; w.forEach((p, i) => { if (!p.ent) L = i; }); if (L >= 0) plans[d] = w.slice(0, L + 1).map((p) => [p.x, p.y]); }
      const d = await g2.pickDir(g2.team(h), Object.keys(plans), 'Run Over: choose a direction'); if (!d) return;
      A.commit(); await g2.slideThrough(h, plans[d], { damage: 2 });
    }, { once: true, desc: 'Move through a line to the last free tile; 2 damage to every entity passed.',
      avail: (g2, h) => (DIR_LIST.some((d) => g2.lineWalk(h, d).some((p) => !p.ent)) ? null : 'No free tile in a line') }),
    D('tuner', 'Tuner', 3, async (g2, h, A) => {
      A.commit(); await g2.dealDamage(h, 2, src(g2, h));
      if (!h.dead) { h.buff.atk += 2; h.buff.move += 2; g2.log('Driver is tuned: +2 Attack and Move this round.'); }
    }, { once: true, desc: 'Driver takes 2 damage. +2 Attack and Move until end of round.' }),
  ],
  sailor: (g, e) => [
    D('freeatk', 'Drink and Shoot', 0, async (g2, h, A) => {
      const v = rand(g2.attackTargets(h)); if (!v) return; A.commit(); await g2.attack(h, v.ent);
    }, { once: true, desc: 'Free extra attack each round. All of Sailor\'s attacks hit a random valid enemy entity.', avail: (g2, h) => hasTargets(g2, h) }),
    D('cheers', 'Cheers', 0, async (g2, h, A) => {
      const t = await g2.pickEnt(g2.team(h), g2.adjacentAllies(h).filter((x) => !x.snow), 'Cheers: choose an adjacent allied entity'); if (!t) return;
      A.commit(); h.nextAtk = (h.nextAtk || 0) + 1; t.nextAtk = (t.nextAtk || 0) + 1; g2.log(`Cheers! Sailor's and ${t.name}'s next attack deal 1 more damage (until the end of the round).`);
    }, { once: true, desc: "Sailor's and an adjacent ally's next attack does 1 more damage (lasts until end of round).",
      avail: (g2, h) => (g2.adjacentAllies(h).some((x) => !x.snow) ? null : 'No adjacent allied entity') }),
    D('metal', 'Metal Leg', 1, async (g2, h, A) => {
      const v = rand(g2.attackTargets(h, { reach: 1 })); if (!v) return;
      A.commit(); h.lifeUsed.metal = true; h.moveSet = 2; g2.log('Metal Leg: Sailor has only 2 Move until he dies.'); await g2.attack(h, v.ent, 4);
    }, { desc: 'Attack a random adjacent enemy for 4. Sailor has only 2 Move until he dies. Once per life.',
      avail: (g2, h) => (h.lifeUsed.metal ? 'Once per life' : hasTargets(g2, h, 1)) }),
  ],
  squeak: (g, e) => [
    D('ratio', 'Ratio', 2, async (g2, h, A) => {
      const free = g2.freeAdjacent(h.x, h.y);
      const t = await g2.pickTile(g2.team(h), free, 'Ratio: place the new Rat on an adjacent free tile'); if (!t) return;
      A.commit();
      const r1 = g2.spawnToken('rat', h.owner, h.x, h.y); r1.holds = h.id; h.inRat = r1.id; h.x = h.y = null;
      const r2 = g2.spawnToken('rat', h.owner, t.x, t.y);
      await g2.io.hotseat(h.owner, `${g2.name(1 - h.owner)}: turn around! ${g2.name(h.owner)} is secretly deciding whether to switch the Rats.`, { secret: true });
      const sw = await g2.io.choose(h.owner, 'Switch the positions of the two Rats?', [{ label: 'Switch', value: true }, { label: 'Keep', value: false }], { cancel: false, secret: true });
      if (sw) { [r1.x, r2.x] = [r2.x, r1.x]; [r1.y, r2.y] = [r2.y, r1.y]; }
      g2.log('Squeak turns into a Rat and a second Rat appears.');
    }, { desc: 'Flip Squeak into a Rat, create another Rat adjacent; you may secretly switch them.', avail: (g2, h) => (g2.freeAdjacent(h.x, h.y).length ? null : 'No adjacent free tile') }),
    D('rodents', 'Send Out Rodents', 1, async (g2, h, A) => {
      const dirs = DIR_LIST.filter((d) => g2.lineScan(h, 2, { dirs: [d], smokeBlocks: true, throughEnemies: true }).length);
      const d = await g2.pickDir(g2.team(h), dirs, 'Send Out Rodents: choose a direction'); if (!d) return;
      A.commit();
      for (const v of g2.lineScan(h, 2, { dirs: [d], smokeBlocks: true, throughEnemies: true })) await g2.dealDamage(v.ent, 1, src(g2, h));
    }, { desc: '1 damage to each entity within 2 tiles in a direction (allies too).',
      avail: (g2, h) => (DIR_LIST.some((d) => g2.lineScan(h, 2, { dirs: [d], smokeBlocks: true, throughEnemies: true }).length) ? null : 'Nothing within 2 tiles') }),
  ],
  monkey: (g, e) => [
    D('jump', 'Jump In', 2, async (g2, h, A) => {
      const tiles = DIR_LIST.map((d) => step(h.x, h.y, d, 2)).filter(([x, y]) => g2.isFree(x, y)).map(([x, y]) => ({ x, y }));
      const t = await g2.pickTile(g2.team(h), tiles, 'Jump In: choose a free tile exactly 2 away in a straight line'); if (!t) return;
      A.commit(); await g2.placeEntity(h, t.x, t.y, { noPlaced: true });
      const T = g2.adjacentEnemies(h).filter((x) => !x.snow);
      if (T.length && !h.dead) { const v = await g2.pickEnt(g2.team(h), T, 'Jump In: choose an adjacent enemy (2 damage)', false); if (v) await g2.dealDamage(v, 2, src(g2, h)); }
      g2.stun(h);
    }, { desc: 'Place Monkey 2 tiles away in a line, deal 2 damage to an adjacent enemy, stun Monkey.',
      avail: (g2, h) => (DIR_LIST.some((d) => { const [x, y] = step(h.x, h.y, d, 2); return g2.isFree(x, y); }) ? null : 'No free tile 2 away') }),
  ],
  greyson: (g, e) => [
    D('crow', 'Crow Strike', 2, async (g2, h, A) => {
      const t = await g2.pickEnt(g2.team(h), g2.attackTargets(h).map((v) => v.ent), 'Crow Strike: choose a target (1 damage, stun)'); if (!t) return;
      A.commit(); await g2.attack(h, t, 1); g2.stun(t);
    }, { once: true, desc: 'Attack for 1 damage; stun what it hits.', avail: (g2, h) => hasTargets(g2, h) }),
    D('draw', 'Draw to Life', 1, async (g2, h, A) => {
      const kind = await g2.io.choose(g2.team(h), 'Place which structure?', [{ label: 'Ink Machine', value: 'ink' }, { label: 'Two-D-ret', value: 'twod' }]); if (!kind) return;
      const t = await g2.pickTile(g2.team(h), g2.freeAdjacent(h.x, h.y), 'Place the structure on an adjacent free tile'); if (!t) return;
      A.commit(); g2.spawnToken(kind, h.owner, t.x, t.y); g2.log(`Greyson draws a structure.`);
    }, { once: true, desc: 'If you have no Greyson structure, place an Ink Machine or Two-D-ret adjacent.',
      avail: (g2, h) => (g2.structure(h.owner) ? 'You already have a structure' : g2.freeAdjacent(h.x, h.y).length ? null : 'No adjacent free tile') }),
    D('dissolve', 'Dissolve', 0, async (g2, h, A) => {
      const s = g2.structure(h.owner); A.commit(); const { x, y } = s;
      g2.removeEnt(s); await g2.placeEntity(h, x, y, { noPlaced: true }); g2.heal(h, h.maxHp - h.hp);
    }, { desc: 'Destroy your structure, move Greyson onto its tile, heal him fully.', avail: (g2, h) => (g2.structure(h.owner) ? null : 'No structure on the board') }),
  ],
  trick: (g, e) => [
    D('mix', 'Mix and Match', 1, async (g2, h, A) => {
      const cands = () => enemiesOf(g2, h, g2.scan(h, g2.reachOf(h)).map((v) => v.ent)).filter((x) => !x.snow && !(x.def?.id === 'oak'));
      const picked = [];
      for (let i = 0; i < 3; i++) {
        const opts = cands().filter((x) => !picked.includes(x)); if (!opts.length) break;
        const t = await g2.pickEnt(g2.team(h), opts, `Mix and Match: choose enemy ${i + 1} of up to 3`, true, i === 0 ? 'Cancel' : 'Done');
        if (!t) { if (i === 0) return; break; }
        picked.push(t);
      }
      if (!picked.length) return;
      A.commit();
      for (const t of picked) {
        const dirs = DIR_LIST.filter((d) => { const [x, y] = step(t.x, t.y, d); return g2.isFree(x, y); }); if (!dirs.length) continue;
        const d = await g2.pickDir(g2.team(h), dirs, `Force ${t.name} to move 1 tile`, false);
        const [x, y] = step(t.x, t.y, d); await g2.forceMove(t, x, y, h);
      }
    }, { desc: 'Up to 3 enemies within reach are forced to move 1 tile in directions of your choice.',
      avail: (g2, h) => (enemiesOf(g2, h, g2.scan(h, g2.reachOf(h)).map((v) => v.ent)).length ? null : 'No enemy within reach') }),
    D('mind', 'Mind Control', 1, async (g2, h, A) => {
      const list = g2.ents.filter((x) => x.kind === 'hero' && !x.dead && x.x != null && g2.team(x) !== g2.team(h) && !x.snow && x.attachedTo == null);
      const t = await g2.pickEnt(g2.team(h), list, 'Mind Control: choose an enemy hero'); if (!t) return;
      A.commit(); h.gameUsed.mind = true; g2.stun(h); t.ctrl = g2.team(h); g2.log(`${t.name} is mind-controlled until the end of the round.`);
    }, { desc: 'Stun Trick. An enemy hero counts as yours until end of round. Once per game.', avail: (g2, h) => (h.gameUsed.mind ? 'Already used this game' : null) }),
  ],
  tune: (g, e) => [
    D('page', 'Page Turner', 0, async (g2, h, A) => {
      const s = await g2.io.choose(g2.team(h), `Change the song (now ${h.song})`, SONGS.map((x) => ({ label: x, value: x }))); if (!s) return;
      A.commit(); h.song = s; g2.log(`Tune switches to ${s}.`);
    }, { once: true, desc: 'Change the current song (Classical, Rock or Jazz).' }),
    D('play', 'Play the Tune', 1, async (g2, h, A) => {
      const by = g2.team(h);
      if (h.song === 'Classical') {
        const t = await g2.pickEnt(by, g2.attackTargets(h).map((v) => v.ent), `Classical: attack for ${g2.adjacentAllies(h).length + 1}`); if (!t) return;
        A.commit(); await g2.attack(h, t, g2.adjacentAllies(h).length + 1);
      } else if (h.song === 'Rock') {
        A.commit(); for (const x of g2.adjacentEnemies(h)) await g2.dealDamage(x, 1, src(g2, h));
      } else {
        A.commit(); for (const x of g2.adjacentAllies(h).filter((q) => !q.snow)) await moveUpTo2(g2, by, x, `Jazz: move ${x.name} up to 2 tiles (optional)`);
      }
    }, { desc: 'By song - Classical: attack for (adjacent allies + 1). Rock: 1 damage to adjacent enemies. Jazz: move adjacent allies up to 2.',
      avail: (g2, h) => (h.song === 'Classical' ? hasTargets(g2, h) : null) }),
  ],
  claws: (g, e) => [
    D('spirit', 'Spiritualize', 1, async (g2, h, A) => {
      const cat = g2.cat(h.owner);
      const c = await g2.io.choose(g2.team(h), 'Spiritualize', [{ label: 'Swap places, stun Claws', value: 'sc' }, { label: 'Swap places, stun Cat', value: 'st' }, { label: `Remove Cat, heal Claws ${cat.hp}`, value: 'heal' }]);
      if (!c) return; A.commit();
      if (c === 'heal') { const x = cat.hp; g2.removeEnt(cat); g2.heal(h, x); return; }
      const [a, b] = [{ x: h.x, y: h.y }, { x: cat.x, y: cat.y }];
      g2.setPos(h, b.x, b.y); g2.setPos(cat, a.x, a.y); g2.stun(c === 'sc' ? h : cat);
    }, { desc: "Swap Claws and Cat and stun one of them, OR remove Cat and heal Claws by Cat's HP.", avail: (g2, h) => (g2.cat(h.owner)?.x != null ? null : 'No Cat on the board') }),
  ],
  cigar: (g, e) => [
    D('smoke', 'Place Smoke', 1, async (g2, h, A) => {
      const tiles = [[h.x, h.y], ...g2.neighbors(h.x, h.y)].filter(([x, y]) => !g2.isWall(x, y) && !g2.smokeAt(x, y)).map(([x, y]) => ({ x, y }));
      const t = await g2.pickTile(g2.team(h), tiles, 'Place Smoke on an adjacent tile or on Cigar\'s own tile'); if (!t) return;
      A.commit(); g2.smokes.push({ x: t.x, y: t.y, team: h.owner, seq: ++g2.seq });
      let mine = g2.smokes.filter((s2) => s2.team === h.owner);
      while (mine.length > 2) {
        const c = await g2.pickTile(h.owner, mine, 'Too many Smokes: choose one to remove', { cancel: false });
        g2.smokes = g2.smokes.filter((s2) => !(s2.x === c.x && s2.y === c.y)); mine = g2.smokes.filter((s2) => s2.team === h.owner);
      }
    }, { desc: 'Create a Smoke on an adjacent tile or on this tile; keep at most 2 Smokes.',
      avail: (g2, h) => ([[h.x, h.y], ...g2.neighbors(h.x, h.y)].some(([x, y]) => !g2.isWall(x, y) && !g2.smokeAt(x, y)) ? null : 'No tile available') }),
    D('fumes', 'Consume Fumes', 1, async (g2, h, A) => {
      const mine = g2.smokes.filter((s2) => s2.team === h.owner); if (!mine.length) return;
      A.commit(); g2.smokes = g2.smokes.filter((s2) => s2.team !== h.owner); h.fumes = (h.fumes || 0) + mine.length;
      g2.log(`Cigar consumes ${mine.length} Smoke${mine.length > 1 ? 's' : ''}: his attacks deal +${h.fumes} damage this round.`);
    }, { desc: "Remove all your Smokes. Until end of round, Cigar's attacks deal 1 more damage per Smoke removed.",
      avail: (g2, h) => (g2.smokes.some((s2) => s2.team === h.owner) ? null : 'You have no Smokes') }),
  ],
  income: (g, e) => [
    D('boom', 'Booming Economy', 1, async (g2, h, A) => {
      const list = g2.ents.filter((x) => x.kind === 'hero' && !x.dead && x.x != null && !x.snow && x.attachedTo == null && g2.tile(x.x, x.y).t === 'MP');
      const t = await g2.pickEnt(g2.team(h), list, 'Booming Economy: give 1 money to a hero on a Money tile'); if (!t) return;
      A.commit(); t.money++; g2.log(`${t.name} gets 1 money.`);
      g2.bonusAtk[g2.team(h)] = true; g2.log('Allied entities with money have +1 Attack this round.');
      if (!h.dead) await g2.moveFlow(h, { label: 'Free move' });
    }, { once: true, desc: 'Give 1 money to a hero on a Money tile, free Move for Income, allies with money get +1 Attack.',
      avail: (g2) => (g2.ents.some((x) => x.kind === 'hero' && !x.dead && x.x != null && g2.tile(x.x, x.y).t === 'MP') ? null : 'Nobody on a Money tile') }),
  ],
  hail: (g, e) => [
    D('cone', 'Snow Cone', 0, async (g2, h, A) => {
      const t = await g2.pickEnt(g2.team(h), [h, ...alliesOf(g2, h, g2.scan(h, g2.reachOf(h)).map((v) => v.ent))].filter((x) => !x.snow), 'Snow Cone: heal an ally within reach (or Hail herself) by 4'); if (!t) return;
      A.commit(); g2.heal(t, 4);
    }, { once: true, desc: 'Heal an allied entity within reach, or Hail herself, by 4.' }),
    D('snow', 'Mr. Snow', 1, async (g2, h, A) => {
      const t = await g2.pickEnt(g2.team(h), alliesOf(g2, h, g2.scan(h, g2.reachOf(h)).map((v) => v.ent)).filter((x) => !x.snow), 'Mr. Snow: choose an ally to turn into a Snowman'); if (!t) return;
      A.commit(); t.snow = true; g2.log(`${t.name} becomes a Snowman until the end of the round.`);
    }, { once: true, desc: 'An allied entity within reach becomes a Snowman (cannot act, move or take damage) until end of round.' }),
    D('slide', 'Slide Escape', 2, async (g2, h, A) => {
      const cand = new Map();
      for (const d of DIR_LIST) {
        const w = g2.lineWalk(h, d, 4); let passes = 0;
        for (let i = 0; i < w.length; i++) { if (w[i].ent) { passes++; if (passes > 1) break; } else cand.set(key(w[i].x, w[i].y), w.slice(0, i + 1).map((p) => [p.x, p.y])); }
      }
      const t = await g2.pickTile(g2.team(h), [...cand.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; }), 'Slide Escape: choose a destination'); if (!t) return;
      A.commit(); await g2.slideThrough(h, cand.get(key(t.x, t.y)), { stunPassed: true });
      if (!h.dead && h.x != null && g2.tile(h.x, h.y).t === START_T[g2.team(h)]) { g2.pool[g2.team(h)]++; g2.log('Hail ended in the start zone: +1 AP.'); }
    }, { once: true, desc: 'Move up to 4 in a straight line, passing through at most one entity (stunning it). +1 AP if you end in your start zone.',
      avail: (g2, h) => (DIR_LIST.some((d) => g2.lineWalk(h, d, 4).some((p) => !p.ent)) ? null : 'No free tile in a line') }),
  ],
  oak: (g, e) => [
    D('solar', 'Solar Energize', 2, async (g2, h, A) => { A.commit(); h.solar = true; g2.log("Oak's base Attack is 2 until the end of the round."); }, { once: true, desc: "Oak's base Attack becomes 2 until end of round." }),
  ],
  clark: (g, e) => [
    D('oil', 'Monkey Oil', 0, async (g2, h, A) => {
      const t = await g2.pickEnt(g2.team(h), alliesOf(g2, h, g2.scan(h, g2.reachOf(h)).map((v) => v.ent)), `Monkey Oil: heal an ally for ${g2.oilUses[g2.team(h)] + 1}`); if (!t) return;
      const cost = g2.oilUses[g2.team(h)]; A.commit(cost); g2.oilUses[g2.team(h)]++; g2.heal(t, cost + 1);
    }, { desc: 'Heal an ally within reach for (AP spent + 1). Costs 1 more AP for each use this round.', cost: g.oilUses[g.team(e)] }),
    D('grab', 'Tentacle Grab', 1, async (g2, h, A) => {
      const list = g2.ents.filter((x) => !x.dead && x.x != null && g2.team(x) === g2.team(h) && !x.snow && x.attachedTo == null && (x.kind === 'hero' || x.kind === 'rat' || x.kind === 'cat') && x.holds == null && x.inRat == null && g2.reachable(x, g2.moveOf(x), { through: x.kind === 'rat' }).size);
      const t = await g2.pickEnt(g2.team(h), list, 'Tentacle Grab: choose an ally to force to move'); if (!t) return;
      const reach = g2.reachable(t, g2.moveOf(t), { through: t.kind === 'rat' });
      const c = await g2.pickTile(g2.team(h), [...reach.values()], `Move ${t.name}`); if (!c) return;
      A.commit(); g2.turn.used.grab = true; const node = reach.get(key(c.x, c.y));
      if (t.kind === 'rat') { g2.setPos(t, c.x, c.y); await g2.onEnter(t, {}); } else await g2.stepAlong(t, g2.pathTo(node));
    }, { ignoreTapped: true, desc: 'Force an allied entity to perform a move, even if unprepared. Clark may use this while unprepared. Once per turn.',
      avail: (g2) => (g2.turn.used.grab ? 'Once per turn' : null) }),
  ],
  bullseye: (g, e) => [
    D('hold', 'Hold Line', 2, async (g2, h, A) => {
      const d = await g2.pickDir(g2.team(h), DIR_LIST, 'Hold Line: choose a direction'); if (!d) return;
      A.commit(); h.hold = { dir: d, done: false }; h.holdLock = true; g2.log(`Bullseye holds the line (${d}).`);
    }, { desc: 'Until end of round, the next enemy to enter a tile within reach in that direction takes 6 damage. Bullseye can do nothing else.' }),
    D('flee', 'Flee Blast', 2, async (g2, h, A) => {
      const v0 = g2.attackTargets(h, { reach: 1 }); const t = await g2.pickEnt(g2.team(h), v0.map((v) => v.ent), 'Flee Blast: choose an adjacent enemy'); if (!t) return;
      const d = v0.find((v) => v.ent === t).dir; A.commit();
      await g2.attack(h, t, 2);
      if (!t.dead) { const [x, y] = step(t.x, t.y, d); await g2.forceMove(t, x, y, h); }
      const [bx, by] = step(h.x, h.y, OPP[d]);
      if (g2.isFree(bx, by)) { g2.setPos(h, bx, by); await g2.onEnter(h, { move: true }); }
      g2.stun(h);
    }, { desc: 'Attack an adjacent enemy for 2, push it 1 tile away, step 1 tile back, stun Bullseye.', avail: (g2, h) => hasTargets(g2, h, 1) }),
  ],
};

export function heroDefs(g, e) {
  const f = IMPL[e.def.id];
  const defs = f ? f(g, e) : [];
  for (const d of defs) { d.hero = true; }
  return defs;
}

// effects that trigger when a hero is gathered (Oil Change, Mark Rhythm, Money Lover, I Found a Place)
export async function gatherHook(g, h) {
  const t = h.owner; const id = h.def.id;
  if (id === 'driver') { g.log('Oil Change: Driver heals 4.'); g.heal(h, 4); }
  if (id === 'tune') {
    g.log(`Mark Rhythm (${h.song}).`);
    if (h.x == null) return;
    if (h.song === 'Classical') { if (g.adjacentAllies(h).length >= 2) { h.money++; g.log('Tune gains 1 money.'); } }
    else if (h.song === 'Rock') { for (const x of g.adjacentEnts(h)) await g.dealDamage(x, 1, src(g, h)); }
    else {
      const opts = [h, ...g.adjacentAllies(h)].filter((x) => !x.snow);
      const x = await g.pickEnt(t, opts, 'Mark Rhythm (Jazz): move Tune or an adjacent ally up to 2 tiles (optional)', true, 'Skip');
      if (x) await moveUpTo2(g, t, x, `Jazz: move ${x.name} up to 2 tiles`);
    }
  }
  if (id === 'income') {
    const allies = g.heroes(t).filter((x) => !x.dead && x !== h);
    if (allies.length) {
      const v = await g.io.choose(t, 'Money Lover: choose an ally to share it (and give them 1 money)', allies.map((x) => ({ label: x.name, value: x.id, hero: x.def.id })), { cancel: false });
      const a = g.ent(v); a.moneyLover = g.round; a.money++; g.log(`${a.name} gets Money Lover and 1 money.`);
    }
  }
  if (id === 'clark') {
    const ok = [...g.tiles.values()].filter((q) => !g.isWall(q.x, q.y) && DIR_LIST.some((d) => { const [x, y] = step(q.x, q.y, d); return g.isBarrier(x, y); })); // next to a barrier tile (Wall or Void)
    if (ok.length >= 2) {
      const a = await g.pickTile(t, ok, 'I Found a Place: choose the first tile (next to a wall/void)', { cancel: true, cancelLabel: 'Skip' }); if (!a) return;
      const b = await g.pickTile(t, ok.filter((q) => !(q.x === a.x && q.y === a.y)), 'I Found a Place: choose the second tile', { cancel: true, cancelLabel: 'Skip' }); if (!b) return;
      g.portals.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }]); g.log('Clark opens a door: the two tiles are adjacent until the end of the round.');
    }
  }
}

// Paw Pal: whenever Claws is placed on the board
export async function placedHook(g, e) {
  if (e.def?.id !== 'claws' || e.x == null) return;
  const cat = g.cat(e.owner);
  if (cat) { g.heal(cat, cat.maxHp - cat.hp); return; }
  const seen = new Set([key(e.x, e.y)]); let fr = [[e.x, e.y]];
  while (fr.length) {
    const cands = [], nxt = [];
    for (const [x, y] of fr) for (const [nx, ny] of g.neighbors(x, y)) {
      const k = key(nx, ny); if (seen.has(k)) continue; seen.add(k);
      if (g.isWall(nx, ny)) continue;
      nxt.push([nx, ny]); if (!g.entityAt(nx, ny)) cands.push({ x: nx, y: ny });
    }
    if (cands.length) {
      const t = cands.length === 1 ? cands[0] : await g.pickTile(e.owner, cands, 'Paw Pal: place the Cat on the closest free tile', { cancel: false });
      g.spawnToken('cat', e.owner, t.x, t.y); g.log('Paw Pal: a Cat appears.'); return;
    }
    fr = nxt;
  }
}
