// Online rooms: lobby, the authoritative Game, and the network version of the engine's `io` (NetIO).
// The engine is the same one the browser runs for hotseat play; here every prompt is sent to the player it belongs to,
// answers are validated against what was offered, and each player only receives a snapshot with the other's secrets removed.
import crypto from 'node:crypto';
import { Game } from '../js/engine.js';
import { HEROES, MAPS } from '../js/data.js';
import { validateMap, cleanTiles } from '../js/maps.js';
import { CONFIG, TEAM_NAMES } from '../js/config.js';
import { viewSnapshot } from '../js/netstate.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const newCode = () => Array.from(crypto.randomBytes(5), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
export const newToken = () => crypto.randomBytes(16).toString('hex');
const PLAYABLE = HEROES.filter((h) => h.implemented).map((h) => h.id);
const ok = (value) => ({ ok: true, value });
const bad = (error) => ({ ok: false, error });
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

export function cleanConfig(c = {}) {
  const names = Object.keys(MAPS); let map = String(c.map || '').slice(0, 40); let mapTiles = null;
  if (Array.isArray(c.mapTiles)) {
    if (c.mapTiles.length > 800) throw new HttpError(400, 'The map is too big.');
    mapTiles = cleanTiles(c.mapTiles); const errs = validateMap(mapTiles);
    if (errs.length) throw new HttpError(400, `Invalid map: ${errs[0]}`);
    map = map || 'Custom map';
  } else if (!names.includes(map)) map = names[Math.floor(Math.random() * names.length)];
  const first = c.first === 0 || c.first === 1 ? c.first : Math.floor(Math.random() * 2);
  const ap = (n) => Math.min(20, Math.max(0, Math.floor(Number(n)) || 0));
  return { map, mapTiles, first, startAP: [ap(c.startAP?.[0]), ap(c.startAP?.[1])], mode: 'constructed' };
}
export function cleanTeam(ids) {
  if (!Array.isArray(ids) || ids.length !== CONFIG.TEAM_SIZE) throw new HttpError(400, `Pick exactly ${CONFIG.TEAM_SIZE} heroes.`);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'A hero can only be picked once per team.');
  if (!ids.every((id) => PLAYABLE.includes(id))) throw new HttpError(400, 'Unknown or unavailable hero.');
  return ids.map(String);
}

export class Room {
  constructor(code, config) {
    this.code = code; this.config = config; this.players = [null, null]; this.status = 'lobby'; this.game = null; this.io = null;
    this.pending = null; this.waiting = null; this.nextPromptId = 1; this.logLines = []; this.summary = null; this.over = null; this.maskNext = false;
    this.stateTimer = null; this.error = null; this.createdAt = Date.now(); this.touch();
  }
  touch() { this.lastActive = Date.now(); }
  addPlayer(team, name) {
    const p = { token: newToken(), team, name: String(name || TEAM_NAMES[team]).slice(0, 24), connected: false, res: null, teamIds: null, ready: false };
    this.players[team] = p; this.touch(); return p;
  }
  byToken(token) { return this.players.find((p) => p && p.token === token) || null; }
  freeTeam() { return this.players[0] ? (this.players[1] ? null : 1) : 0; }
  anyConnected() { return this.players.some((p) => p?.connected); }

  // ----- sending -----
  send(p, event, data) { if (p?.res && !p.res.writableEnded) { try { p.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* closed */ } } }
  broadcast(event, data) { for (const p of this.players) this.send(p, event, data); }
  roomInfo(p) {
    const c = this.config;
    return { code: this.code, status: this.status, you: p.team, youReady: p.ready, youTeam: p.teamIds, error: this.error,
      config: { map: c.map, mapTiles: c.mapTiles, first: c.first, startAP: c.startAP, mode: c.mode },
      players: this.players.map((q) => (q ? { team: q.team, name: q.name, connected: q.connected, ready: q.ready } : null)) };
  }
  sendRoom() { for (const p of this.players) if (p) this.send(p, 'room', this.roomInfo(p)); }
  sendState(p) { if (this.game && p) this.send(p, 'state', { snap: viewSnapshot(this.game, p.team) }); }
  flushState() { clearTimeout(this.stateTimer); this.stateTimer = null; for (const p of this.players) this.sendState(p); }
  scheduleState() { if (!this.stateTimer) this.stateTimer = setTimeout(() => this.flushState(), 0); }
  sendPrompt(p) { // the acting player gets the prompt, the other one a "waiting for" note
    const pe = this.pending; if (!pe || !p) return;
    if (p.team === pe.team) this.send(p, 'prompt', { id: pe.id, kind: pe.kind, team: pe.team, ...pe.payload });
    else this.send(p, 'wait', { team: pe.team, text: this.waiting?.text || '' });
  }
  replay(p) { // a (re)connected player gets everything needed to continue
    this.send(p, 'room', this.roomInfo(p));
    if (!this.game) return;
    this.sendState(p); this.send(p, 'logs', { lines: this.logLines });
    if (this.summary) this.send(p, 'summary', { s: this.summary });
    if (this.over) this.send(p, 'over', this.over);
    this.sendPrompt(p);
  }

  // ----- lobby -----
  setTeam(p, ids) {
    if (this.status !== 'lobby') throw new HttpError(409, 'The game has already started.');
    if (ids === null) { p.teamIds = null; p.ready = false; } else { p.teamIds = cleanTeam(ids); p.ready = true; }
    this.touch(); this.sendRoom(); this.maybeStart();
  }
  maybeStart() { if (this.status === 'lobby' && this.players.every((p) => p?.ready)) this.start(); }
  start() {
    const c = this.config; this.status = 'playing'; this.io = new NetIO(this);
    this.game = new Game(c.map, this.players.map((p) => p.teamIds), this.io, c.first, { startAP: c.startAP, mapTiles: c.mapTiles });
    this.sendRoom(); this.game.log(`Map: ${c.map}. ${TEAM_NAMES[c.first]} is the starting player.`);
    this.game.run().catch((err) => { console.error(`[room ${this.code}]`, err); this.error = err.message; this.status = 'over'; this.sendRoom(); this.broadcast('error', { message: err.message }); });
  }

  leave(p) { // before the game starts: free the seat (the room disappears when nobody is left); during a game: just a disconnect
    if (this.status !== 'lobby') return this.players.some(Boolean);
    this.players[p.team] = null; try { p.res?.end(); } catch { /* ignore */ }
    this.touch(); this.sendRoom(); return this.players.some(Boolean);
  }

  // ----- answers -----
  answer(p, id, value) {
    const pe = this.pending; this.touch();
    if (!pe || pe.id !== id) return { status: 409, error: 'That prompt is no longer active.' };
    if (p.team !== pe.team) return { status: 403, error: 'It is not your decision.' };
    const r = pe.validate(value); if (!r.ok) return { status: 400, error: r.error };
    this.pending = null; this.waiting = null; pe.resolve(r.value); return { status: 200, ok: true };
  }
  close() { clearTimeout(this.stateTimer); for (const p of this.players) { try { p?.res?.end(); } catch { /* ignore */ } } }
}

class NetIO {
  constructor(room) { this.room = room; }
  log(m) { const r = this.room; r.logLines.push(m); if (r.logLines.length > 400) r.logLines.shift(); r.broadcast('log', { text: m }); }
  refresh() { this.room.scheduleState(); }
  roundSummary(s) { this.room.summary = s; this.room.broadcast('summary', { s }); }
  gameOver(o) { const r = this.room; r.over = o; r.status = 'over'; r.flushState(); r.sendRoom(); r.broadcast('over', o); }
  async hotseat(team, msg, o = {}) { if (o.secret) this.room.maskNext = true; } // every player has their own screen: nothing to hide behind, the next prompt is just not shown to the opponent
  ask(team, kind, payload, validate, waitText) {
    const r = this.room;
    return new Promise((resolve) => {
      const hide = r.game?.faceDown || r.maskNext; r.maskNext = false;
      r.pending = { id: r.nextPromptId++, team, kind, payload, validate, resolve };
      r.waiting = { text: hide ? '' : waitText };
      r.flushState(); for (const p of r.players) r.sendPrompt(p);
    });
  }
  pickTile(team, tiles, prompt, o = {}) {
    const list = tiles.map((t) => ({ x: t.x, y: t.y }));
    const validate = (v) => {
      if (v == null) return o.cancel ? ok(null) : bad('This choice cannot be cancelled.');
      if (v.auto === true && o.extra) return ok({ auto: true });
      const m = list.find((t) => t.x === v.x && t.y === v.y); return m ? ok({ x: m.x, y: m.y }) : bad('That tile is not allowed.');
    };
    return this.ask(team, 'tile', { prompt, tiles: list, extra: o.extra || null, cancel: !!o.cancel, cancelLabel: o.cancelLabel || null }, validate, prompt);
  }
  choose(team, prompt, options, o = {}) {
    if (o.secret) this.room.maskNext = true;
    const validate = (v) => {
      if (v == null) return o.cancel !== false ? ok(null) : bad('This choice cannot be cancelled.');
      return Number.isInteger(v) && v >= 0 && v < options.length ? ok(options[v].value) : bad('That option does not exist.');
    };
    return this.ask(team, 'choose', { prompt, options: options.map((op) => ({ label: String(op.label), hero: op.hero || null })), cancel: o.cancel !== false }, validate, prompt);
  }
  async roll(team, n, label) {
    const r = 1 + crypto.randomInt(n);
    await this.ask(team, 'roll', { label, r }, () => ok(true), `${label}: rolled a ${r}`);
    return r;
  }
  pickHeroes(team, cand, max, forced) {
    const ids = cand.map((h) => h.id);
    const validate = (v) => {
      if (!Array.isArray(v) || !v.every(Number.isInteger) || new Set(v).size !== v.length) return bad('Invalid selection.');
      if (v.length > max || !v.every((id) => ids.includes(id)) || !forced.every((id) => v.includes(id))) return bad('That selection is not allowed.');
      return ok(v);
    };
    return this.ask(team, 'heroes', { cand: ids, max, forced }, validate, 'choosing which heroes to gather');
  }
  command(game) {
    const team = game.turn.team;
    const validate = (v) => {
      if (v?.type === 'pass') return ok({ type: 'pass' });
      if (v?.type === 'do' && Number.isInteger(v.entId) && typeof v.key === 'string') {
        const e = game.ents.find((x) => x.id === v.entId);
        return e && game.team(e) === team ? ok({ type: 'do', entId: v.entId, key: v.key }) : bad('That is not one of your entities.');
      }
      return bad('Unknown command.');
    };
    return this.ask(team, 'cmd', {}, validate, '');
  }
}
