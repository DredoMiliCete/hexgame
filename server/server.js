// Turfwars server: serves the game files and runs online 1v1 rooms. Zero dependencies (Node 18+).
//   node server/server.js [--port 8000]      (or: npm start)
// Rooms live in memory. Live updates go to the browsers as Server-Sent Events, their answers come back as POST requests.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Room, newCode, cleanConfig, HttpError } from './rooms.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };
const PUBLIC = ['css', 'js', 'assets']; // the only folders served (plus index.html)
const MAX_BODY = 300 * 1024, MAX_ROOMS = 200;

export function createServer({ root = ROOT } = {}) {
  const rooms = new Map(); const createLog = new Map();
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const readBody = (req) => new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new HttpError(413, 'Request too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new HttpError(400, 'Invalid JSON.')); } });
    req.on('error', reject);
  });
  const getRoom = (code) => { const r = rooms.get(String(code || '').toUpperCase()); if (!r) throw new HttpError(404, 'Room not found. Check the code.'); return r; };
  const authed = (room, token) => { const p = room.byToken(String(token || '')); if (!p) throw new HttpError(403, 'You are not part of this room.'); return p; };

  async function api(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean); // ['api','rooms',code,action]
    const [, resource, code, action] = parts; const method = req.method;
    if (resource === 'ping') return json(res, 200, { ok: true, rooms: rooms.size });
    if (resource !== 'rooms') throw new HttpError(404, 'Not found.');
    if (!code && method === 'POST') { // create
      const ip = req.socket.remoteAddress; const now = Date.now(); const recent = (createLog.get(ip) || []).filter((t) => now - t < 60000);
      if (recent.length >= 15) throw new HttpError(429, 'Too many rooms created, wait a minute.');
      if (rooms.size >= MAX_ROOMS) throw new HttpError(503, 'The server is full, try again later.');
      createLog.set(ip, [...recent, now]);
      const body = await readBody(req); const config = cleanConfig(body.config);
      let c; do { c = newCode(); } while (rooms.has(c));
      const room = new Room(c, config); rooms.set(c, room);
      const side = body.side === 0 || body.side === 1 ? body.side : Math.floor(Math.random() * 2);
      const p = room.addPlayer(side, body.name);
      return json(res, 200, { code: c, token: p.token, team: p.team });
    }
    const room = getRoom(code);
    if (!action && method === 'GET') return json(res, 200, { code: room.code, status: room.status, full: room.freeTeam() == null, map: room.config.map, first: room.config.first });
    if (action === 'join' && method === 'POST') {
      const body = await readBody(req); const team = room.freeTeam();
      if (team == null || room.status !== 'lobby') throw new HttpError(409, 'This room is full or already started.');
      const p = room.addPlayer(team, body.name); room.sendRoom();
      return json(res, 200, { code: room.code, token: p.token, team: p.team });
    }
    if (action === 'events' && method === 'GET') { // Server-Sent Events
      const p = authed(room, url.searchParams.get('token'));
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      try { p.res?.end(); } catch { /* old stream */ }
      p.res = res; p.connected = true; room.touch();
      req.on('close', () => { if (p.res === res) { p.res = null; p.connected = false; room.sendRoom(); } });
      room.sendRoom(); room.replay(p); return undefined;
    }
    if (action === 'team' && method === 'POST') {
      const body = await readBody(req); const p = authed(room, body.token);
      room.setTeam(p, body.heroes === null ? null : body.heroes); return json(res, 200, { ok: true });
    }
    if (action === 'leave' && method === 'POST') {
      const body = await readBody(req); const p = authed(room, body.token);
      if (!room.leave(p)) { room.close(); rooms.delete(room.code); }
      return json(res, 200, { ok: true });
    }
    if (action === 'answer' && method === 'POST') {
      const body = await readBody(req); const p = authed(room, body.token);
      const r = room.answer(p, body.id, body.value); return json(res, r.status, r.ok ? { ok: true } : { error: r.error });
    }
    throw new HttpError(404, 'Not found.');
  }

  function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname); if (rel === '/') rel = '/index.html';
    const top = rel.split('/').filter(Boolean)[0];
    if (rel !== '/index.html' && !PUBLIC.includes(top)) { res.writeHead(404); return res.end('Not found'); }
    const file = path.resolve(root, '.' + path.normalize(rel));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      return serveStatic(req, res, url);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500; if (status === 500) console.error(err);
      if (!res.headersSent) json(res, status, { error: err instanceof HttpError ? err.message : 'Server error.' }); else res.end();
    }
  });
  const timers = [
    setInterval(() => { for (const r of rooms.values()) for (const p of r.players) if (p?.res) { try { p.res.write(': ping\n\n'); } catch { /* closed */ } } }, 20000), // keep proxies/tunnels from closing idle streams
    setInterval(() => { const now = Date.now(); for (const [c, r] of rooms) if (!r.anyConnected() && now - r.lastActive > (r.status === 'over' ? 3600e3 : 6 * 3600e3)) { r.close(); rooms.delete(c); } }, 300000),
  ];
  for (const t of timers) t.unref();
  const close = () => new Promise((resolve) => { timers.forEach(clearInterval); for (const r of rooms.values()) r.close(); server.close(() => resolve()); server.closeAllConnections?.(); });
  return { server, rooms, close };
}

export const lanUrls = (port) => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${port}`);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--port'); const port = Number(process.env.PORT || (i > 0 ? process.argv[i + 1] : 8000));
  const { server } = createServer();
  server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Close the other server or use: node server/server.js --port 8001` : e.message); process.exit(1); });
  server.listen(port, '0.0.0.0', () => {
    console.log('\nTurfwars server running.\n');
    console.log(`  On this computer:       http://localhost:${port}`);
    for (const u of lanUrls(port)) console.log(`  Same Wi-Fi / network:   ${u}`);
    console.log('\nPlay online: open the address in your browser, choose "Play online" and create a game.');
    console.log('To play over the internet, see docs/ONLINE.md (tunnel or hosting).  Stop the server with Ctrl+C.\n');
  });
}
