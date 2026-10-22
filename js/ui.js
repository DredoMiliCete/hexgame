// Game screen: renders the board/HUD and implements the `io` object the engine talks to.
import { toPixel, key } from './hex.js';
import { TOKENS } from './tokens.js';
import { CONFIG, TEAM_NAMES } from './config.js';
import { heroImage, tokenImage, tileImage, onAssetLoad } from './assets.js';
import { heroColor, portrait, portraitById } from './colors.js';

const S = 38;
const TILE_FILL = { BS: '#2f6fd0', RS: '#e0284f', BN: '#6aa957', RN: '#a39a39', MM: '#3f8a1c', WW: '#5e6264', BT: '#c68ad0', RT: '#c68ad0', BA: '#b6a0e0', RA: '#e0a0b0', CP: '#cf6bff', MP: '#ffc21a', HG: '#8d7b68', HT: '#7fd3b0' };
const TILE_GLYPH = { CP: '★', MP: '$', BA: '⚓', RA: '⚓', HT: '+', HG: '▲' };
const BLU = '#5a9bff', RED = '#ff6379', GOLD = '#f4c34f';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (cx, cy, r) => [0, 1, 2, 3, 4, 5].map((i) => `${(cx + r * Math.cos(Math.PI / 3 * i)).toFixed(1)},${(cy + r * Math.sin(Math.PI / 3 * i)).toFixed(1)}`).join(' ');
const pips = (on, total) => Array.from({ length: total }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('');

export class GameView {
  constructor(root, onExit) {
    this.root = root; this.onExit = onExit; this.g = null; this.sel = null; this.mode = 'idle'; this.hl = new Map();
    this.showRats = false; this.showCoords = false; this.pending = null; this.promptHtml = ''; this.promptTeam = null; this.queued = false;
    this.summary = null; this.sumTimer = null;
    root.innerHTML = `<div class="game">
      <div class="hud" id="hud"></div>
      <div class="stage"><aside class="side" id="side0"></aside>
        <section class="boardwrap"><svg id="board" xmlns="http://www.w3.org/2000/svg"></svg><div class="summary" id="summary" hidden></div><div class="cover" id="cover" hidden></div></section>
        <aside class="side" id="side1"></aside></div>
      <div class="dock" id="dock"><div class="info" id="info"></div>
        <div class="center"><div class="prompt" id="prompt"></div><div class="actions" id="actions"></div></div>
        <div class="log" id="log"></div></div></div>`;
    this.$ = (id) => root.querySelector('#' + id);
    this.$('board').addEventListener('click', (ev) => this.onBoardClick(ev));
    root.addEventListener('click', (ev) => this.onUiClick(ev));
    onAssetLoad(() => this.render());
    this.io = this.makeIO();
  }
  attach(g) { this.g = g; this.render(); }
  render() { if (this.queued) return; this.queued = true; requestAnimationFrame(() => { this.queued = false; if (this.g) this.draw(); }); }
  draw() { this.drawHud(); this.drawSides(); this.drawBoard(); this.drawInfo(); this.drawActions(); this.drawSummary(); }

  // ---------- IO ----------
  makeIO() {
    const v = this;
    const setPrompt = (team, html) => { v.promptTeam = team; v.promptHtml = `<div class="who t${team}">${TEAM_NAMES[team]}</div><div class="msg">${html}</div>`; };
    const clear = () => { v.promptHtml = ''; v.promptTeam = null; };
    return {
      log: (m) => { const el = v.$('log'); const d = document.createElement('div'); d.textContent = m; el.appendChild(d); while (el.children.length > 300) el.firstChild.remove(); el.scrollTop = el.scrollHeight; },
      refresh: () => v.render(),
      roundSummary: (s) => { v.summary = s; clearTimeout(v.sumTimer); v.sumTimer = setTimeout(() => { v.summary = null; v.render(); }, 25000); v.render(); },
      gameOver: (o) => { v.mode = 'over'; const c = v.$('cover'); c.hidden = false; c.innerHTML = `<div class="cardbox"><h2 class="t${o.team}">${TEAM_NAMES[o.team]} wins!</h2><p>${o.type} victory.</p><button data-act="exit" class="big">Back to menu</button></div>`; },
      hotseat: (team, msg, o = {}) => new Promise((res) => {
        const c = v.$('cover'); c.hidden = false; c.className = 'cover opaque';
        c.innerHTML = `<div class="cardbox"><h2 class="t${team}">${o.secret ? 'Look away' : TEAM_NAMES[team]}</h2><p>${esc(msg)}</p><button class="big" data-act="go">Ready</button></div>`;
        v.coverRes = () => { c.hidden = true; c.className = 'cover'; c.innerHTML = ''; res(); };
      }),
      pickTile: (team, tiles, prompt, o = {}) => new Promise((res) => {
        v.hl = new Map(tiles.map((t) => [key(t.x, t.y), t])); v.mode = 'tile'; setPrompt(team, esc(prompt));
        v.promptHtml += `<div class="opts">${o.extra ? `<button data-act="extra" class="big">${esc(o.extra)}</button>` : ''}${o.cancel ? `<button data-act="cancel">${esc(o.cancelLabel || 'Cancel')}</button>` : ''}</div>`;
        v.pending = (val) => { v.hl = new Map(); v.mode = 'idle'; v.pending = null; clear(); res(val); };
        v.render();
      }),
      choose: (team, prompt, options, o = {}) => new Promise((res) => {
        v.mode = 'choose'; setPrompt(team, esc(prompt));
        v.choices = options; v.promptHtml += `<div class="opts">${options.map((op, i) => `<button data-act="opt" data-i="${i}" ${op.hero ? `style="--hc:${heroColor(op.hero)}" class="herobtn"` : ''}>${op.hero ? portraitById(op.hero, 'xs') : ''}${esc(op.label)}</button>`).join('')}${o.cancel !== false ? '<button data-act="cancel" class="ghost">Cancel</button>' : ''}</div>`;
        v.pending = (val) => { v.mode = 'idle'; v.pending = null; clear(); res(val); }; v.render();
      }),
      roll: async (team, n, label) => {
        const r = 1 + Math.floor(Math.random() * n);
        await new Promise((res) => {
          v.mode = 'choose'; setPrompt(team, `${esc(label)}: rolled a <b class="die">${r}</b>`); v.choices = [{ value: 1 }];
          v.promptHtml += '<div class="opts"><button data-act="opt" data-i="0">OK</button></div>';
          v.pending = () => { v.mode = 'idle'; v.pending = null; clear(); res(); }; v.render();
        });
        return r;
      },
      pickHeroes: (team, cand, max, forced) => new Promise((res) => {
        const chosen = new Set(forced); v.mode = 'heroes';
        const paint = () => {
          const ap = [...chosen].reduce((a, id) => a + v.g.ent(id).ap, 0);
          setPrompt(team, `Gather up to ${max} heroes (selected AP: ${ap}). Heroes gathered last round are not listed.${forced.length ? ' Driver must be gathered (Oil Change).' : ''}`);
          v.promptHtml += `<div class="opts">${cand.map((h) => `<button data-act="gather" data-id="${h.id}" style="--hc:${heroColor(h.def.id)}" class="herobtn ${chosen.has(h.id) ? 'on' : ''}" ${forced.includes(h.id) ? 'disabled' : ''}>${portrait(h.def, 'xs')}${esc(h.name)} <small>${h.ap} AP</small></button>`).join('')}<button data-act="submit" class="big">Gather</button></div>`;
          v.render();
        };
        v.toggleGather = (id) => { if (chosen.has(id)) chosen.delete(id); else if (chosen.size < max) chosen.add(id); paint(); };
        v.pending = () => { v.mode = 'idle'; v.pending = null; clear(); res([...chosen]); };
        paint();
      }),
      command: () => new Promise((res) => { v.mode = 'cmd'; v.pending = (c) => { v.mode = 'idle'; v.pending = null; res(c); }; v.render(); }),
    };
  }
  onBoardClick(ev) {
    const el = ev.target.closest('[data-x]'); if (!el) return;
    const x = Number(el.dataset.x), y = Number(el.dataset.y);
    if (this.mode === 'tile') { const t = this.hl.get(key(x, y)); if (t) this.pending({ x, y }); return; }
    const e = this.g.ents.find((q) => !q.dead && q.x === x && q.y === y && q.attachedTo == null);
    this.sel = e ? e.id : null; this.render();
  }
  onUiClick(ev) {
    const b = ev.target.closest('[data-act]');
    if (!b) { const c = ev.target.closest('[data-sel]'); if (c) { this.sel = Number(c.dataset.sel); this.render(); } return; }
    const a = b.dataset.act;
    if (a === 'go') return this.coverRes?.();
    if (a === 'exit') return this.onExit();
    if (a === 'cancel') return this.pending?.(null);
    if (a === 'extra') return this.pending?.({ auto: true });
    if (a === 'opt') return this.pending?.(this.choices[Number(b.dataset.i)].value);
    if (a === 'gather') return this.toggleGather(Number(b.dataset.id));
    if (a === 'submit') return this.pending?.();
    if (a === 'do') { this.sel = Number(b.dataset.id); return this.pending?.({ type: 'do', entId: Number(b.dataset.id), key: b.dataset.key }); }
    if (a === 'pass') { if (confirm('Pass the round? You give up all your remaining turns this round (unspent AP are lost).')) this.pending?.({ type: 'pass' }); return; }
    if (a === 'closesum') { this.summary = null; this.render(); return; }
    if (a === 'rats') { this.showRats = !this.showRats; this.render(); }
    if (a === 'coords') { this.showCoords = !this.showCoords; this.render(); }
    if (a === 'menu') { if (confirm('Leave this game?')) this.onExit(); }
  }

  // ---------- drawing ----------
  drawHud() {
    const g = this.g; const t = g.turn; const inRound = g.phase === 'round';
    const team = (i) => {
      const active = inRound && t.team === i && !g.over;
      const total = Math.max(g.apStart[i], g.pool[i]);
      const gl = g.glovePool[i] ? ` <small>+${g.glovePool[i]} Glove</small>` : '';
      return `<div class="hudteam t${i} ${active ? 'active' : ''}"><div class="tn"><b>${TEAM_NAMES[i]}</b>${active ? '<span class="tag">playing</span>' : ''}${g.passed[i] ? '<span class="tag dim">passed</span>' : ''}</div>
        <div class="apline" title="Action points left / gathered this round"><span class="apnum">${g.pool[i]}<small>/${total} AP</small>${gl}</span><span class="pips">${total <= 14 ? pips(g.pool[i], total) : ''}</span></div>
        <div class="objs"><span title="Deposited money">$ ${g.money[i]}/${CONFIG.MONEY_TO_WIN}</span><span title="VIP kills">VIP kills ${g.vipKills[i]}/${CONFIG.VIP_KILLS_TO_WIN}</span></div></div>`;
    };
    const bar = (cls = '') => Array.from({ length: CONFIG.CONTROL_BAR }, (_, i) => `<i class="${i < 4 ? 'b' : i > 4 ? 'r' : 'n'}${i === g.tracker ? ' here' : ''}"></i>`).join('');
    const turn = inRound ? `<span class="turnpill t${t.team}">${TEAM_NAMES[t.team]}'s turn</span> ${t.first ? '<small>first turn: 1 action</small>' : `<span class="pips turnpips" title="AP used this turn">${pips(Math.min(t.spent, CONFIG.AP_PER_TURN), CONFIG.AP_PER_TURN)}</span>`}` : `<span class="phase">${esc(g.phase)}</span>`;
    this.$('hud').innerHTML = `${team(0)}<div class="hudmid"><div class="rt">${g.round ? `Round ${g.round}` : 'Setup'} · ${turn}</div><div class="bar" title="Control bar (Blu left, Red right)">${bar()}</div></div>${team(1)}
      <div class="hudbtns"><button data-act="rats" class="${this.showRats ? 'on' : ''}">Show Rat identities</button><button data-act="coords" class="${this.showCoords ? 'on' : ''}">Coords</button><button data-act="menu">Menu</button></div>`;
  }
  chips(e) {
    const g = this.g; const c = [];
    if (g.isVip(e) && !(g.faceDown)) c.push('★ VIP');
    if (e.dead) c.push(`dead (${e.respawn})`); else {
      if (e.inRat != null) c.push('in a Rat'); if (e.attachedTo != null) c.push('riding');
      if (g.isTapped(e)) c.push(e.gathered ? 'gathered' : 'stunned'); if (e.shield) c.push('🛡'); if (e.money) c.push(`$${e.money}`);
      if (e.snow) c.push('Snowman'); if (e.ctrl != null && e.ctrl !== e.owner) c.push('mind-controlled'); if (e.hold) c.push('holding line'); if (e.song) c.push('♪ ' + e.song);
    }
    return c;
  }
  drawSides() {
    const g = this.g;
    for (const t of [0, 1]) {
      const hid = g.faceDown;
      const rows = g.heroes(t).map((h) => `<div class="hrow ${h.dead ? 'dead' : ''} ${this.sel === h.id ? 'sel' : ''}" data-sel="${h.id}" style="--hc:${heroColor(h.def.id)}">${hid ? '<span class="por ph">?</span>' : portrait(h.def)}<div class="hm"><div class="hn">${hid ? 'Hero' : esc(h.name)}</div>
        <div class="hp"><i style="width:${Math.max(0, h.hp / h.maxHp) * 100}%"></i><em>${hid ? '' : `${Math.max(0, h.hp)}/${h.maxHp}`}</em></div>
        <div class="chips">${hid ? '' : this.chips(h).map((c) => `<span>${esc(c)}</span>`).join('')}</div></div></div>`).join('');
      const tok = g.ents.filter((e) => e.kind !== 'hero' && e.owner === t).map((e) => `<span class="tk" data-sel="${e.id}">${esc(e.name)} ${e.hp}/${e.maxHp}</span>`).join('');
      this.$('side' + t).className = `side st${t}`;
      this.$('side' + t).innerHTML = `<h3 class="t${t}">${TEAM_NAMES[t]}</h3>${rows}<div class="toks">${tok}</div>`;
    }
  }
  drawBoard() {
    const g = this.g; const tiles = [...g.tiles.values()];
    const P = (x, y) => toPixel(x, y, S);
    const xs = tiles.map((t) => P(t.x, t.y)[0]), ys = tiles.map((t) => P(t.x, t.y)[1]);
    const pad = S * 1.3, x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
    let out = `<defs><clipPath id="tokclip"><circle r="${S * 0.62}"/></clipPath><clipPath id="hexclip"><polygon points="${hex(0, 0, S - 2)}"/></clipPath></defs>`;
    for (const t of tiles) {
      const [cx, cy] = P(t.x, t.y); const hl = this.hl.has(key(t.x, t.y)); const img = tileImage(t.t);
      out += `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})" data-x="${t.x}" data-y="${t.y}" class="tile ${hl ? 'hl' : ''}"><title>${t.x},${t.y} ${esc(t.t)}</title><polygon points="${hex(0, 0, S - 2)}" fill="${TILE_FILL[t.t] || '#888'}" stroke="#2a2f31" stroke-width="3"/>`;
      if (img) out += `<image href="${img}" x="${-S}" y="${-S}" width="${2 * S}" height="${2 * S}" clip-path="url(#hexclip)" preserveAspectRatio="xMidYMid slice"/>`;
      if (t.t === 'BT' || t.t === 'RT') {
        const [tx, ty] = P(t.tx, t.ty); const ang = Math.atan2(ty - cy, tx - cx) * 180 / Math.PI;
        out += `<g transform="rotate(${ang.toFixed(0)})"><path d="M-12,-5 H4 V-12 L16,0 L4,12 V5 H-12 Z" fill="#fff" fill-opacity=".75" stroke="#6d3b78" stroke-width="1.5"/></g>`;
      } else if (TILE_GLYPH[t.t] && !img) out += `<text class="glyph" text-anchor="middle" dy=".35em">${TILE_GLYPH[t.t]}</text>`;
      if (this.showCoords) out += `<text class="coord" text-anchor="middle" y="${S * 0.62}">${t.x},${t.y}</text>`;
      if (hl) out += `<polygon points="${hex(0, 0, S - 4)}" class="hlp"/>`;
      out += '</g>';
    }
    for (const [a, b] of g.portals) { const [ax, ay] = P(a.x, a.y), [bx, by] = P(b.x, b.y); out += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" class="portal"/>`; }
    for (const s of g.smokes) { const [cx, cy] = P(s.x, s.y); out += `<g transform="translate(${cx},${cy})" pointer-events="none"><circle r="${S * 0.8}" fill="#d9dfe3" fill-opacity=".55" stroke="${s.team ? RED : BLU}" stroke-width="2" stroke-dasharray="4 3"/><text class="glyph" text-anchor="middle" dy=".35em" fill="#555">~</text></g>`; }
    for (const e of g.ents) { if (e.dead || e.x == null || e.attachedTo != null) continue; out += this.entSvg(e, P(e.x, e.y)); }
    const svg = this.$('board'); svg.setAttribute('viewBox', `${x0} ${y0} ${w} ${h}`); svg.innerHTML = out;
  }
  entSvg(e, [cx, cy]) {
    const g = this.g; const tm = g.team(e); const col = tm === 0 ? BLU : RED; const hero = e.kind === 'hero';
    const R = S * (e.kind === 'rat' ? 0.45 : 0.62); const down = g.faceDown && hero && g.privateView !== e.owner;
    const img = down ? null : hero ? heroImage(e.def) : tokenImage(e.kind);
    const label = down ? '?' : hero ? e.name.slice(0, 2) : e.kind === 'rat' ? 'Rt' : e.kind === 'cat' ? 'Ct' : e.kind === 'ink' ? 'IM' : '2D';
    const sel = this.sel === e.id; const tapped = g.isTapped(e) && !down;
    const riders = g.ents.filter((r) => r.attachedTo === e.id);
    let o = `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})" data-x="${e.x}" data-y="${e.y}" class="ent ${tapped ? 'tapped' : ''}" opacity="${tapped ? 0.6 : 1}">`;
    o += `<circle r="${R}" fill="${down ? '#34404a' : '#1c2326'}" stroke="${sel ? GOLD : col}" stroke-width="${sel ? 5 : 3.5}"/>`;
    if (e.ctrl != null && e.ctrl !== e.owner) o += `<circle r="${R + 4}" fill="none" stroke="${e.ctrl === 0 ? BLU : RED}" stroke-width="2" stroke-dasharray="3 3"/>`;
    if (img) o += `<image href="${img}" x="${-R}" y="${-R}" width="${2 * R}" height="${2 * R}" clip-path="url(#tokclip)" preserveAspectRatio="xMidYMid slice" ${R === S * 0.62 ? '' : `transform="scale(${R / (S * 0.62)})"`}/>`;
    else o += `<text class="tok" text-anchor="middle" dy=".35em">${esc(label)}</text>`;
    if (e.snow) o += `<circle r="${R}" fill="#e8f4ff" fill-opacity=".8"/><text class="glyph" text-anchor="middle" dy=".35em">⛄</text>`;
    if (e.kind === 'rat' && this.showRats && e.holds != null) o += `<circle r="${R + 3}" fill="none" stroke="${GOLD}" stroke-width="2.5"/><text class="badge" x="0" y="${-R - 5}" text-anchor="middle">S</text>`;
    if (!down && e.maxHp) o += `<rect x="${-R}" y="${R + 3}" width="${2 * R}" height="5" rx="2" fill="#111"/><rect x="${-R}" y="${R + 3}" width="${Math.max(0, 2 * R * e.hp / e.maxHp)}" height="5" rx="2" fill="${e.hp / e.maxHp > 0.4 ? '#6fd36f' : '#ef6b5b'}"/>`;
    if (!down && hero) {
      if (e.shield) o += `<text class="badge" x="${-R}" y="${-R + 6}">🛡</text>`;
      if (e.money) o += `<text class="badge" x="${R - 8}" y="${-R + 6}">$${e.money}</text>`;
      if (g.isVip(e) && !g.faceDown) o += `<text class="badge" x="${R - 6}" y="${R}" fill="${GOLD}">★</text>`;
      if (riders.length) o += `<text class="badge" x="${-R - 2}" y="${R}">+${riders.length}</text>`;
    }
    return o + '</g>';
  }
  drawInfo() {
    const g = this.g; const e = this.sel != null ? g.ent(this.sel) : null; const el = this.$('info');
    if (!e) { el.innerHTML = '<p class="hint">Click a hero or token on the board or in the side panels to inspect it.</p>'; return; }
    if (g.faceDown && e.kind === 'hero' && g.privateView !== e.owner) { el.innerHTML = '<p class="hint">Face-down hero.</p>'; return; }
    if (e.kind === 'hero') {
      const d = e.def;
      el.innerHTML = `<div class="ihead" style="--hc:${heroColor(d.id)}">${portrait(d, 'lg')}<div><h4>${esc(e.name)}</h4><div class="sub">${esc(d.class)} · ${esc(d.subrole)}</div></div></div>
        <div class="stats">HP ${Math.max(0, e.hp)}/${e.maxHp} · Move ${g.moveOf(e)} · ATK ${g.atkOf(e)} · Reach ${g.reachOf(e)} · AP ${e.ap}</div>
        <div class="chips">${this.chips(e).map((c) => `<span>${esc(c)}</span>`).join('')}</div>
        ${d.abilities.map((a) => `<p class="ab"><b>${esc(a.name)}</b>${a.passive ? ' <em>(passive)</em>' : ` <em>(${a.cost} AP)</em>`}<br>${esc(a.text)}</p>`).join('')}`;
    } else {
      const d = TOKENS[e.kind];
      el.innerHTML = `<div class="ihead"><h4>${esc(d.name)}</h4></div><div class="stats">${d.cls} · HP ${e.hp}/${e.maxHp}${d.move ? ` · Move ${d.move}` : ''}${d.atk ? ` · ATK ${d.atk}` : ''}</div>${d.text.map((t) => `<p class="ab">${esc(t)}</p>`).join('')}`;
    }
  }
  drawActions() {
    const g = this.g; const box = this.$('actions'); const pr = this.$('prompt'); const dock = this.$('dock');
    const tint = g.phase === 'round' && !g.over ? g.turn.team : this.promptTeam;
    dock.className = 'dock' + (tint != null ? ` tint${tint}` : '');
    pr.innerHTML = this.promptHtml;
    if (this.mode !== 'cmd') { box.innerHTML = ''; return; }
    const T = g.turn.team;
    const ents = g.ents.filter((e) => !e.dead && g.team(e) === T && ((e.kind === 'hero' && (e.x != null || e.attachedTo != null)) || e.kind === 'rat'));
    const cols = ents.map((e) => {
      const hero = e.kind === 'hero'; const defs = g.actionDefs(e);
      const stuck = !defs.length || defs.every((d) => !d.ok && /^Unprepared/.test(d.why));
      const btns = stuck ? `<span class="hint">${defs.length ? 'Unprepared' : 'No actions'}</span>` : defs.map((d) => `<button data-act="do" data-id="${e.id}" data-key="${d.key}" ${d.ok ? '' : 'disabled'} title="${esc((d.ok ? '' : d.why + ' - ') + (d.desc || ''))}">${esc(d.label)} <small>${g.freeAction(e) && !d.util ? 'free' : d.cost + ' AP'}</small></button>`).join('');
      const pm = hero && g.hasMoneyLover(e) && !stuck ? `<label class="chk"><input type="checkbox" data-pm="${e.id}" ${e.preferMoney ? 'checked' : ''}> pay with money</label>` : '';
      return `<div class="ecol ${stuck ? 'stuck' : ''} ${this.sel === e.id ? 'sel' : ''}" style="--hc:${hero ? heroColor(e.def.id) : '#8896a0'}"><div class="ech" data-sel="${e.id}">${hero ? portrait(e.def, 'xs') : ''}<b>${esc(e.name)}</b>${g.freeAction(e) ? '<span class="vipfree" title="VIP: the first action this round is free">★ free</span>' : ''}</div><div class="ebtns">${btns}</div>${pm}</div>`;
    }).join('');
    box.innerHTML = `<div class="abar"><span class="who t${T}">${TEAM_NAMES[T]}: all available actions</span><button data-act="pass" class="ghost">Pass round</button></div><div class="ecols">${cols}</div>`;
    box.querySelectorAll('[data-pm]').forEach((cb) => { cb.onchange = () => { g.ent(Number(cb.dataset.pm)).preferMoney = cb.checked; }; });
  }
  drawSummary() {
    const g = this.g; const el = this.$('summary'); const s = this.summary;
    if (!s || g.over) { el.hidden = true; return; }
    el.hidden = false;
    const bar = Array.from({ length: s.bar }, (_, i) => `<i class="${i < 4 ? 'b' : i > 4 ? 'r' : 'n'}${i === s.tracker ? ' here' : ''}"></i>`).join('');
    const row = (name, val) => `<div class="srow"><span>${name}</span><span>${val}</span></div>`;
    el.innerHTML = `<button data-act="closesum" class="x" aria-label="Close">×</button><h4>End of round ${s.round}</h4>
      ${row('Monetary', `<b class="t0">Blu ${s.money[0]}/${CONFIG.MONEY_TO_WIN}</b> · <b class="t1">Red ${s.money[1]}/${CONFIG.MONEY_TO_WIN}</b>`)}
      ${row('Control', `<span class="bar">${bar}</span>`)}
      ${row('Assassination', `<b class="t0">Blu ${s.vip[0]}/${CONFIG.VIP_KILLS_TO_WIN}</b> · <b class="t1">Red ${s.vip[1]}/${CONFIG.VIP_KILLS_TO_WIN}</b>`)}`;
  }
}
