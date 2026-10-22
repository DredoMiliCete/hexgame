// Map editing model (no DOM): the tiles of a map under construction, with undo, and the teleport rules.
//  - A teleport (BT/RT) always points at a teleport/anchor of its own colour (existing, or one created together with it).
//  - Replacing/erasing a tile that teleports point at removes the teleports it would leave dangling.
import { key } from './hex.js';
import { TELEPORTS, TP_TARGETS, hgOf, hgDir } from './maps.js';

const clone = (t) => ({ ...t, ...(t.hg ? { hg: [...t.hg] } : {}) });
const sameTile = (a, b) => !!a && !!b && a.t === b.t && a.tx === b.tx && a.ty === b.ty && (a.hg || []).join() === (b.hg || []).join();

export class MapModel {
  constructor(list = []) { this.tiles = new Map(); for (const t of list) this.tiles.set(key(t.x, t.y), clone(t)); this.undoStack = []; }
  get(x, y) { return this.tiles.get(key(x, y)); }
  list() { return [...this.tiles.values()].sort((a, b) => a.y - b.y || a.x - b.x).map(clone); }
  snapshot() { this.undoStack.push(this.list()); if (this.undoStack.length > 80) this.undoStack.shift(); }
  undo() { const s = this.undoStack.pop(); if (!s) return false; this.tiles = new Map(s.map((t) => [key(t.x, t.y), t])); return true; }
  clear() { if (!this.tiles.size) return; this.snapshot(); this.tiles.clear(); }

  // Teleports (cascading) that would be left without a valid target if (x,y) became `newType` (null = erased).
  brokenBy(x, y, newType) {
    const out = []; const gone = new Set(); const queue = [[x, y, newType]];
    while (queue.length) {
      const [qx, qy, nt] = queue.shift();
      for (const t of this.tiles.values()) {
        if (!TELEPORTS.includes(t.t) || t.tx !== qx || t.ty !== qy || (t.x === x && t.y === y) || gone.has(key(t.x, t.y))) continue;
        if (nt && TP_TARGETS[t.t].includes(nt)) continue;
        gone.add(key(t.x, t.y)); out.push(clone(t)); queue.push([t.x, t.y, null]);
      }
    }
    return out;
  }
  // Existing tiles a new teleport of this colour ('B' | 'R') placed at (x,y) could connect to.
  linkTargets(x, y, color) {
    return [...this.tiles.values()].filter((t) => TP_TARGETS[color + 'T'].includes(t.t) && !(t.x === x && t.y === y)).map(clone);
  }

  _put(x, y, spec) {
    for (const b of this.brokenBy(x, y, spec ? spec.t : null)) this.tiles.delete(key(b.x, b.y));
    if (spec) this.tiles.set(key(x, y), { x, y, ...spec }); else this.tiles.delete(key(x, y));
  }
  // Plain tiles (everything except teleports and High Ground). Returns false if nothing changed.
  place(x, y, type, { snap = true } = {}) {
    if (TELEPORTS.includes(type) || type === 'HG') throw new Error('Use placeTeleport / placeHighGround for ' + type);
    if (this.get(x, y)?.t === type) return false;
    if (snap) this.snapshot();
    this._put(x, y, { t: type }); return true;
  }
  erase(x, y, { snap = true } = {}) {
    if (!this.get(x, y)) return false;
    if (snap) this.snapshot();
    this._put(x, y, null); return true;
  }
  placeHighGround(x, y, dir, { snap = true } = {}) {
    if (!hgDir(hgOf(dir))) throw new Error('A High Ground tile needs a direction');
    if (sameTile(this.get(x, y), { t: 'HG', hg: hgOf(dir) })) return false;
    if (snap) this.snapshot();
    this._put(x, y, { t: 'HG', hg: hgOf(dir) }); return true;
  }
  // Teleport of `color` ('B' | 'R') at (x,y) connected to an EXISTING teleport/anchor of that colour at `to`.
  placeTeleport(x, y, color, to) {
    const dst = this.get(to.x, to.y); const type = color + 'T';
    if (!dst || !TP_TARGETS[type].includes(dst.t) || (to.x === x && to.y === y)) throw new Error('A teleport must connect to another teleport/anchor of its colour');
    this.snapshot();
    this._put(x, y, { t: type, tx: to.x, ty: to.y }); return true;
  }
  // Teleport at (x,y) connected to a NEW tile created at `at`: kind 'A' = anchor, 'T' = teleport (which links back to (x,y)).
  placeTeleportNew(x, y, color, kind, at) {
    if (at.x === x && at.y === y) throw new Error('The new tile must be a different tile');
    if (this.get(at.x, at.y)) throw new Error('The new tile needs an empty spot');
    this.snapshot();
    this._put(x, y, { t: color + 'T', tx: at.x, ty: at.y });
    if (kind === 'A') this._put(at.x, at.y, { t: color + 'A' });
    else this._put(at.x, at.y, { t: color + 'T', tx: x, ty: y });
    return true;
  }
}
