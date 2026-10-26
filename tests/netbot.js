// Shared by the online tests: a simulated player that talks to the server like a browser (HTTP + Server-Sent Events).
import assert from 'assert/strict';
import { createMirror, applySnapshot, viewSnapshot } from '../js/netstate.js';

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const rand = (a) => a[Math.floor(Math.random() * a.length)];
export const until = async (fn, ms = 8000, what = 'condition') => { const t = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t > ms) throw new Error(`timeout waiting for ${what}`); await new Promise((r) => setTimeout(r, 5)); } };
export const makeCall = (base) => async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

// A simulated browser: event stream + a mirror of the game, like js/online.js
export class Bot {
  constructor(base, rooms, code, token, team, { auto = true, name = '' } = {}) { this.base = base; this.rooms = rooms; this.call = makeCall(base); Object.assign(this, { code, token, team, auto, name, events: [], mirror: null, room: null, prompt: null, wait: null, snaps: [], errors: [], logs: [], prompts: 0, stopRound: 4 }); }
  connect() {
    this.ac = new AbortController(); this.open = false;
    (async () => {
      const res = await fetch(`${this.base}/api/rooms/${this.code}/events?token=${this.token}`, { signal: this.ac.signal }); this.open = true;
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2); let ev = 'message', data = '';
          for (const line of chunk.split('\n')) { if (line.startsWith('event:')) ev = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
          if (data) this.handle(ev, JSON.parse(data));
        }
      }
    })().catch(() => {});
    return until(() => this.open, 3000, 'stream open');
  }
  disconnect() { this.ac.abort(); this.open = false; }
  handle(ev, d) {
    this.events.push({ ev, d });
    if (ev === 'room') { this.room = d; if (d.status !== 'lobby' && !this.mirror) this.mirror = createMirror(d.config.map, d.config.first, { startAP: d.config.startAP, mapTiles: d.config.mapTiles }); }
    else if (ev === 'state') { applySnapshot(this.mirror, d.snap); this.snaps.push(d.snap); this.checkSecrets(d.snap); }
    else if (ev === 'log') this.logs.push({ text: d.text, faceDown: this.mirror?.faceDown });
    else if (ev === 'logs') this.logs = d.lines.map((text) => ({ text, faceDown: null }));
    else if (ev === 'wait') { this.wait = d; this.prompt = null; }
    else if (ev === 'prompt') { this.prompt = d; this.wait = null; this.prompts++; this.checkMirror(); if (this.auto) setImmediate(() => this.autoAnswer(d)); }
  }
  opp() { return 1 - this.team; }
  checkSecrets(snap) { // what this player received must not reveal the opponent's secrets
    for (const e of snap.ents) {
      if (e.owner !== this.opp()) continue;
      if (e.kind === 'rat') assert.ok(!('holds' in e), 'opponent Rat holds must be hidden');
      if (e.kind === 'hero' && e.inRat != null) assert.equal(e.inRat, -1, 'which Rat Squeak is in must be hidden');
      if (e.kind === 'hero' && snap.faceDown) { assert.equal(e.defId, '$hidden', 'face-down hero identity leaked'); assert.equal(e.name, 'Hero'); assert.equal(e.song, null); }
    }
    if (snap.faceDown) assert.equal(snap.vip[this.opp()], null, 'opponent VIP leaked');
    assert.equal(snap.privateView, snap.faceDown ? this.team : null);
  }
  checkMirror() { // while a prompt is open the server state is frozen: my mirror must equal what the server would show me
    const room = this.rooms.get(this.code); if (!room?.game) return;
    assert.deepEqual(viewSnapshot(this.mirror, this.team), viewSnapshot(room.game, this.team), `mirror differs from server (team ${this.team}, round ${room.game.round}, ${this.prompt?.kind})`);
  }
  answer(id, value) { return this.call('POST', `/api/rooms/${this.code}/answer`, { token: this.token, id, value }); }
  policy(p) {
    const g = this.mirror;
    if (p.kind === 'tile') return p.cancel && Math.random() < 0.1 ? null : p.extra && Math.random() < 0.1 ? { auto: true } : rand(p.tiles);
    if (p.kind === 'choose') return p.cancel && Math.random() < 0.1 ? null : Math.floor(Math.random() * p.options.length);
    if (p.kind === 'roll') return true;
    if (p.kind === 'heroes') { const rest = shuffle(p.cand.filter((id) => !p.forced.includes(id))).slice(0, Math.max(0, 1 + Math.floor(Math.random() * p.max) - p.forced.length)); return [...p.forced, ...rest]; }
    if (g.round >= 3) return { type: 'pass' };
    const mine = g.ents.filter((e) => g.team(e) === p.team && !e.dead && (e.x != null || e.holds != null)); const opts = [];
    for (const e of mine) for (const d of g.actionDefs(e)) if (d.ok) opts.push({ e, d });
    if (!opts.length || Math.random() < 0.05) return { type: 'pass' };
    const c = rand(opts); return { type: 'do', entId: c.e.id, key: c.d.key };
  }
  async autoAnswer(p) {
    if (this.prompt?.id !== p.id) return; const r = await this.answer(p.id, this.policy(p));
    if (r.status !== 200 && r.status !== 409) this.errors.push(`${p.kind}: ${r.status} ${r.body.error}`);
  }
}
