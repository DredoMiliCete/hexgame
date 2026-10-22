// Map maker screens: map list (create / edit / delete) and the tile editor.
// The editing rules live in mapedit.js (MapModel) and the save rules in maps.js (validateMap).
import { toPixel, key, DIR_LIST, DIR_LABEL } from './hex.js';
import { TILE_INFO } from './data.js';
import { TILE_FILL, hex, tileDecor } from './ui.js';
import { tileImage } from './assets.js';
import { MapModel } from './mapedit.js';
import { allMapNames, getMapTiles, isBuiltinMap, saveCustomMap, deleteCustomMap, customMapExists, validateMap, countTiles, mapExtent, SPAWN_MIN } from './maps.js';
import { getMaxMapSize } from './options.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const S = 30; // hex size of the editor board (the SVG scales to fit the screen)
const GROUPS = [
  ['Spawn & territory', ['BS', 'RS', 'BN', 'RN', 'MM']],
  ['Objectives', ['CP', 'MP']],
  ['Teleports & anchors', ['BT', 'BA', 'RT', 'RA']],
  ['Terrain', ['WW', 'HG', 'HT']],
];
const LABEL = { BS: 'Blu Spawn', RS: 'Red Spawn', BN: 'Blu Normal', RN: 'Red Normal', MM: 'Middle', CP: 'Control Point', MP: 'Money Point',
  BT: 'Blu Teleport', RT: 'Red Teleport', BA: 'Blu Anchor', RA: 'Red Anchor', WW: 'Wall', HG: 'High Ground', HT: 'Heal Tile' };
const COLOR_NAME = { B: 'Blu', R: 'Red' };
const head = (title, extra = '') => `<div class="pagehead"><button data-back>Back</button><h2>${title}</h2>${extra}</div>`;

// Static SVG preview of a map (list thumbnails).
function previewSvg(tiles, s = 8) {
  const P = (x, y) => toPixel(x, y, s);
  const xs = tiles.map((t) => P(t.x, t.y)[0]), ys = tiles.map((t) => P(t.x, t.y)[1]);
  if (!tiles.length) return '<div class="mmempty">Empty</div>';
  const pad = s * 1.2, x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
  const body = tiles.map((t) => { const [cx, cy] = P(t.x, t.y); return `<polygon transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})" points="${hex(0, 0, s - 0.6)}" fill="${TILE_FILL[t.t] || '#888'}"/>`; }).join('');
  return `<svg class="mmthumb" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

export function mapMaker({ app, back, setRerender }) {
  let cleanup = null;
  const leaveTo = (fn) => { cleanup?.(); cleanup = null; setRerender(null); fn(); };

  // =============================== list ===============================
  function list(note = '') {
    const names = allMapNames();
    const draw = () => {
      app.innerHTML = `<div class="page">${head('Map maker', '<span class="turnline">Create a map, or open any map to edit it. Built-in maps are read-only: saving an edited built-in map creates your own copy.</span>')}
        <div class="opts"><button class="big" data-new>New map</button></div>
        <p class="msg">${esc(note)}</p>
        <div class="mmlist">${names.map((n, i) => {
    const tiles = getMapTiles(n); const c = countTiles(tiles); const ext = mapExtent(tiles); const built = isBuiltinMap(n);
    return `<div class="mmcard"><div class="mmprev">${previewSvg(tiles)}</div><div class="mmcinfo"><b>${esc(n)}</b> ${built ? '<small>built-in</small>' : '<small class="mine">custom</small>'}
            <div class="hint">${tiles.length} tiles · ${ext.w}×${ext.h} · <span class="t0">${c.BS || 0} Blu</span> / <span class="t1">${c.RS || 0} Red</span> spawn</div>
            <div class="opts"><button data-edit="${i}">Edit</button>${built ? '' : `<button data-del="${i}">Delete</button>`}</div></div></div>`;
  }).join('')}</div></div>`;
      app.querySelector('[data-back]').onclick = () => leaveTo(back);
      app.querySelector('[data-new]').onclick = () => editor(null);
      app.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editor(names[Number(b.dataset.edit)])));
      app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
        const n = names[Number(b.dataset.del)]; if (isBuiltinMap(n)) return;
        if (!confirm(`Delete the map "${n}"? This cannot be undone.`)) return;
        deleteCustomMap(n); list(`Deleted "${n}".`);
      }));
    };
    cleanup?.(); cleanup = null; setRerender(null);
    draw();
  }

  // =============================== editor ===============================
  function editor(openName) {
    cleanup?.(); cleanup = null;
    const source = openName == null ? null : getMapTiles(openName);
    const model = new MapModel(source || []);
    const ext = mapExtent(source || []);
    const N = Math.max(getMaxMapSize(), ext.w, ext.h);               // grid is N×N: coordinates 0..N-1
    let origin = openName != null && !isBuiltinMap(openName) ? openName : null; // custom map being edited (Save overwrites it)
    let name = openName == null ? 'New map' : isBuiltinMap(openName) ? `${openName} copy` : openName;
    let tool = 'BN'; let flow = null; let msg = ''; let dirty = false; let showCoords = false; let stroke = null;
    const P = (x, y) => toPixel(x, y, S);

    const kindOfTool = (t) => (t === 'BT' || t === 'RT' ? 'tp' : t === 'HG' ? 'hg' : 'plain');
    const mark = () => { dirty = true; };

    app.innerHTML = `<div class="page mm">${head('Map maker', '<span class="turnline" id="mmsub"></span>')}
      <div class="mmgrid"><section class="mmboard"><svg id="mmboard" xmlns="http://www.w3.org/2000/svg"></svg></section>
      <aside class="mmside"><label class="field">Map name<input id="mmname" maxlength="40"></label><div id="mmprompt"></div><div id="mmpal"></div><div id="mmstatus"></div></aside></div></div>`;
    const $ = (id) => app.querySelector('#' + id);
    $('mmname').value = name;
    $('mmsub').textContent = openName == null ? 'New map' : isBuiltinMap(openName) ? `Editing a copy of the built-in map "${openName}" - your changes are saved as a new custom map.` : `Editing your custom map "${openName}".`;

    // ---------- drawing ----------
    function highlights() {
      const hl = new Map();
      if (flow?.kind === 'link') for (const t of model.linkTargets(flow.x, flow.y, flow.color)) hl.set(key(t.x, t.y), 1);
      if (flow?.kind === 'new') for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if (!model.get(x, y) && !(x === flow.x && y === flow.y)) hl.set(key(x, y), 1);
      return hl;
    }
    function drawBoard() {
      const hl = highlights(); const imgs = {};
      const xs = [0, (N - 1) * 1.5 * S], ys = [P(N - 1, 0)[1], P(0, N - 1)[1]]; const pad = S * 1.3;
      const x0 = xs[0] - pad, y0 = ys[0] - pad, w = xs[1] - xs[0] + 2 * pad, h = ys[1] - ys[0] + 2 * pad;
      let out = `<defs><clipPath id="hexclip"><polygon points="${hex(0, 0, S - 2)}"/></clipPath></defs>`;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const t = model.get(x, y); const [cx, cy] = P(x, y); const lit = hl.has(key(x, y)); const src = flow && flow.x === x && flow.y === y;
          const img = t ? (imgs[t.t] ??= tileImage(t.t)) : null;
          out += `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})" data-x="${x}" data-y="${y}" class="mcell ${t ? '' : 'void'}"><title>${x},${y} ${t ? esc(LABEL[t.t]) : 'Void'}</title>`;
          out += t ? `<polygon points="${hex(0, 0, S - 2)}" fill="${TILE_FILL[t.t] || '#888'}" stroke="#2a2f31" stroke-width="3"/>` : `<polygon points="${hex(0, 0, S - 2)}" class="voidp"/>`;
          if (img) out += `<image href="${img}" x="${-S}" y="${-S}" width="${2 * S}" height="${2 * S}" clip-path="url(#hexclip)" preserveAspectRatio="xMidYMid slice" pointer-events="none"/>`;
          if (t) out += tileDecor({ ...t }, P, !!img);
          if (showCoords) out += `<text class="coord" text-anchor="middle" y="${S * 0.62}">${x},${y}</text>`;
          if (lit) out += `<polygon points="${hex(0, 0, S - 4)}" class="hlp"/>`;
          if (src) out += `<polygon points="${hex(0, 0, S - 3)}" class="srcp"/>`;
          out += '</g>';
        }
      }
      for (const t of model.tiles.values()) { // faint link lines between connected teleports/anchors
        if (t.tx == null) continue; const [ax, ay] = P(t.x, t.y), [bx, by] = P(t.tx, t.ty);
        out += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" class="mmlink ${t.t === 'BT' ? 'b' : 'r'}"/>`;
      }
      const svg = $('mmboard'); svg.setAttribute('viewBox', `${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`); svg.innerHTML = out;
    }
    function drawPalette() {
      const info = TILE_INFO[tool];
      $('mmpal').innerHTML = `${GROUPS.map(([g, codes]) => `<div class="palg"><h4>${g}</h4><div class="pal">${codes.map((c) => `<button data-tool="${c}" class="${tool === c ? 'on' : ''}" title="${esc(TILE_INFO[c]?.text || '')}"><i style="background:${TILE_FILL[c]}"></i>${LABEL[c]}</button>`).join('')}</div></div>`).join('')}
        <div class="palg"><h4>Remove</h4><div class="pal"><button data-tool="ERASE" class="${tool === 'ERASE' ? 'on' : ''}" title="Absence of a tile (Void)"><i class="voidsw"></i>Void (erase)</button></div></div>
        <div class="tinfo">${tool === 'ERASE' ? '<b>Void</b><p>Absence of a tile. Nothing can go through or into it.</p>' : `<b>${LABEL[tool]}</b>${info ? ` <small>${esc(info.look)}</small><p>${esc(info.text)}</p>` : ''}`}</div>`;
    }
    function drawPrompt() {
      const el = $('mmprompt');
      if (!flow) { el.innerHTML = ''; return; }
      if (flow.kind === 'hg') {
        el.innerHTML = `<div class="flow"><b>High Ground at ${flow.x},${flow.y}</b><p>Choose its direction (the way the arrow points):</p>
          <div class="opts">${DIR_LIST.map((d) => `<button data-dir="${d}">${DIR_LABEL[d]}</button>`).join('')}<button class="ghost" data-act="cancelflow">Cancel</button></div></div>`;
      } else if (flow.kind === 'link') {
        const c = COLOR_NAME[flow.color]; const n = model.linkTargets(flow.x, flow.y, flow.color).length;
        el.innerHTML = `<div class="flow"><b>${c} Teleport at ${flow.x},${flow.y}</b><p>Connect it to another ${c} teleport or anchor: click a highlighted tile${n ? '' : ' (there is none yet)'}, or create a new one.</p>
          <div class="opts"><button data-newkind="T">New ${c} Teleport</button><button data-newkind="A">New ${c} Anchor</button><button class="ghost" data-act="cancelflow">Cancel</button></div></div>`;
      } else {
        const c = COLOR_NAME[flow.color]; const what = flow.what === 'A' ? 'Anchor' : 'Teleport';
        el.innerHTML = `<div class="flow"><b>New ${c} ${what}</b><p>Click an empty spot for it${flow.what === 'T' ? ' (it will connect back to the teleport at ' + flow.x + ',' + flow.y + ')' : ''}.</p>
          <div class="opts"><button class="ghost" data-act="cancelflow">Cancel</button></div></div>`;
      }
    }
    function drawStatus() {
      const tiles = model.list(); const c = countTiles(tiles); const errs = validateMap(tiles); const canDelete = origin != null;
      const sp = (code, label, cls) => `<span class="spawn ${(c[code] || 0) >= SPAWN_MIN ? 'ok' : 'bad'} ${cls}">${label} ${c[code] || 0}/${SPAWN_MIN}</span>`;
      $('mmstatus').innerHTML = `<div class="spawns">${sp('BS', 'Blu Spawn', 't0')}${sp('RS', 'Red Spawn', 't1')}</div>
        ${errs.length ? `<ul class="errs">${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '<p class="okline">Ready to save.</p>'}
        <div class="opts mt"><button class="big" data-act="save" ${errs.length ? 'disabled' : ''}>Save</button><button data-act="undo" ${model.undoStack.length ? '' : 'disabled'}>Undo</button><button data-act="clear" ${tiles.length ? '' : 'disabled'}>Clear board</button></div>
        <div class="opts"><button data-act="coords" class="${showCoords ? 'on' : ''}">Coordinates</button>${canDelete ? '<button data-act="delete">Delete this map</button>' : ''}</div>
        <p class="hint small">Grid ${N}×${N} (coordinates 0,0 to ${N - 1},${N - 1})${N > getMaxMapSize() ? ': this map is bigger than the current size limit, it keeps its size' : '. The size limit can be raised in Options'}. ${origin ? 'Saving under a different name creates a copy.' : ''}</p>
        <p class="msg">${esc(msg)}</p>`;
    }
    const draw = () => { drawBoard(); drawPalette(); drawPrompt(); drawStatus(); };
    setRerender(drawBoard);

    // ---------- actions ----------
    const confirmBroken = (x, y, type) => {
      const broken = model.brokenBy(x, y, type); if (!broken.length) return true;
      return confirm(`${broken.length} teleport${broken.length > 1 ? 's' : ''} connected to this tile would be removed (${broken.map((b) => `${b.x},${b.y}`).join('; ')}). Continue?`);
    };
    const fail = (e) => { msg = e.message; draw(); };
    function paint(x, y, { drag = false } = {}) { // plain tiles and erase
      const kind = tool === 'ERASE' ? 'erase' : kindOfTool(tool); if (kind !== 'erase' && kind !== 'plain') return false;
      const cur = model.get(x, y); const next = kind === 'erase' ? null : tool;
      if ((cur?.t ?? null) === next) return false;
      if (!confirmBrokenFor(x, y, next, drag)) return false;
      if (kind === 'erase') model.erase(x, y, { snap: !drag }); else model.place(x, y, tool, { snap: !drag });
      mark(); return true;
    }
    const confirmBrokenFor = (x, y, type, drag) => (drag ? model.brokenBy(x, y, type).length === 0 : confirmBroken(x, y, type));
    function cellClick(x, y) {
      msg = '';
      if (flow?.kind === 'hg') { msg = 'Choose a direction for the High Ground tile first (or cancel).'; return draw(); }
      if (flow?.kind === 'link') {
        const t = model.get(x, y);
        if (!t || !model.linkTargets(flow.x, flow.y, flow.color).some((q) => q.x === x && q.y === y)) { msg = `Pick a highlighted ${COLOR_NAME[flow.color]} teleport/anchor, or create a new one.`; return draw(); }
        if (!confirmBroken(flow.x, flow.y, flow.color + 'T')) return;
        try { model.placeTeleport(flow.x, flow.y, flow.color, { x, y }); mark(); flow = null; } catch (e) { return fail(e); }
        return draw();
      }
      if (flow?.kind === 'new') {
        if (model.get(x, y) || (x === flow.x && y === flow.y)) { msg = 'Pick an empty highlighted spot.'; return draw(); }
        try { model.placeTeleportNew(flow.x, flow.y, flow.color, flow.what, { x, y }); mark(); flow = null; } catch (e) { return fail(e); }
        return draw();
      }
      const kind = kindOfTool(tool);
      if (kind === 'hg') { flow = { kind: 'hg', x, y }; return draw(); }
      if (kind === 'tp') { flow = { kind: 'link', x, y, color: tool[0] }; return draw(); }
      paint(x, y); draw();
    }
    function chooseDir(d) {
      if (flow?.kind !== 'hg') return;
      if (!confirmBroken(flow.x, flow.y, 'HG')) return;
      try { model.placeHighGround(flow.x, flow.y, d); mark(); flow = null; msg = ''; } catch (e) { return fail(e); }
      draw();
    }
    function startNew(what) { if (flow?.kind !== 'link') return; flow = { kind: 'new', x: flow.x, y: flow.y, color: flow.color, what }; msg = ''; draw(); }
    function save() {
      const n = $('mmname').value.trim(); name = n;
      if (!n) { msg = 'Give the map a name.'; return drawStatus(); }
      const errs = validateMap(model.list()); if (errs.length) { msg = 'This map cannot be saved yet: ' + errs[0]; return drawStatus(); }
      const clash = allMapNames().find((m) => m.toLowerCase() === n.toLowerCase());
      if (clash && isBuiltinMap(clash)) { msg = `"${clash}" is a built-in map name: choose a different name.`; return drawStatus(); }
      if (clash && clash !== origin && !confirm(`A custom map named "${clash}" already exists. Overwrite it?`)) return;
      if (clash && clash !== n) deleteCustomMap(clash);
      if (!saveCustomMap(n, model.list())) { msg = 'Could not save (browser storage is blocked).'; return drawStatus(); }
      origin = n; dirty = false; msg = `Saved "${n}". It is now in the map list of the game modes.`;
      $('mmsub').textContent = `Editing your custom map "${n}".`; drawStatus();
    }
    const leave = () => { if (dirty && !confirm('Discard your unsaved changes?')) return; leaveTo(() => list()); };

    // ---------- events ----------
    const board = $('mmboard');
    let dragged = false; // a drag-paint just ended: swallow the click that follows the mouseup
    board.addEventListener('mousedown', (ev) => { if (ev.button !== 0) return; const el = ev.target.closest('[data-x]'); stroke = el && !flow ? { x: Number(el.dataset.x), y: Number(el.dataset.y), started: false, changed: false } : null; });
    board.addEventListener('mouseover', (ev) => { // drag-painting for plain tiles / erase (one undo step per stroke)
      if (!stroke || !(ev.buttons & 1)) return; const el = ev.target.closest('[data-x]'); if (!el) return;
      if (tool !== 'ERASE' && kindOfTool(tool) !== 'plain') return;
      const x = Number(el.dataset.x), y = Number(el.dataset.y);
      if (!stroke.started) { if (x === stroke.x && y === stroke.y) return; model.snapshot(); stroke.started = true; if (paint(stroke.x, stroke.y, { drag: true })) stroke.changed = true; }
      if (paint(x, y, { drag: true })) stroke.changed = true;
      drawBoard();
    });
    board.addEventListener('click', (ev) => {
      stroke = null; if (dragged) { dragged = false; return; }
      const el = ev.target.closest('[data-x]'); if (el) cellClick(Number(el.dataset.x), Number(el.dataset.y));
    });
    const up = () => {
      if (stroke?.started) { if (!stroke.changed) model.undoStack.pop(); dragged = true; setTimeout(() => { dragged = false; }, 0); draw(); }
      stroke = null;
    };
    document.addEventListener('mouseup', up);
    $('mmname').oninput = () => { name = $('mmname').value; mark(); };
    app.querySelector('[data-back]').onclick = leave;
    app.querySelector('.mmside').addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.tool) { tool = b.dataset.tool; flow = null; msg = ''; return draw(); }
      if (b.dataset.dir) return chooseDir(b.dataset.dir);
      if (b.dataset.newkind) return startNew(b.dataset.newkind);
      const a = b.dataset.act; if (!a) return;
      if (a === 'cancelflow') { flow = null; msg = ''; return draw(); }
      if (a === 'save') return save();
      if (a === 'undo') { if (model.undo()) { mark(); flow = null; msg = ''; draw(); } return; }
      if (a === 'clear') { if (!confirm('Remove every tile from the board? (you can undo this)')) return; model.clear(); mark(); flow = null; return draw(); }
      if (a === 'coords') { showCoords = !showCoords; return draw(); }
      if (a === 'delete') {
        if (!confirm(`Delete the map "${origin}"? This cannot be undone.`)) return;
        deleteCustomMap(origin); dirty = false; leaveTo(() => list(`Deleted "${origin}".`));
      }
    });
    const onKey = (ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && document.activeElement?.id !== 'mmname') { ev.preventDefault(); if (model.undo()) { mark(); flow = null; draw(); } } else if (ev.key === 'Escape' && flow) { flow = null; draw(); } };
    document.addEventListener('keydown', onKey);
    cleanup = () => { document.removeEventListener('mouseup', up); document.removeEventListener('keydown', onKey); };
    draw();
  }

  list();
}
