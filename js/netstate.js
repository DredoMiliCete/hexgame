// Online play: turning a Game into JSON for the network, rebuilding a read-only copy ("mirror") of it in the browser,
// and hiding what a player must not see. Shared by the server (server/) and the browser (js/online.js). No DOM here.
//
// What is secret (per viewer = the player's team):
//  - while heroes are face down (placement): the opponent's hero identities/stats, and the opponent's VIP;
//  - always: which of the opponent's Rats holds Squeak (and which Rat Squeak is in).
import { HEROES } from './data.js';
import { Game } from './engine.js';

export const HIDDEN_DEF = { id: '$hidden', name: 'Hero', class: '', subrole: '', hp: 1, move: 0, atk: 0, reach: 0, ap: 0, abilities: [], implemented: true, blurb: '' };
const SKIP = new Set(['io', 'logs', 'terrCache', 'privateView']); // not part of the synced state

function enc(v, depth = 0) {
  if (depth > 40) throw new Error('game state is too deep to serialise (cycle?)');
  if (v instanceof Set) return { $set: [...v].map((x) => enc(x, depth + 1)) };
  if (v instanceof Map) return { $map: [...v].map(([k, x]) => [enc(k, depth + 1), enc(x, depth + 1)]) };
  if (Array.isArray(v)) return v.map((x) => enc(x, depth + 1));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) if (typeof x !== 'function' && x !== undefined) o[k] = enc(x, depth + 1); return o; }
  return v;
}
function dec(v) {
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === 'object') {
    if ('$set' in v) return new Set(v.$set.map(dec));
    if ('$map' in v) return new Map(v.$map.map(([k, x]) => [dec(k), dec(x)]));
    const o = {}; for (const [k, x] of Object.entries(v)) o[k] = dec(x); return o;
  }
  return v;
}

// Everything a player may see, as plain JSON. `viewer` = 0 | 1 (team), or null for no masking (tests / server side).
export function viewSnapshot(g, viewer = null) {
  const s = {};
  for (const [k, v] of Object.entries(g)) if (!SKIP.has(k) && k !== 'ents' && typeof v !== 'function') s[k] = enc(v);
  s.ents = g.ents.map((e) => { const { def, ...rest } = e; const o = enc(rest); if (def) o.defId = def.id; return o; });
  s.privateView = viewer != null && g.faceDown ? viewer : null;
  if (viewer == null) return s;
  for (const e of s.ents) {
    if (e.owner === viewer) continue;
    if (e.kind === 'rat') delete e.holds; // which Rat is Squeak
    if (e.kind === 'hero' && e.inRat != null) e.inRat = -1; // ...and which Rat he is in
    if (e.kind === 'hero' && s.faceDown) Object.assign(e, { defId: HIDDEN_DEF.id, name: HIDDEN_DEF.name, hp: 1, maxHp: 1, move: 0, atk: 0, reach: 0, ap: 0, song: null, money: 0, used: {}, gameUsed: {} });
  }
  if (s.faceDown && Array.isArray(s.vip)) s.vip = s.vip.map((v, t) => (t === viewer ? v : null));
  return s;
}

// A Game object that only mirrors what the server sends. It has all the Game methods the UI reads (reachOf, atkOf, actionDefs...).
export function createMirror(mapName, first = 0, opts = {}) {
  const nop = new Proxy({}, { get: () => () => {} });
  const team = ['vanish', 'glove', 'squeak', 'greyson', 'tune', 'income', 'hail']; // placeholder: the real entities come with the first snapshot
  return new Game(mapName, [team, team], nop, first, { startAP: opts.startAP, mapTiles: opts.mapTiles });
}
export function applySnapshot(g, s) {
  for (const [k, v] of Object.entries(s)) if (k !== 'ents') g[k] = dec(v);
  g.ents = s.ents.map((e) => {
    const { defId, ...rest } = dec(e);
    if (defId) rest.def = defId === HIDDEN_DEF.id ? HIDDEN_DEF : HEROES.find((h) => h.id === defId);
    return rest;
  });
  g.terrCache = new Map();
  return g;
}
