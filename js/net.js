// Browser side of online play: REST calls, the live event stream and the saved sessions. No game logic here.
const url = (path) => new URL(path, window.location.href);
async function req(method, path, body) {
  const r = await fetch(url(path), { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = {}; try { data = await r.json(); } catch { /* not JSON */ }
  if (!r.ok) throw Object.assign(new Error(data.error || `Request failed (${r.status})`), { status: r.status });
  return data;
}
export const createRoom = (body) => req('POST', 'api/rooms', body);
export const roomInfo = (code) => req('GET', `api/rooms/${encodeURIComponent(code)}`);
export const joinRoom = (code, body) => req('POST', `api/rooms/${encodeURIComponent(code)}/join`, body);
export const sendTeam = (code, token, heroes) => req('POST', `api/rooms/${code}/team`, { token, heroes });
export const sendAnswer = (code, token, id, value) => req('POST', `api/rooms/${code}/answer`, { token, id, value });
export const leaveRoom = (code, token) => req('POST', `api/rooms/${code}/leave`, { token });

const EVENTS = ['room', 'state', 'log', 'logs', 'prompt', 'wait', 'summary', 'over', 'error'];
// Opens the live stream. The browser reconnects by itself; the server then resends the state and the pending prompt.
export function connect(code, token, on) {
  const es = new EventSource(url(`api/rooms/${code}/events?token=${token}`));
  for (const name of EVENTS) es.addEventListener(name, (e) => { let d = null; try { d = JSON.parse(e.data); } catch { return; } on[name]?.(d); });
  es.onopen = () => on.open?.(); es.onerror = () => on.lost?.();
  return { close: () => es.close() };
}

// Sessions (one per room code) so a refresh / closed tab can come back to the game.
const KEY = 'hexgame.online.v1';
const read = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
const write = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* storage blocked */ } };
export const saveSession = (s) => { const o = read(); o[s.code] = { token: s.token, team: s.team, at: Date.now() }; o.last = s.code; write(o); };
export const loadSession = (code) => { const s = read()[code]; return s ? { code, ...s } : null; };
export const lastSession = () => { const o = read(); return o.last && o[o.last] ? { code: o.last, ...o[o.last] } : null; };
export const clearSession = (code) => { const o = read(); delete o[code]; if (o.last === code) delete o.last; write(o); };
export const getName = () => { try { return localStorage.getItem('hexgame.name') || ''; } catch { return ''; } };
export const setName = (n) => { try { localStorage.setItem('hexgame.name', n); } catch { /* ignore */ } };
