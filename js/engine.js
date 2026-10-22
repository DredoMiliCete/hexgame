// Game engine: pure rules, no DOM. All player decisions go through `io` (see ui.js / tests/sim.js),
// which makes it possible to drive the same engine from another window / over the network later.
import { HEROES, MAPS } from './data.js';
import { TOKENS } from './tokens.js';
import { CONFIG, TEAM_NAMES } from './config.js';
import { DIR_LIST, DIR_LABEL, key, step, hexDist, OPP, DIRS } from './hex.js';
import { D, heroDefs, gatherHook, placedHook, rand } from './abilities.js';

const START = ['BS', 'RS'];
export const heroDef = (id) => HEROES.find((h) => h.id === id);

export class Game {
  constructor(mapName, teams, io, first = 0) {
    this.io = io; this.mapName = mapName; this.first = first; this.startPlayer = first;
    this.tiles = new Map();
    for (const t of MAPS[mapName]) {
      const tile = { ...t };
      if (t.t === 'HG') { // HG(+,0): the signs point at a real direction
        const s = (v) => (v === '+' ? 1 : v === '-' ? -1 : 0);
        const vec = [s(t.hg[0]), s(t.hg[1])];
        tile.hgd = DIR_LIST.find((d) => DIRS[d][0] === vec[0] && DIRS[d][1] === vec[1]);
      }
      this.tiles.set(key(t.x, t.y), tile);
    }
    this.ents = []; this.nextId = 1; this.smokes = []; this.portals = []; this.seq = 0;
    this.round = 0; this.pool = [0, 0]; this.glovePool = [0, 0]; this.money = [0, 0];
    this.vipKills = [0, 0]; this.vip = [null, null]; this.tracker = Math.floor(CONFIG.CONTROL_BAR / 2);
    this.shieldsDestroyed = [0, 0]; this.oilUses = [0, 0]; this.bonusAtk = [false, false];
    this.over = null; this.turn = { team: first, spent: 0, first: false, used: {}, acts: new Set() };
    this.passed = [false, false]; this.apStart = [0, 0];
    this.phase = 'setup'; this.faceDown = false; this.privateView = null; this.logs = [];
    teams.forEach((ids, t) => ids.forEach((id) => this.spawnHero(id, t)));
  }

  // ---------- basics ----------
  name(t) { return TEAM_NAMES[t]; }
  log(m) { this.logs.push(m); this.io.log?.(m); this.io.refresh?.(); }
  ent(id) { return this.ents.find((e) => e.id === id); }
  team(e) { return e.ctrl != null ? e.ctrl : e.owner; }
  heroes(t) { return this.ents.filter((e) => e.kind === 'hero' && e.owner === t); }
  findHero(t, id) { return this.ents.find((e) => e.kind === 'hero' && e.owner === t && e.def.id === id); }
  onBoard(e) { return e && !e.dead && e.x != null; }
  entityAt(x, y) { return this.ents.find((e) => !e.dead && e.x === x && e.y === y && e.attachedTo == null); }
  tile(x, y) { return this.tiles.get(key(x, y)); }
  isWall(x, y) { const t = this.tile(x, y); return !t || t.t === 'WW' || (this.phase === 'pregame' && t.t === 'CP'); } // CPs are walls during pregame movement
  isFree(x, y) { return !this.isWall(x, y) && !this.entityAt(x, y); }
  smokeAt(x, y) { return this.smokes.some((s) => s.x === x && s.y === y); }
  terr(x, y) { const t = this.tile(x, y)?.t; if (!t) return null; return 'BN BS BT BA'.includes(t) ? 0 : 'RN RS RT RA'.includes(t) ? 1 : null; }
  startTiles(t) { return [...this.tiles.values()].filter((x) => x.t === START[t]); }
  tilesOf(type) { return [...this.tiles.values()].filter((x) => x.t === type); }
  isTapped(e) { return e.holds != null ? this.ent(e.holds).tapped : e.tapped; }
  stun(e) { if (!e || e.dead || e.snow) return; if (e.holds != null) this.ent(e.holds).tapped = true; e.tapped = true; this.log(`${e.name} is stunned.`); }
  heal(e, n) { if (!e || e.dead || e.snow || n <= 0) return; e.hp = Math.min(e.maxHp, e.hp + n); this.log(`${e.name} heals ${n} (HP ${e.hp}/${e.maxHp}).`); }
  isVip(e) { return e.kind === 'hero' && this.vip[e.owner] === e.id; }
  hasMoneyLover(e) { return e.kind === 'hero' && (e.def.id === 'income' || e.moneyLover === this.round); }
  reachOf(e) { return e.reach + (e.buff.reach || 0); }
  moveOf(e) { return e.move + e.buff.move; }
  atkOf(e) {
    if (e.def?.id === 'oak') return e.solar ? 2 : 1; // Acorn Rattle: buffs never raise Oak's attack; Solar Energize changes the base
    return e.atk + e.buff.atk + (this.bonusAtk[this.team(e)] && e.kind === 'hero' && e.money > 0 ? 1 : 0);
  }
  cat(t) { return this.ents.find((e) => e.kind === 'cat' && e.owner === t && !e.dead); }
  structure(t) { return this.ents.find((e) => (e.kind === 'ink' || e.kind === 'twod') && e.owner === t && !e.dead); }

  spawnHero(id, owner) {
    const d = heroDef(id);
    const e = { id: this.nextId++, kind: 'hero', def: d, owner, name: d.name, x: null, y: null, hp: d.hp, maxHp: d.hp, move: d.move, atk: d.atk, reach: d.reach, ap: d.ap,
      tapped: false, gathered: false, dead: false, respawn: 0, money: 0, shield: false, used: {}, gameUsed: {}, buff: { atk: 0, move: 0 }, actions: 0, ctrl: null,
      snow: false, attachedTo: null, inRat: null, sinceGather: 0, moved: false, song: null };
    this.ents.push(e); return e;
  }
  spawnToken(kind, owner, x, y) {
    const d = TOKENS[kind];
    const e = { id: this.nextId++, kind, owner, name: d.name, x, y, hp: d.hp, maxHp: d.hp, move: d.move || 0, atk: d.atk || 0, reach: d.reach || 1, ap: 0,
      tapped: false, gathered: false, dead: false, used: {}, gameUsed: {}, buff: { atk: 0, move: 0 }, actions: 0, ctrl: null, snow: false, attachedTo: null, shield: false, money: 0, cnt: 0 };
    this.ents.push(e); return e;
  }
  removeEnt(e) { this.releaseRiders(e); e.dead = true; this.ents = this.ents.filter((x) => x !== e); }
  releaseRiders(c) { for (const r of this.ents.filter((x) => x.attachedTo === c.id)) { r.attachedTo = null; r.x = c.x; r.y = c.y; this.log(`${r.name} is dropped at ${c.x},${c.y}.`); } }

  // ---------- prompts ----------
  async pickTile(team, tiles, prompt, o = {}) { this.io.refresh?.(); return this.io.pickTile(team, tiles, prompt, o); }
  async pickEnt(team, list, prompt, cancel = true, cancelLabel) {
    const ts = list.filter((e) => e.x != null).map((e) => ({ x: e.x, y: e.y }));
    if (!ts.length) return null;
    const t = await this.pickTile(team, ts, prompt, { cancel, cancelLabel });
    return t ? this.entityAt(t.x, t.y) : null;
  }
  async pickDir(team, dirs, prompt, cancel = true) {
    return this.io.choose(team, prompt, dirs.map((d) => ({ label: DIR_LABEL[d], value: d })), { cancel });
  }
  async rollDie(h, label) {
    const t = this.team(h);
    let n = await this.io.roll(t, 6, label);
    const glove = this.findHero(t, 'glove');
    while (glove && !glove.dead && glove.x != null) {
      const c = await this.io.choose(t, `${label}: rolled ${n}. Deal with the Devil - Glove takes 3 unpreventable damage to reroll?`,
        [{ label: `Reroll (Glove -3 HP, now ${glove.hp})`, value: true }, { label: `Keep ${n}`, value: false }]);
      if (!c) break;
      await this.dealDamage(glove, 3, { hero: glove, team: t }, { unpreventable: true });
      if (glove.dead) break;
      n = await this.io.roll(t, 6, label + ' (reroll)');
    }
    return n;
  }

  // ---------- adjacency, movement ----------
  neighbors(x, y) {
    const out = [];
    for (const d of DIR_LIST) { const [nx, ny] = step(x, y, d); if (this.tile(nx, ny)) out.push([nx, ny]); }
    const t = this.tile(x, y);
    if (t && (t.t === 'BT' || t.t === 'RT') && t.tx != null && this.tile(t.tx, t.ty)) out.push([t.tx, t.ty]); // one-way
    for (const [a, b] of this.portals) {
      if (a.x === x && a.y === y) out.push([b.x, b.y]);
      if (b.x === x && b.y === y) out.push([a.x, a.y]);
    }
    return out;
  }
  isAdjacent(a, b) { return this.neighbors(a.x, a.y).some(([x, y]) => x === b.x && y === b.y); }
  adjacentEnts(e) { return this.neighbors(e.x, e.y).map(([x, y]) => this.entityAt(x, y)).filter(Boolean); }
  adjacentAllies(e) { return this.adjacentEnts(e).filter((o) => this.team(o) === this.team(e)); }
  adjacentEnemies(e) { return this.adjacentEnts(e).filter((o) => this.team(o) !== this.team(e)); }
  freeAdjacent(x, y) { return this.neighbors(x, y).filter(([a, b]) => this.isFree(a, b)).map(([a, b]) => ({ x: a, y: b })); }
  activeInk() { return this.ents.find((e) => e.kind === 'ink' && !e.dead && !e.trig); }
  oakBlocks(mover, o) { return o.def?.id === 'oak' && this.team(o) !== this.team(mover); }

  reachable(e, steps, { through = false } = {}) {
    const res = new Map(); const seen = new Set([key(e.x, e.y)]);
    let frontier = [{ x: e.x, y: e.y, d: 0, prev: null }];
    const ink = through ? null : this.activeInk();
    while (frontier.length) {
      const next = [];
      for (const c of frontier) {
        if (c.d >= steps || c.stop) continue;
        for (const [nx, ny] of this.neighbors(c.x, c.y)) {
          const k = key(nx, ny); if (seen.has(k)) continue;
          const t = this.tile(nx, ny); const wall = this.isWall(nx, ny); const occ = this.entityAt(nx, ny);
          if (t.t === 'HG' && t.hgd) { const [fx, fy] = step(nx, ny, t.hgd); if (fx === c.x && fy === c.y) continue; }
          if (occ && this.oakBlocks(e, occ)) continue;
          if (!through && (wall || occ)) continue;
          seen.add(k);
          const node = { x: nx, y: ny, d: c.d + 1, prev: c };
          if (!wall && !occ) res.set(k, node);
          if (ink && ink.x != null && this.neighbors(ink.x, ink.y).some(([a, b]) => a === nx && b === ny) && !wall) node.stop = true;
          next.push(node);
        }
      }
      frontier = next;
    }
    return res;
  }
  pathTo(node) { const p = []; for (let n = node; n && n.prev; n = n.prev) p.unshift([n.x, n.y]); return p; }

  setPos(e, x, y) { e.x = x; e.y = y; for (const r of this.ents.filter((q) => q.attachedTo === e.id)) { r.x = x; r.y = y; } }
  async placeEntity(e, x, y, o = {}) { this.setPos(e, x, y); await this.onEnter(e, o); if (!o.noPlaced) await placedHook(this, e); }
  async onEnter(e, o = {}) {
    if (e.dead || e.x == null) return null;
    const t = this.tile(e.x, e.y);
    if (t.t === 'HT' && e.kind === 'hero') this.heal(e, 1);
    let r = null;
    if (o.move) {
      const ink = this.activeInk();
      if (ink && ink.x != null && ink !== e && this.neighbors(ink.x, ink.y).some(([a, b]) => a === e.x && b === e.y)) {
        ink.trig = true; this.log(`${e.name} runs into the Ink Machine.`); this.stun(e); r = 'stop';
      }
    }
    await this.checkHold(e);
    return e.dead ? 'stop' : r;
  }
  async checkHold(e) {
    for (const b of this.ents.filter((h) => h.def?.id === 'bullseye' && !h.dead && h.hold && !h.hold.done && h.x != null && this.team(h) !== this.team(e))) {
      const v = this.lineScan(b, this.reachOf(b), { dirs: [b.hold.dir], smokeBlocks: true, throughEnemies: true, blockAlly: true });
      if (v.some((s) => s.ent === e)) { b.hold.done = true; this.log(`Hold Line: Bullseye shoots ${e.name}!`); await this.dealDamage(e, 6, { hero: b, team: this.team(b) }); }
      if (e.dead) return;
    }
  }
  async stepAlong(e, path) { // path = [[x,y],...] of tiles to walk, occupied ones are passed over
    for (const [x, y] of path) {
      const occ = this.entityAt(x, y);
      if (occ && occ !== e) continue;
      this.setPos(e, x, y);
      const r = await this.onEnter(e, { move: true });
      if (r === 'stop' || e.dead) return false;
    }
    return true;
  }
  async forceMove(t, x, y, src) {
    if (!t || t.dead || t.snow || t.attachedTo != null || t.x == null) return false;
    if (t.def?.id === 'oak' && src && this.team(src) !== this.team(t)) { this.log('Oak is Deep Rooted and cannot be forced to move.'); return false; }
    if (!this.isFree(x, y)) return false;
    this.setPos(t, x, y); await this.onEnter(t, { move: true }); return true;
  }
  async moveFlow(ent, { A = null, by = null, steps = null, noReact = false, label = 'Move' } = {}) {
    const rat = ent.kind === 'rat';
    const reach = this.reachable(ent, steps ?? this.moveOf(ent), { through: rat });
    const tiles = [...reach.values()];
    if (!tiles.length) { this.log(`${ent.name} has nowhere to move.`); return false; }
    const t = await this.pickTile(by ?? this.team(ent), tiles, `${label}: choose a destination for ${ent.name}`, { cancel: true });
    if (!t) return false;
    A?.commit();
    const node = reach.get(key(t.x, t.y));
    if (rat) { this.setPos(ent, t.x, t.y); await this.onEnter(ent, {}); } else await this.stepAlong(ent, this.pathTo(node));
    this.log(`${ent.name} moves to ${t.x},${t.y}.`);
    if (!noReact) await this.afterPerformedMove(ent);
    return true;
  }
  async afterPerformedMove(mover) { // Acorn Rattle only reacts to *performed* moves, not forced ones
    if (mover.dead || mover.x == null) return;
    for (const oak of this.ents.filter((h) => h.def?.id === 'oak' && !h.dead && h.x != null && !h.snow && h !== mover)) {
      const T = this.attackTargets(oak); if (!T.length) continue;
      this.log(`Acorn Rattle: Oak may attack.`);
      const t = await this.pickEnt(this.team(oak), T.map((v) => v.ent), 'Acorn Rattle: free attack (optional)', true, 'Skip');
      if (t) await this.attack(oak, t);
    }
  }
  async slideThrough(e, tiles, { damage = 0, stunPassed = false } = {}) {
    for (const [x, y] of tiles) {
      const occ = this.entityAt(x, y);
      if (occ && occ !== e) {
        if (damage) await this.dealDamage(occ, damage, { hero: e, team: this.team(e) });
        if (stunPassed) this.stun(occ);
        if (this.entityAt(x, y)) continue;
      }
      this.setPos(e, x, y);
      const r = await this.onEnter(e, { move: true });
      if (r === 'stop' || e.dead) return;
    }
  }
  // walk a straight line from e until a wall/void/Oak; returns [{x,y,ent}]
  lineWalk(e, d, max = 99) {
    const out = []; let [x, y] = [e.x, e.y];
    for (let i = 0; i < max; i++) {
      [x, y] = step(x, y, d);
      if (this.isWall(x, y)) break;
      const ent = this.entityAt(x, y);
      if (ent && this.oakBlocks(e, ent)) break;
      out.push({ x, y, ent });
    }
    return out;
  }

  // ---------- targeting ----------
  lineScan(src, reach, o = {}) {
    const out = []; if (src.x == null) return out;
    const st = this.team(src);
    if (o.smokeBlocks && this.smokeAt(src.x, src.y)) return out;
    const t0 = this.tile(src.x, src.y);
    for (const d of o.dirs || DIR_LIST) {
      let r = reach, walls = 0;
      if (t0?.t === 'HG' && t0.hgd === d && reach >= 2) { r = reach + 1; walls = 1; }
      let [x, y] = [src.x, src.y];
      for (let i = 1; i <= r; i++) {
        [x, y] = step(x, y, d);
        const t = this.tile(x, y); if (!t) break;
        if (t.t === 'WW') { if (walls > 0) { walls--; continue; } break; }
        if (o.smokeBlocks && this.smokeAt(x, y)) break;
        const e = this.entityAt(x, y);
        if (e) {
          out.push({ ent: e, dir: d, dist: i });
          if (this.team(e) === st) { if (o.blockAlly) break; } else if (!o.throughEnemies) break;
        }
      }
    }
    return out;
  }
  scan(src, reach) { return this.lineScan(src, reach, {}); } // "within reach" for non-attack abilities
  attackTargets(a, o = {}) {
    const bull = a.def?.id === 'bullseye';
    const reach = o.reach ?? this.reachOf(a);
    return this.lineScan(a, reach, { smokeBlocks: true, throughEnemies: bull, blockAlly: bull })
      .filter((v) => this.team(v.ent) !== this.team(a) && !v.ent.snow && v.ent.kind !== 'snowman' && !(v.ent.kind === 'ink' && v.dist > 1));
  }
  async attack(a, target, dmg = null) {
    this.log(`${a.name} attacks ${target.name}.`);
    await this.dealDamage(target, dmg ?? this.atkOf(a), { hero: a, team: this.team(a) });
  }

  // ---------- damage & death ----------
  async dealDamage(t, n, src = {}, o = {}) {
    if (!t || t.dead || n <= 0 || t.snow || t.attachedTo != null) return 0;
    if (src.hero?.def?.id === 'squeak' && this.isTapped(t)) n *= 2; // Rat Curse
    if (t.kind === 'hero' && t.money > 0 && this.ents.some((h) => h.def?.id === 'trick' && !h.dead && this.team(h) !== this.team(t))) n += 1; // Money Talks
    if (t.kind === 'rat') return this.damageRat(t, n, src);
    if (t.shield && !o.unpreventable) { t.shield = false; this.shieldsDestroyed[t.shieldTeam]++; this.log(`${t.name}'s Card Shield absorbs the damage.`); return 0; }
    if (t.def?.id === 'vanish' && !t.gameUsed.diamond && t.hp - n <= 0 && (await this.diamonds(t))) return 0;
    t.hp -= n; this.log(`${t.name} takes ${n} damage (HP ${Math.max(0, t.hp)}/${t.maxHp}).`);
    if (t.hp <= 0) await this.kill(t, src);
    return n;
  }
  async diamonds(v) { // optional: returns true if the player used it
    const use = await this.io.choose(v.owner, 'Vanish would die. Use Diamonds are Unbreakable (once per game)?', [{ label: 'Use it', value: true }, { label: 'Let Vanish die', value: false }], { cancel: false });
    if (!use) return false;
    v.gameUsed.diamond = true; v.hp = v.maxHp; const from = { x: v.x, y: v.y }; const t = v.owner;
    this.log('Diamonds are Unbreakable! Vanish negates the lethal effect and is restored.');
    const tiles = [...this.tiles.values()].filter((q) => this.isFree(q.x, q.y) && this.terr(q.x, q.y) !== 1 - this.team(v) && hexDist(from, q) >= 2);
    const c = tiles.length ? await this.pickTile(t, tiles, 'Diamonds are Unbreakable: place Vanish on a free non-enemy tile at least 2 tiles away', { cancel: false }) : null;
    if (c) await this.placeEntity(v, c.x, c.y);
    return true;
  }
  async damageRat(r, n, src) {
    if (r.holds != null) { const sq = this.ent(r.holds); this.log('The Rat was Squeak!'); await this.flipBack(sq, r); return this.dealDamage(sq, n + 2, src); }
    const sq = this.heroes(r.owner).find((h) => h.def.id === 'squeak' && h.inRat != null);
    this.removeEnt(r); this.log('A Rat is destroyed.');
    if (sq) {
      const sr = this.ent(sq.inRat); await this.flipBack(sq, sr);
      const adj = this.adjacentEnts(sq);
      const t = await this.pickEnt(sq.owner, adj, 'Squeak revealed: you may stun an adjacent entity', true, 'Skip');
      if (t) this.stun(t);
    }
    return n;
  }
  async flipBack(sq, rat) { sq.inRat = null; this.setPos(sq, rat.x, rat.y); this.removeEnt(rat); this.log('Squeak flips back.'); }
  async kill(t, src = {}) {
    if (t.kind !== 'hero') { this.log(`${t.name} is destroyed.`); this.releaseRiders(t); this.removeEnt(t); return; }
    const killer = src.hero?.kind === 'hero' ? src.hero : null;
    const killerTeam = src.team ?? (src.hero ? this.team(src.hero) : null);
    const X = t.money; const income = this.ents.some((h) => h.def?.id === 'income' && !h.dead && h.owner === t.owner);
    this.log(`${t.name} is defeated!`);
    this.releaseRiders(t);
    t.dead = true; t.x = t.y = null; t.hp = 0; t.money = 0; t.shield = false; t.ctrl = null; t.tapped = false; t.gathered = false; t.snow = false; t.attachedTo = null;
    t.respawn = CONFIG.RESPAWN_BASE - (this.isVip(t) ? 1 : 0); t.sinceGather = 0;
    if (t.def.id === 'glove') this.glovePool[t.owner] = 0; // Glove's private AP die with him
    if (killer && this.team(killer) !== t.owner && X > 0) {
      killer.money += Math.ceil(X / 2); this.log(`${killer.name} loots ${Math.ceil(X / 2)} money.`);
      if (income) { this.log('Interest Rate!'); await this.dealDamage(killer, X, { team: t.owner }); }
    }
    if (killerTeam != null && killerTeam !== t.owner && this.isVip(t)) {
      this.vipKills[killerTeam]++; this.log(`${this.name(killerTeam)} killed the VIP (${this.vipKills[killerTeam]}/${CONFIG.VIP_KILLS_TO_WIN}).`); this.checkWin();
    }
  }
  checkWin() {
    if (this.over) return;
    for (const t of [0, 1]) {
      if (this.vipKills[t] >= CONFIG.VIP_KILLS_TO_WIN) this.over = { team: t, type: 'Assassination' };
      else if (this.money[t] >= CONFIG.MONEY_TO_WIN) this.over = { team: t, type: 'Monetary' };
    }
    if (!this.over && this.tracker <= 0) this.over = { team: 0, type: 'Control' };
    if (!this.over && this.tracker >= CONFIG.CONTROL_BAR - 1) this.over = { team: 1, type: 'Control' };
    if (this.over) { this.log(`${this.name(this.over.team)} wins by ${this.over.type} victory!`); this.io.gameOver?.(this.over); }
  }

  // ---------- actions ----------
  hasAP(t) { const gl = this.findHero(t, 'glove'); return this.pool[t] > 0 || (this.glovePool[t] > 0 && !!gl && !gl.dead); }
  freeAction(e) { return e.kind === 'hero' && this.isVip(e) && e.actions === 0; }
  budget(e) {
    if (this.freeAction(e)) return Infinity;
    const t = this.team(e);
    return this.pool[t] + (e.def?.id === 'glove' ? this.glovePool[t] : 0) + (this.hasMoneyLover(e) ? e.money : 0);
  }
  pay(e, cost, util = false) {
    const t = this.team(e);
    if (util) return;
    if (this.freeAction(e)) { e.actions++; return; }
    let need = cost, paid = 0;
    const money = () => { const m = Math.min(need, e.money); e.money -= m; need -= m; };
    if (this.hasMoneyLover(e) && e.preferMoney) money();
    if (e.def?.id === 'glove') { const g = Math.min(need, this.glovePool[t]); this.glovePool[t] -= g; need -= g; paid += g; }
    const p = Math.min(need, this.pool[t]); this.pool[t] -= p; need -= p; paid += p;
    if (need > 0 && this.hasMoneyLover(e)) money();
    if (need > 0) throw new Error('Not enough action points');
    this.turn.spent += paid; e.actions++;
  }
  genericDefs(e) {
    const g = this;
    if (e.kind === 'rat') {
      const defs = [D('move', 'Move', 1, async (g2, r, A) => { if (await g2.moveFlow(r, { A, label: 'Rat move' })) await g2.ratFollow(r); }, { desc: 'Move up to 6, through walls and entities. You may then move your other Rats.' })];
      if (e.holds != null) defs.push(D('flipback', 'Flip Back', 0, async (g2, r, A) => { A.commit(); await g2.flipBack(g2.ent(r.holds), r); }, { desc: 'Reveal that this Rat is Squeak.' }));
      return defs;
    }
    if (e.kind !== 'hero' || e.dead || e.inRat != null || e.x == null || e.holdLock) return [];
    const spec = heroDefs(g, e);
    const defs = [];
    if (e.attachedTo == null) {
      defs.push(D('move', 'Move', 1, async (g2, h, A) => { await g2.moveFlow(h, { A }); }, { desc: `Move up to ${this.moveOf(e)} tiles (at least 1).` }));
      if (this.tile(e.x, e.y).t !== 'CP') {
        defs.push(D('attack', 'Attack', 1, async (g2, h, A) => {
          const T = g2.attackTargets(h);
          const t = h.def.id === 'sailor' ? rand(T)?.ent : await g2.pickEnt(g2.team(h), T.map((v) => v.ent), `Attack with ${h.name} (${g2.atkOf(h)} dmg)`);
          if (!t) return; A.commit(); await g2.attack(h, t);
        }, { desc: `Attack in a straight line up to ${this.reachOf(e)} tiles for ${this.atkOf(e)} damage.`, avail: (g2, h) => (g2.atkOf(h) > 0 && g2.attackTargets(h).length ? null : 'No target in reach') }));
      }
    }
    if (this.tile(e.x, e.y).t !== 'CP' && !e.holdLock) defs.push(...spec);
    // Piggy Back (Claws and Cat)
    if (e.attachedTo == null && !e.holdLock && this.tile(e.x, e.y).t !== 'CP') {
      for (const c of [this.findHero(e.owner, 'claws'), this.cat(e.owner)]) {
        if (c && c !== e && !c.dead && c.x != null && this.team(c) === this.team(e) && c.attachedTo == null && this.adjacentEnts(c).includes(e)) {
          defs.push(D('attach' + c.id, `Piggy Back: attach to ${c.name}`, 1, async (g2, h, A) => { A.commit(); h.attachedTo = c.id; g2.setPos(h, c.x, c.y); g2.log(`${h.name} hops on ${c.name}.`); }, { desc: `Rides on ${c.name}: can't take damage and can only use special actions.` }));
        }
      }
    }
    if (e.attachedTo != null && this.ent(e.attachedTo)) {
      const c = this.ent(e.attachedTo);
      defs.push(D('unattach', 'Unattach', 0, async (g2, h, A) => {
        const free = g2.freeAdjacent(c.x, c.y); const t = await g2.pickTile(g2.team(h), free, 'Unattach: choose an adjacent free tile');
        if (!t) return; A.commit(); h.attachedTo = null; g2.setPos(h, t.x, t.y); g2.log(`${h.name} hops off.`); g2.stun(h); await g2.onEnter(h, {});
      }, { util: true, desc: 'Hop off to an adjacent free tile; you are stunned.', avail: (g2) => (g2.freeAdjacent(c.x, c.y).length ? null : 'No adjacent free tile') }));
    }
    return defs;
  }
  async ratFollow(r) {
    for (const o of this.ents.filter((x) => x.kind === 'rat' && x.owner === r.owner && x !== r && !x.dead)) {
      const reach = this.reachable(o, o.move, { through: true }); const tiles = [...reach.values()]; if (!tiles.length) continue;
      const t = await this.pickTile(this.team(r), tiles, `Move another Rat (optional)`, { cancel: true, cancelLabel: 'Stay' });
      if (t) { this.setPos(o, t.x, t.y); await this.onEnter(o, {}); }
    }
  }
  actionDefs(e) {
    const defs = this.genericDefs(e);
    for (const d of defs) { const u = this.canUse(e, d); d.ok = u.ok; d.why = u.why; }
    return defs;
  }
  canUse(e, def) {
    if (this.over) return { ok: false, why: 'Game over' };
    if (this.phase !== 'round') return { ok: false, why: 'Not in the action phase' };
    if (this.team(e) !== this.turn.team) return { ok: false, why: 'Not your turn' };
    if (e.snow) return { ok: false, why: 'Snowman' };
    if (def.once && e.used[def.key]) return { ok: false, why: 'Once per round' };
    if (!def.util && this.turnActs().has(e.id + ':' + def.key)) return { ok: false, why: 'Already used this turn' };
    if (!def.ignoreTapped && this.isTapped(e) && !this.freeAction(e)) return { ok: false, why: 'Unprepared (tapped)' };
    if (!this.freeAction(e) && def.cost > this.budget(e)) return { ok: false, why: 'Not enough AP' };
    if (def.avail) { const w = def.avail(this, e); if (w) return { ok: false, why: w }; }
    return { ok: true };
  }
  async doAction(e, k) {
    const def = this.actionDefs(e).find((d) => d.key === k);
    if (!def || !def.ok) return false;
    let paid = false;
    const A = { commit: (c) => { if (paid) return; this.pay(e, c ?? def.cost, def.util); paid = true; if (def.once) e.used[def.key] = true; if (!def.util) this.turnActs().add(e.id + ':' + def.key); } };
    await def.run(this, e, A);
    if (paid && !def.util) await this.afterAction(e, def);
    if (paid) this.endCheck();
    this.io.refresh?.();
    return paid;
  }
  async afterAction(e, def) {
    const t = this.team(e);
    for (const s of this.ents.filter((x) => x.kind === 'twod' && !x.dead && x.owner !== t && x.x != null)) {
      s.cnt++;
      if (s.cnt % 3 === 0) {
        const T = this.ents.filter((x) => x.owner !== s.owner && this.team(x) !== s.owner && !x.dead && x.x != null && !x.snow && x.attachedTo == null && hexDist(s, x) === 2);
        if (T.length) { const v = await this.pickEnt(s.owner, T, 'Two-D-ret fires! Choose an enemy 2 tiles away', false); if (v) { this.log('Two-D-ret fires.'); await this.dealDamage(v, 2, { team: s.owner }); } }
      }
    }
    if (e.def?.id === 'claws' && !def.noCat) await this.catFree(e);
  }
  async catFree(claws) {
    const cat = this.cat(claws.owner); if (!cat || cat.x == null || cat.tapped) return;
    const opts = [{ label: 'Cat: move', value: 'move' }, { label: 'Cat: skip', value: 'skip' }];
    if (this.attackTargets(cat).length) opts.splice(1, 0, { label: `Cat: attack (${cat.atk})`, value: 'atk' });
    const c = await this.io.choose(claws.owner, 'Claws acted - Cat may act for free', opts);
    if (c === 'move') await this.moveFlow(cat, { by: claws.owner, label: 'Cat move' });
    if (c === 'atk') { const t = await this.pickEnt(claws.owner, this.attackTargets(cat).map((v) => v.ent), 'Cat attack'); if (t) await this.attack(cat, t); }
  }
  endCheck() {
    if (this.over) return;
    const T = this.turn;
    if (T.first || T.spent >= CONFIG.AP_PER_TURN || !this.hasAP(T.team)) this.nextTurn();
  }
  turnActs() { return (this.turn.acts ||= new Set()); }
  nextTurn() {
    const cur = this.turn.team, o = 1 - cur;
    const nt = this.hasAP(o) ? o : this.hasAP(cur) ? cur : cur;
    this.turn = { team: nt, spent: 0, first: false, used: {}, acts: new Set() };
    if (this.hasAP(nt)) this.log(`${this.name(nt)}'s turn.`);
  }
  passRound(t) { // forgo every remaining turn this round; the other player keeps playing until their AP run out
    this.passed[t] = true; this.pool[t] = 0; this.glovePool[t] = 0; this.log(`${this.name(t)} passes the round.`);
    if (this.turn.team === t) this.nextTurn();
  }

  // ---------- setup phase ----------
  async placementFor(t) {
    const io = this.io;
    await io.hotseat(t, `${this.name(t)}: choose your VIP and place your heroes in secret.`);
    this.privateView = t;
    const hs = this.heroes(t);
    const v = await io.choose(t, 'Choose your VIP (Assassination target)', hs.map((h) => ({ label: h.name, value: h.id, hero: h.def.id })), { cancel: false });
    this.vip[t] = v;
    const tune = hs.find((h) => h.def.id === 'tune');
    if (tune) tune.song = await io.choose(t, 'Tune starts with which song?', ['Classical', 'Rock', 'Jazz'].map((s) => ({ label: s, value: s })), { cancel: false });
    let auto = false;
    for (const h of hs) {
      const free = this.startTiles(t).filter((q) => !this.entityAt(q.x, q.y));
      let c = free.length === 1 || auto ? free[Math.floor(Math.random() * free.length)] : await this.pickTile(t, free, `Place ${h.name} on one of your start tiles`, { cancel: false, extra: 'Autoplace remaining heroes' });
      if (c.auto) { auto = true; c = free[Math.floor(Math.random() * free.length)]; }
      h.x = c.x; h.y = c.y;
    }
    this.privateView = null; this.io.refresh?.();
  }
  async pregameMoves() {
    this.phase = 'pregame'; this.log('Pregame movement phase.');
    let p = this.startPlayer;
    for (const n of CONFIG.PICK_PATTERN) {
      for (let i = 0; i < n; i++) {
        const cands = this.heroes(p).filter((h) => !h.moved && !h.dead && this.reachable(h, this.moveOf(h)).size > 0);
        if (!cands.length) break;
        let done = false;
        while (!done) {
          const h = await this.pickEnt(p, cands, `${this.name(p)}: choose a hero to move (each hero moves once)`, false);
          if (!h) { done = true; break; }
          if (await this.moveFlow(h, { by: p, noReact: true, label: 'Pregame move' })) {
            h.moved = true; done = true;
            if (h.def.id === 'claws') { const c = this.cat(p); if (c) await this.moveFlow(c, { by: p, noReact: true, label: 'Cat (with Claws)' }); }
          }
        }
      }
      p = 1 - p;
    }
    for (const h of this.ents.filter((x) => x.kind === 'hero' && x.x != null && this.tile(x.x, x.y).t === 'MP')) { h.money++; this.log(`${h.name} gains 1 money.`); }
  }

  // ---------- round flow ----------
  startRound() {
    this.round++; this.phase = 'gather';
    for (const e of this.ents) {
      e.used = {}; e.buff = { atk: 0, move: 0 }; e.actions = 0; e.solar = false; e.hold = null; e.holdLock = false;
      if (!e.gathered) e.tapped = false;
      if (e.kind === 'twod') e.cnt = 0;
      if (e.kind === 'ink') e.trig = false;
    }
    this.shieldsDestroyed = [0, 0]; this.oilUses = [0, 0]; this.passed = [false, false];
    this.log(`── Round ${this.round} ── ${this.name(this.first)} goes first.`);
  }
  async gatherPhase(t) {
    const hs = this.heroes(t).filter((h) => !h.dead);
    const prev = hs.filter((x) => x.gathered); // gathered last round: untap and skip them
    for (const h of prev) { h.gathered = false; h.tapped = false; }
    const cand = hs.filter((h) => !prev.includes(h));
    const forced = cand.filter((h) => h.def.id === 'driver' && h.sinceGather >= 2).map((h) => h.id);
    this.pool[t] = 0; this.glovePool[t] = 0;
    let picks = [];
    if (cand.length) picks = await this.io.pickHeroes(t, cand, CONFIG.MAX_TAPS, forced);
    for (const h of hs) { h.sinceGather = picks.includes(h.id) ? 0 : h.sinceGather + 1; }
    const gathered = picks.map((id) => this.ent(id));
    for (const h of gathered) { h.gathered = true; h.tapped = true; this.pool[t] += h.ap; }
    const dead = this.heroes(t).filter((h) => h.dead).length;
    const bonus = CONFIG.DEAD_AP[Math.min(3, dead)];
    this.pool[t] += bonus;
    this.log(`${this.name(t)} gathers ${gathered.map((h) => h.name).join(', ') || 'nobody'}${bonus ? ` (+${bonus} AP for dead heroes)` : ''}: ${this.pool[t]} AP.`);
    for (const h of gathered) await gatherHook(this, h);
    await this.gamble(t, gathered);
  }
  async gamble(t, gathered) {
    const gl = this.findHero(t, 'glove');
    if (!gl || gl.dead || gl.tapped) return;
    const others = gathered.filter((h) => h !== gl); if (!others.length) return;
    const c = await this.io.choose(t, 'Gamble: roll a d6 to replace the AP of your highest gathered ally? (usable only by Glove)', [{ label: 'Roll', value: true }, { label: 'Skip', value: false }]);
    if (!c) return;
    const top = Math.max(...others.map((h) => h.ap));
    const tied = others.filter((h) => h.ap === top);
    const hi = tied.length === 1 ? tied[0] : this.ent(await this.io.choose(t, 'Gamble: which ally counts as the highest?', tied.map((h) => ({ label: h.name, value: h.id, hero: h.def.id })), { cancel: false }));
    const n = await this.rollDie(gl, 'Gamble');
    this.pool[t] -= hi.ap;
    if (gl.dead) { this.log('Gamble: Glove died, the AP are lost.'); return; }
    this.glovePool[t] += n;
    this.log(`Gamble: ${hi.name}'s ${hi.ap} AP become ${n} AP only Glove can use.`);
  }
  async playRound() {
    this.startRound();
    for (const t of [this.first, 1 - this.first]) await this.gatherPhase(t);
    this.phase = 'round'; this.apStart = [0, 1].map((t) => this.pool[t] + this.glovePool[t]);
    this.turn = { team: this.first, spent: 0, first: true, used: {}, acts: new Set() };
    if (!this.hasAP(this.first)) { this.nextTurn(); } else this.log(`${this.name(this.first)}'s turn (first turn: one action only).`);
    while (!this.over && (this.hasAP(0) || this.hasAP(1))) {
      const cmd = await this.io.command(this);
      if (cmd.type === 'pass') this.passRound(this.turn.team);
      else if (cmd.type === 'do') await this.doAction(this.ent(cmd.entId), cmd.key);
      this.io.refresh?.();
    }
    if (!this.over) await this.endRound();
  }
  async endRound() {
    this.phase = 'end'; this.log('End of round.');
    const live = this.ents.filter((x) => x.kind === 'hero' && !x.dead && x.x != null && !x.snow && x.attachedTo == null);
    for (const h of live.filter((x) => this.tile(x.x, x.y).t === 'MP')) { h.money++; this.log(`${h.name} gains 1 money (Money tile).`); }
    for (const t of [this.first, 1 - this.first]) {
      for (const h of live.filter((x) => this.team(x) === t && x.money > 0 && this.tile(x.x, x.y).t === START[t])) {
        const opts = []; for (let i = h.money; i >= 0; i--) opts.push({ label: i === 0 ? 'Keep it all' : `Deposit ${i}`, value: i });
        const n = await this.io.choose(t, `${h.name} is on a start tile carrying ${h.money} money.`, opts, { cancel: false });
        if (n > 0) { h.money -= n; this.money[t] += n; this.log(`${this.name(t)} deposits ${n} (total ${this.money[t]}/${CONFIG.MONEY_TO_WIN}).`); }
      }
    }
    for (const cp of this.tilesOf('CP')) {
      const h = live.find((x) => x.x === cp.x && x.y === cp.y && !x.dead);
      if (h) { const tm = this.team(h); this.tracker += tm === 0 ? -1 : 1; this.tracker = Math.max(0, Math.min(CONFIG.CONTROL_BAR - 1, this.tracker)); this.log(`${h.name} holds a Control Point: tracker moves toward ${this.name(tm)}.`); }
    }
    for (const h of live) if (this.tile(h.x, h.y).t === 'HT') this.heal(h, 2);
    for (const h of this.ents.filter((x) => x.kind === 'hero' && x.dead)) {
      h.respawn--;
      if (h.respawn <= 0) {
        const free = this.startTiles(h.owner).filter((q) => !this.entityAt(q.x, q.y));
        if (!free.length) { h.respawn = 0; continue; }
        const c = await this.pickTile(h.owner, free, `Respawn ${h.name} on a start tile`, { cancel: false });
        h.dead = false; h.hp = h.maxHp; h.tapped = false; h.gathered = false; h.inRat = null;
        this.log(`${h.name} respawns.`); await this.placeEntity(h, c.x, c.y);
      }
    }
    this.checkWin();
    this.io.roundSummary?.({ round: this.round, money: [...this.money], vip: [...this.vipKills], tracker: this.tracker, bar: CONFIG.CONTROL_BAR, over: this.over });
    this.log(`Round ${this.round} objectives - money ${this.money.join('-')}, VIP kills ${this.vipKills.join('-')}, control ${this.tracker + 1}/${CONFIG.CONTROL_BAR}.`);
    for (const e of this.ents) {
      e.shield = false; e.ctrl = null; e.snow = false; e.solar = false; e.hold = null; e.holdLock = false; e.buff = { atk: 0, move: 0 };
    }
    this.portals = []; this.bonusAtk = [false, false];
    this.first = 1 - this.first;
  }
  async run() {
    this.phase = 'placement'; this.faceDown = true;
    for (const t of [this.startPlayer, 1 - this.startPlayer]) await this.placementFor(t);
    this.faceDown = false; this.log('All heroes are revealed.');
    for (const h of this.ents.filter((x) => x.kind === 'hero' && x.x != null)) await placedHook(this, h);
    await this.pregameMoves();
    while (!this.over) await this.playRound();
    this.phase = 'over';
  }
}
