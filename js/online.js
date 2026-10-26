// Online 1v1: the "Play online" page, the room lobby (pick your 7 heroes) and the controller that drives the normal
// GameView from the server's messages. The rules run on the server (server/); this side shows the game and sends decisions.
import { HEROES } from './data.js';
import { CONFIG, TEAM_NAMES } from './config.js';
import { GameView } from './ui.js';
import { createMirror, applySnapshot } from './netstate.js';
import { allMapNames, isBuiltinMap, getMapTiles } from './maps.js';
import { getStartAP } from './options.js';
import { loadComps } from './comps.js';
import * as net from './net.js';

const playable = HEROES.filter((h) => h.implemented);
const inviteLink = (code) => { const u = new URL(window.location.href); u.search = `?room=${code}`; u.hash = ''; return u.toString(); };
const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); return `${label} copied.`; } catch { window.prompt(`Copy this ${label.toLowerCase()}:`, text); return ''; } };

export function initOnline({ app, esc, head, card, heroDetail, byId, menu, setRerender, burrowCard }) {
  let cur = null; // the active Online session (lobby or game)
  const stop = () => { cur?.destroy(); cur = null; };

  // ---------------------------------------------------------------- "Play online" page: create / join / resume
  function page(prefill = '', note = '') {
    stop(); setRerender(null); window.history.replaceState(null, '', window.location.pathname);
    const maps = allMapNames(); const last = net.lastSession(); const ap = getStartAP();
    app.innerHTML = `<div class="page narrow">${head('Play online', '<span class="turnline">1v1 against someone on another computer</span>')}
      ${last ? `<div class="resume"><b>Game in progress:</b> room <b>${esc(last.code)}</b> (you are <b class="t${last.team}">${TEAM_NAMES[last.team]}</b>) <button class="big" id="resume">Resume</button><button id="forget">Forget</button></div>` : ''}
      <label class="field">Your name (optional)<input id="oname" maxlength="24" value="${esc(net.getName())}" placeholder="e.g. Ana"></label>
      <div class="two online">
        <section class="onbox"><h3>Create a game</h3>
          <label class="field">Map<select id="map"><option value="">Random</option>${maps.map((m) => `<option value="${esc(m)}">${esc(m)}${isBuiltinMap(m) ? '' : ' (custom)'}</option>`).join('')}</select></label>
          <label class="field">Starting player<select id="first"><option value="">Random</option><option value="0">Blu</option><option value="1">Red</option></select></label>
          <label class="field">Your side<select id="side"><option value="">Random</option><option value="0">Blu</option><option value="1">Red</option></select></label>
          <p class="hint">Starting AP each round (from Options): Blu ${ap[0]}, Red ${ap[1]}. The host's map and settings are used for the whole match.</p>
          <button class="big" id="create">Create game</button></section>
        <section class="onbox"><h3>Join a game</h3>
          <label class="field">Room code<input id="code" maxlength="5" autocomplete="off" spellcheck="false" value="${esc(prefill)}" placeholder="ABCDE" style="text-transform:uppercase;letter-spacing:.3em"></label>
          <p class="hint">${prefill ? `You were invited to room <b>${esc(prefill)}</b>. Press Join.` : 'Ask your friend for the 5-letter code (or open the link they sent you).'}</p>
          <button class="big" id="join">Join game</button></section></div>
      <p class="msg" id="note">${esc(note)}</p></div>`;
    const $ = (s) => app.querySelector(s); const say = (m) => { $('#note').textContent = m; };
    $('[data-back]').onclick = menu;
    const name = () => { const n = $('#oname').value.trim(); net.setName(n); return n; };
    const begin = (r) => beginSession({ code: r.code, token: r.token, team: r.team });
    if (last) {
      $('#resume').onclick = async () => { try { await net.roomInfo(last.code); beginSession(last); } catch (e) { net.clearSession(last.code); page('', 'That game no longer exists.'); } };
      $('#forget').onclick = () => { net.clearSession(last.code); page(prefill); };
    }
    $('#create').onclick = async () => {
      const m = $('#map').value; const f = $('#first').value; const sd = $('#side').value;
      const config = { map: m, first: f === '' ? null : Number(f), startAP: getStartAP() };
      if (m && !isBuiltinMap(m)) config.mapTiles = getMapTiles(m);
      try { begin(await net.createRoom({ config, side: sd === '' ? null : Number(sd), name: name() })); } catch (e) { say(e.message); }
    };
    $('#join').onclick = async () => {
      const code = $('#code').value.trim().toUpperCase(); if (code.length !== 5) return say('The room code has 5 letters.');
      const mine = net.loadSession(code); if (mine) return beginSession(mine);
      try { begin(await net.joinRoom(code, { name: name() })); } catch (e) { say(e.message); }
    };
  }

  function beginSession(s) {
    stop(); net.saveSession(s); window.history.replaceState(null, '', `${window.location.pathname}#room=${s.code}`);
    cur = new Online(s); cur.start();
  }

  // Called once at startup: an invite link (?room=CODE) or a refresh inside a room (#room=CODE).
  function boot() {
    const hash = (new URLSearchParams(window.location.hash.replace(/^#/, '')).get('room') || '').toUpperCase();
    const query = (new URLSearchParams(window.location.search).get('room') || '').toUpperCase();
    if (hash && net.loadSession(hash)) { beginSession(net.loadSession(hash)); return true; }
    if (query) { page(query); return true; }
    return false;
  }

  // ---------------------------------------------------------------- one online session: lobby, then game
  class Online {
    constructor(s) {
      this.s = s; this.room = null; this.view = null; this.mirror = null; this.conn = null; this.dead = false; this.lostTimer = null;
      this.pick = new Set(); this.chosenComp = ''; this.hover = null; this.msg = ''; this.shownId = null; this.oppOnline = null;
    }
    start() {
      app.innerHTML = `<div class="page narrow">${head('Online game')}<p class="hint">Connecting to the room...</p></div>`;
      app.querySelector('[data-back]').onclick = menu;
      const live = (fn) => (d) => { if (!this.dead) fn(d); }; // messages that arrive after leaving the screen are ignored
      this.conn = net.connect(this.s.code, this.s.token, {
        room: live((d) => this.onRoom(d)), state: live((d) => this.onState(d)), log: live((d) => this.view?.io.log(d.text)), logs: live((d) => this.onLogs(d)),
        summary: live((d) => this.view?.io.roundSummary(d.s)), over: live((d) => { this.view?.io.gameOver(d); }),
        prompt: live((d) => this.showPrompt(d)), wait: live((d) => { this.shownId = null; this.view?.setWait(d.team, d.text); }),
        error: live((d) => alert(`The game stopped: ${d.message}`)), open: live(() => this.online(true)), lost: live(() => this.online(false)),
      });
    }
    destroy() { this.dead = true; clearTimeout(this.lostTimer); this.conn?.close(); this.view?.destroy(); }

    online(up) {
      clearTimeout(this.lostTimer);
      if (this.banner) { this.banner.hidden = up; this.banner.textContent = 'Connection lost. Trying to reconnect...'; }
      if (!up && !this.dead) this.lostTimer = setTimeout(async () => { // still down after a while: does the room even exist?
        try { await net.roomInfo(this.s.code); } catch (e) { if (e.status === 404 && !this.dead) { net.clearSession(this.s.code); stop(); page('', 'That room no longer exists.'); } }
      }, 4000);
    }

    onRoom(info) {
      const first = !this.room; const before = this.room?.players?.[1 - this.s.team];
      this.room = info; this.s.team = info.you; if (info.youTeam) this.pick = new Set(info.youTeam);
      if (info.status === 'lobby') return this.renderLobby();
      if (!this.view) this.enterGame();
      const opp = info.players[1 - info.you];
      if (before && opp && before.connected !== opp.connected) this.view.io.log(opp.connected ? `-- ${TEAM_NAMES[opp.team]} is back.` : `-- ${TEAM_NAMES[opp.team]} disconnected. The game waits for them.`);
      if (first && info.error) this.view.io.log(`-- ${info.error}`);
    }

    // ---------- lobby ----------
    renderLobby() {
      const room = this.room, you = this.s.team, c = room.config; const me = room.players[you], opp = room.players[1 - you];
      const link = inviteLink(room.code); const ap = c.startAP;
      const row = (t) => { const p = room.players[t]; return `<div class="prow t${t}"><b>${TEAM_NAMES[t]}</b> ${p ? `${esc(p.name)}${t === you ? ' <small>(you)</small>' : ''} <span class="dot ${p.connected ? 'on' : ''}"></span><small>${p.connected ? 'online' : 'offline'}</small> <span class="pstate ${p.ready ? 'ok' : ''}">${p.ready ? 'ready' : 'picking heroes'}</span>` : '<span class="empty">waiting for a player to join...</span>'}</div>`; };
      const comps = loadComps();
      const picker = me.ready
        ? `<div class="cardbox locked"><h3>Your team is locked in</h3><div class="mini">${[...this.pick].map((id) => esc(byId(id).name)).join(' · ')}</div><p class="hint">Waiting for ${opp ? 'your opponent to be ready' : 'an opponent to join'}...</p><button id="unready">Change team</button></div>`
        : `<div class="csel st${you}"><h3 class="t${you}">Your team <small>${this.pick.size}/${CONFIG.TEAM_SIZE}</small></h3>
            <label class="field inline">Saved composition<select id="comp"><option value="">Custom</option>${comps.map((x) => `<option value="${x.id}" ${this.chosenComp === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
            <div class="grid small">${playable.map((d) => card(d, this.pick.has(d.id) ? 'on' : '', `data-pk="${d.id}" ${!this.pick.has(d.id) && this.pick.size >= CONFIG.TEAM_SIZE ? 'disabled' : ''}`)).join('')}</div>
            <div class="opts mt"><button class="big" id="ready" ${this.pick.size === CONFIG.TEAM_SIZE ? '' : 'disabled'}>Ready</button></div></div>`;
      app.innerHTML = `<div class="page">${head('Online game', `<span class="turnline">You are <b class="t${you}">${TEAM_NAMES[you]}</b></span><button id="leave">Leave room</button>`)}
        <div class="steps"><div class="step ${opp ? 'done' : ''}"><b>1</b> Send your friend the link or the code</div><div class="step ${me.ready ? 'done' : ''}"><b>2</b> Pick your ${CONFIG.TEAM_SIZE} heroes and press Ready</div><div class="step"><b>3</b> The game starts when both players are ready</div></div>
        <div class="roomcode"><div class="rc"><small>Room code</small><b>${room.code}</b></div><div class="rl"><input readonly id="link" value="${esc(link)}"><button data-act="copylink">Copy link</button><button data-act="copycode">Copy code</button></div></div>
        <div class="lobbygrid"><div>${burrowCard(c.map)}<p class="hint">Starting player: <b class="t${c.first}">${TEAM_NAMES[c.first]}</b> · Starting AP each round: Blu ${ap[0]}, Red ${ap[1]}. These settings come from the player who created the room.</p>
          <div class="players">${row(0)}${row(1)}</div><p class="msg">${esc(this.msg)}</p></div>${picker}</div>
        <div class="detail wide">${heroDetail(byId(this.hover))}</div></div>`;
      const $ = (s) => app.querySelector(s);
      $('[data-back]').onclick = menu;
      $('#leave').onclick = async () => { if (!confirm('Leave this room? Your seat is given up.')) return; try { await net.leaveRoom(this.s.code, this.s.token); } catch { /* already gone */ } net.clearSession(this.s.code); stop(); page(); };
      $('[data-act=copylink]').onclick = async () => { this.msg = await copy(link, 'Link'); this.renderLobby(); };
      $('[data-act=copycode]').onclick = async () => { this.msg = await copy(room.code, 'Code'); this.renderLobby(); };
      $('#link').onclick = (e) => e.target.select();
      const submit = async (heroes) => { try { this.msg = ''; await net.sendTeam(this.s.code, this.s.token, heroes); } catch (e) { this.msg = e.message; this.renderLobby(); } };
      if (me.ready) { $('#unready').onclick = () => submit(null); return; }
      $('#ready').onclick = () => submit([...this.pick]);
      $('#comp').onchange = (e) => { this.chosenComp = e.target.value; const x = comps.find((q) => q.id === e.target.value); this.pick = new Set(x ? x.heroes.filter((id) => byId(id)?.implemented) : []); this.renderLobby(); };
      app.querySelectorAll('[data-pk]').forEach((b) => {
        b.onmouseenter = () => { this.hover = b.dataset.pk; app.querySelector('.detail').innerHTML = heroDetail(byId(this.hover)); };
        b.onclick = () => { const id = b.dataset.pk; if (this.pick.has(id)) this.pick.delete(id); else if (this.pick.size < CONFIG.TEAM_SIZE) this.pick.add(id); this.chosenComp = ''; this.renderLobby(); };
      });
    }

    // ---------- game ----------
    enterGame() {
      const c = this.room.config; setRerender(null);
      this.view = new GameView(app, () => this.exitGame());
      this.view.you = this.s.team; this.view.leaveText = 'Leave this game? Your opponent will wait for you. You can come back from "Play online" in the menu.';
      this.mirror = createMirror(c.map, c.first, { startAP: c.startAP, mapTiles: c.mapTiles });
      window.__game = this.mirror; this.view.attach(this.mirror);
      this.banner = document.createElement('div'); this.banner.className = 'netbanner'; this.banner.hidden = true;
      app.querySelector('.game').appendChild(this.banner);
    }
    exitGame() { if (this.room?.status === 'over') net.clearSession(this.s.code); stop(); menu(); }
    onState(d) { if (!this.mirror) return; applySnapshot(this.mirror, d.snap); this.view.render(); }
    onLogs(d) { if (!this.view) return; this.view.$('log').innerHTML = ''; for (const l of d.lines) this.view.io.log(l); }

    showPrompt(p) {
      if (!this.view || p.id === this.shownId) return; this.shownId = p.id; // a reconnect replays the pending prompt
      const io = this.view.io, done = (value) => this.answer(p, value);
      if (p.kind === 'tile') io.pickTile(p.team, p.tiles, p.prompt, { extra: p.extra, cancel: p.cancel, cancelLabel: p.cancelLabel }).then(done);
      else if (p.kind === 'choose') io.choose(p.team, p.prompt, p.options.map((o, i) => ({ label: o.label, hero: o.hero, value: i })), { cancel: p.cancel }).then(done);
      else if (p.kind === 'roll') this.view.showRoll(p.team, p.label, p.r).then(() => done(true));
      else if (p.kind === 'heroes') io.pickHeroes(p.team, p.cand.map((id) => this.mirror.ent(id)), p.max, p.forced).then(done);
      else if (p.kind === 'cmd') io.command().then(done);
    }
    async answer(p, value) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try { await net.sendAnswer(this.s.code, this.s.token, p.id, value); return; } catch (e) {
          if (e.status === 409 || this.dead) return; // stale: the game already moved on
          if (e.status === 400) { this.view?.io.log(`-- ${e.message}`); break; } // not allowed: ask again
          await new Promise((r) => setTimeout(r, 1000)); // network hiccup: retry once
        }
      }
      this.shownId = null; this.showPrompt(p); // show the same question again
    }
  }

  return { page, boot };
}
