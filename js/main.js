// Menus, hero panel, compbuilder, draft / constructed team selection, and game start.
import { HEROES } from './data.js';
import { CONFIG, TEAM_NAMES } from './config.js';
import { Game } from './engine.js';
import { GameView } from './ui.js';
import { onAssetLoad, tokenImage } from './assets.js';
import { TOKENS, HERO_TOKENS } from './tokens.js';
import { portrait, portraitById, heroColor } from './colors.js';
import { loadComps, saveComps, newId } from './comps.js';
import { allMapNames, isBuiltinMap } from './maps.js';
import { mapMaker } from './mapmaker.js';
import { getMaxMapSize, setMaxMapSize, DEFAULT_MAX_MAP_SIZE, MAX_MAP_SIZE_LIMIT } from './options.js';

const app = document.getElementById('app');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const playable = HEROES.filter((h) => h.implemented);
const byId = (id) => HEROES.find((h) => h.id === id);
let rerender = null;
onAssetLoad(() => rerender?.());

function heroDetail(d, { tokens = false } = {}) {
  if (!d) return '<p class="hint">Hover or click a hero to read its abilities.</p>';
  const toks = tokens ? (HERO_TOKENS[d.id] || []) : [];
  return `<div class="ihead" style="--hc:${heroColor(d.id)}">${portrait(d, 'lg')}<div><h4>${esc(d.name)}</h4><div class="sub">${esc(d.class)} · ${esc(d.subrole)}</div></div></div>
    ${d.implemented ? `<div class="stats">HP ${d.hp} · Move ${d.move} · ATK ${d.atk} · Reach ${d.reach} · AP ${d.ap}</div>
    ${d.blurb ? `<p class="blurb">${esc(d.blurb)}</p>` : ''}
    ${d.abilities.map((a) => `<p class="ab"><b>${esc(a.name)}</b>${a.passive ? ' <em>(passive)</em>' : ` <em>(${a.cost} AP)</em>`}<br>${esc(a.text)}</p>`).join('')}
    ${toks.length ? `<div class="toklinks"><span>Creates:</span>${toks.map((k) => `<button data-tok="${k}">${esc(TOKENS[k].name)}</button>`).join('')}</div>` : ''}` : '<p class="hint">Coming soon: stats and abilities are not implemented yet.</p>'}`;
}
function tokenDetail(kind) {
  const d = TOKENS[kind]; const img = tokenImage(kind);
  const makers = Object.entries(HERO_TOKENS).filter(([, l]) => l.includes(kind)).map(([id]) => byId(id));
  return `<div class="ihead">${img ? `<img class="por lg" src="${img}" alt="">` : `<span class="por ph lg">${esc(d.name.slice(0, 2))}</span>`}<div><h4>${esc(d.name)}</h4><div class="sub">${esc(d.cls)}</div></div></div>
    <div class="stats">${d.hp ? `HP ${d.hp}` : ''}${d.move ? ` · Move ${d.move}` : ''}${d.atk ? ` · ATK ${d.atk}` : ''}${d.reach && d.atk ? ` · Reach ${d.reach}` : ''}</div>
    ${d.text.map((t) => `<p class="ab">${esc(t)}</p>`).join('')}
    <div class="toklinks"><span>Created by:</span>${makers.map((h) => `<button data-hero="${h.id}">${esc(h.name)}</button>`).join('')}</div>`;
}
function card(d, extra = '', attrs = '') {
  return `<button class="hcard ${d.implemented ? '' : 'locked'} ${extra}" data-id="${d.id}" style="--hc:${heroColor(d.id)}" ${attrs}>${portrait(d)}<span class="hcn">${esc(d.name)}</span><span class="hcs">${esc(d.class)} · ${esc(d.subrole)}</span></button>`;
}
const head = (title, extra = '') => `<div class="pagehead"><button data-back>Back</button><h2>${title}</h2>${extra}</div>`;

function menu() {
  rerender = null;
  app.innerHTML = `<div class="menu"><div class="menuin"><h1>Hex board game</h1><p class="tag">Two-player playtest table</p>
    <div class="menubtns">
      <button class="big" data-go="draft">Play draft mode</button>
      <button class="big" data-go="constructed">Play constructed mode</button>
      <button class="big" data-go="comps">Compbuilder</button>
      <button class="big" data-go="heroes">Hero abilities</button>
      <button class="big" data-go="maps">Map maker</button>
      <button class="big" data-go="options">Options</button>
    </div></div></div>`;
  app.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => ({ draft: () => setup('draft'), constructed: () => setup('constructed'), comps: compbuilder, heroes: heroesPanel, maps: openMapMaker, options: optionsPage }[b.dataset.go]())));
}

function openMapMaker() { rerender = null; mapMaker({ app, back: menu, setRerender: (fn) => { rerender = fn; } }); }

function optionsPage() {
  rerender = null; let msg = '';
  const draw = () => {
    app.innerHTML = `<div class="page narrow">${head('Options')}
      <label class="field">Map maker: maximum map size (tiles per side)<input id="maxsize" type="number" min="${DEFAULT_MAX_MAP_SIZE}" max="${MAX_MAP_SIZE_LIMIT}" step="1" value="${getMaxMapSize()}"></label>
      <p class="hint">Default ${DEFAULT_MAX_MAP_SIZE}: the map maker board goes from coordinates 0,0 to ${DEFAULT_MAX_MAP_SIZE - 1},${DEFAULT_MAX_MAP_SIZE - 1}. You can raise it up to ${MAX_MAP_SIZE_LIMIT}. Maps you already saved keep their size.</p>
      <div class="opts"><button class="big" id="osave">Save</button><button id="oreset">Reset to ${DEFAULT_MAX_MAP_SIZE}</button></div><p class="msg">${esc(msg)}</p></div>`;
    app.querySelector('[data-back]').onclick = menu;
    app.querySelector('#osave').onclick = () => {
      const raw = Number(app.querySelector('#maxsize').value);
      if (!Number.isInteger(raw) || raw < DEFAULT_MAX_MAP_SIZE || raw > MAX_MAP_SIZE_LIMIT) { msg = `Enter a whole number from ${DEFAULT_MAX_MAP_SIZE} to ${MAX_MAP_SIZE_LIMIT}.`; return draw(); }
      msg = setMaxMapSize(raw) === raw ? `Saved: maps can now be ${raw}×${raw}.` : 'Could not save (browser storage is blocked).'; draw();
    };
    app.querySelector('#oreset').onclick = () => { setMaxMapSize(DEFAULT_MAX_MAP_SIZE); msg = `Back to ${DEFAULT_MAX_MAP_SIZE}×${DEFAULT_MAX_MAP_SIZE}.`; draw(); };
  };
  draw();
}

function heroesPanel(start = null) {
  let sel = start, tok = null;
  const draw = () => {
    app.innerHTML = `<div class="page">${head('Hero abilities')}
      <div class="split"><div class="grid">${HEROES.map((d) => card(d, sel === d.id && !tok ? 'on' : '')).join('')}</div><div class="detail">${tok ? `<button class="ghost" data-backhero>← Back to ${esc(byId(sel)?.name || 'heroes')}</button>${tokenDetail(tok)}` : heroDetail(byId(sel), { tokens: true })}</div></div></div>`;
    app.querySelector('[data-back]').onclick = menu;
    app.querySelectorAll('.hcard').forEach((b) => (b.onclick = () => { sel = b.dataset.id; tok = null; draw(); }));
    app.querySelectorAll('[data-tok]').forEach((b) => (b.onclick = () => { tok = b.dataset.tok; draw(); }));
    app.querySelectorAll('[data-hero]').forEach((b) => (b.onclick = () => { sel = b.dataset.hero; tok = null; draw(); }));
    app.querySelector('[data-backhero]')?.addEventListener('click', () => { tok = null; draw(); });
  };
  rerender = draw; draw();
}

function compbuilder() {
  let comps = loadComps(); let cur = null; let name = ''; let picked = new Set(); let msg = '';
  const open = (c) => { cur = c; name = c ? c.name : ''; picked = new Set(c ? c.heroes : []); msg = ''; };
  const draw = () => {
    const ro = cur?.builtin;
    app.innerHTML = `<div class="page">${head('Compbuilder', '<span class="turnline">Saved in this browser. Constructed mode lets you load any of them.</span>')}
      <div class="split comp"><div class="complist"><button class="big" data-new>New composition</button>
        ${comps.map((c) => `<div class="compitem ${cur?.id === c.id ? 'on' : ''}" data-open="${c.id}"><b>${esc(c.name)}</b>${c.builtin ? ' <small>built-in</small>' : ''}<div class="mini">${c.heroes.map((id) => portraitById(id, 'xs')).join('')}</div></div>`).join('')}</div>
        <div class="detail">${cur === null && !picked.size && !name ? '<p class="hint">Select a composition, or press New composition.</p>' : `
          <label class="field">Name<input id="cname" value="${esc(name)}" ${ro ? 'disabled' : ''} maxlength="40"></label>
          <div class="hint">${picked.size}/${CONFIG.TEAM_SIZE} heroes${ro ? ' (built-in compositions are read-only: duplicate to edit)' : ''}</div>
          <div class="grid small">${playable.map((d) => card(d, picked.has(d.id) ? 'on' : '', `data-pick ${ro || (!picked.has(d.id) && picked.size >= CONFIG.TEAM_SIZE) ? 'disabled' : ''}`)).join('')}</div>
          <div class="opts mt"><button class="big" id="csave" ${ro ? 'disabled' : ''}>Save</button><button id="cdup">Duplicate</button><button id="cdel" ${ro || !cur ? 'disabled' : ''}>Delete</button></div>
          <p class="msg">${esc(msg)}</p>`}</div></div></div>`;
    app.querySelector('[data-back]').onclick = menu;
    app.querySelector('[data-new]').onclick = () => { open({ id: null, name: '', heroes: [] }); cur = { id: null, name: '', heroes: [] }; draw(); };
    app.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => { open(comps.find((c) => c.id === b.dataset.open)); draw(); }));
    const nm = app.querySelector('#cname'); if (nm) nm.oninput = () => { name = nm.value; };
    app.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { if (picked.has(b.dataset.id)) picked.delete(b.dataset.id); else if (picked.size < CONFIG.TEAM_SIZE) picked.add(b.dataset.id); draw(); }));
    const save = app.querySelector('#csave');
    if (save) save.onclick = () => {
      const n = name.trim();
      if (!n) { msg = 'Give the composition a name.'; return draw(); }
      if (picked.size !== CONFIG.TEAM_SIZE) { msg = `Pick exactly ${CONFIG.TEAM_SIZE} heroes.`; return draw(); }
      if (comps.some((c) => c.name.toLowerCase() === n.toLowerCase() && c.id !== cur.id)) { msg = 'A composition with that name already exists.'; return draw(); }
      if (cur.id) { const c = comps.find((x) => x.id === cur.id); c.name = n; c.heroes = [...picked]; } else { cur = { id: newId(), name: n, heroes: [...picked] }; comps.push(cur); }
      msg = saveComps(comps) ? 'Saved.' : 'Could not save (browser storage is blocked).'; draw();
    };
    const dup = app.querySelector('#cdup'); if (dup) dup.onclick = () => { cur = { id: null, name: (name || 'Composition') + ' copy', heroes: [...picked] }; name = cur.name; msg = 'Edit the copy and press Save.'; draw(); };
    const del = app.querySelector('#cdel'); if (del) del.onclick = () => { if (!confirm(`Delete "${cur.name}"?`)) return; comps = comps.filter((c) => c.id !== cur.id); saveComps(comps); open(null); cur = null; draw(); };
  };
  rerender = draw; draw();
}

function setup(mode) {
  rerender = null;
  const maps = allMapNames();
  app.innerHTML = `<div class="page narrow">${head(mode === 'draft' ? 'Draft mode' : 'Constructed mode')}
    <label class="field">Map<select id="map"><option value="">Random</option>${maps.map((m) => `<option value="${esc(m)}">${esc(m)}${isBuiltinMap(m) ? '' : ' (custom)'}</option>`).join('')}</select></label>
    <label class="field">Starting player<select id="first"><option value="">Random</option><option value="0">Blu</option><option value="1">Red</option></select></label>
    <p class="hint">${mode === 'draft' ? 'The starting player picks 1 hero, then players alternate picking 2 at a time until each team has 7.' : 'Each player picks a team of 7 heroes (or loads a saved composition). Heroes may repeat across teams, not inside one team.'}</p>
    <button class="big" id="go">Continue</button></div>`;
  app.querySelector('[data-back]').onclick = menu;
  app.querySelector('#go').onclick = () => {
    const map = app.querySelector('#map').value || maps[Math.floor(Math.random() * maps.length)];
    const f = app.querySelector('#first').value; const first = f === '' ? Math.floor(Math.random() * 2) : Number(f);
    (mode === 'draft' ? draft : constructed)(map, first);
  };
}

function draft(map, first) {
  const order = []; let p = first;
  for (const n of CONFIG.PICK_PATTERN) { for (let i = 0; i < n; i++) order.push(p); p = 1 - p; }
  const teams = [[], []]; let hover = null;
  const draw = () => {
    const i = teams[0].length + teams[1].length; const cur = order[i];
    const done = i >= order.length;
    const list = (t) => `<div class="picks st${t}"><h3 class="t${t}">${TEAM_NAMES[t]}</h3>${teams[t].map((id) => `<div class="pk" style="--hc:${heroColor(id)}">${portraitById(id, 'xs')}${esc(byId(id).name)}</div>`).join('')}${Array.from({ length: CONFIG.TEAM_SIZE - teams[t].length }, () => '<div class="pk empty">-</div>').join('')}</div>`;
    const left = order.slice(i).findIndex((x) => x !== cur);
    app.innerHTML = `<div class="page">${head('Draft', `<span class="turnline">${done ? 'Draft complete' : `<b class="t${cur}">${TEAM_NAMES[cur]}</b> picks (${left === -1 ? order.length - i : left} left this turn)`} · map: ${esc(map)}</span><button class="big" id="start" ${done ? '' : 'disabled'}>Start game</button>`)}
      <div class="drafting">${list(0)}<div class="grid">${playable.map((d) => card(d, teams[0].includes(d.id) || teams[1].includes(d.id) ? 'taken' : '', teams[0].includes(d.id) || teams[1].includes(d.id) || done ? 'data-pick disabled' : 'data-pick')).join('')}</div>${list(1)}</div>
      <div class="detail wide">${heroDetail(byId(hover))}</div></div>`;
    app.querySelector('[data-back]').onclick = menu;
    app.querySelector('#start').onclick = () => startGame(map, teams, first);
    app.querySelectorAll('.hcard').forEach((b) => { b.onmouseenter = () => { hover = b.dataset.id; app.querySelector('.detail').innerHTML = heroDetail(byId(hover)); }; if (b.hasAttribute('data-pick') && !b.disabled) b.onclick = () => { teams[cur].push(b.dataset.id); draw(); }; });
  };
  rerender = draw; draw();
}

function constructed(map, first) {
  const teams = [new Set(), new Set()]; let hover = null; const comps = loadComps(); const chosen = ['', ''];
  const draw = () => {
    const ready = teams.every((t) => t.size === CONFIG.TEAM_SIZE);
    const col = (t) => `<div class="csel st${t}"><h3 class="t${t}">${TEAM_NAMES[t]} <small>${teams[t].size}/${CONFIG.TEAM_SIZE}</small></h3>
      <label class="field inline">Saved composition<select data-comp="${t}"><option value="">Custom</option>${comps.map((c) => `<option value="${c.id}" ${chosen[t] === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <div class="grid small">${playable.map((d) => card(d, teams[t].has(d.id) ? 'on' : '', `data-t="${t}" ${!teams[t].has(d.id) && teams[t].size >= CONFIG.TEAM_SIZE ? 'disabled' : ''}`)).join('')}</div></div>`;
    app.innerHTML = `<div class="page">${head('Constructed', `<span class="turnline">Pick ${CONFIG.TEAM_SIZE} heroes each · map: ${esc(map)}</span><button class="big" id="start" ${ready ? '' : 'disabled'}>Start game</button>`)}
      <div class="two">${col(0)}${col(1)}</div><div class="detail wide">${heroDetail(byId(hover))}</div></div>`;
    app.querySelector('[data-back]').onclick = menu;
    app.querySelector('#start').onclick = () => startGame(map, teams.map((s) => [...s]), first);
    app.querySelectorAll('[data-comp]').forEach((s) => (s.onchange = () => {
      const t = Number(s.dataset.comp); chosen[t] = s.value; const c = comps.find((x) => x.id === s.value);
      teams[t] = new Set(c ? c.heroes.filter((id) => byId(id)?.implemented) : []); draw();
    }));
    app.querySelectorAll('.hcard').forEach((b) => {
      b.onmouseenter = () => { hover = b.dataset.id; app.querySelector('.detail').innerHTML = heroDetail(byId(hover)); };
      b.onclick = () => { const t = Number(b.dataset.t); const s = teams[t]; if (s.has(b.dataset.id)) s.delete(b.dataset.id); else if (s.size < CONFIG.TEAM_SIZE) s.add(b.dataset.id); chosen[t] = ''; draw(); };
    });
  };
  rerender = draw; draw();
}

function startGame(map, teams, first) {
  rerender = null;
  const view = new GameView(app, () => { view.destroy(); menu(); });
  const game = new Game(map, teams, view.io, first);
  window.__game = game; // handy for debugging in the browser console
  view.attach(game);
  game.log(`Map: ${map}. ${TEAM_NAMES[first]} is the starting player.`);
  game.run().catch((err) => { console.error(err); alert('Game error: ' + err.message + '\n(see the browser console)'); });
}

menu();
