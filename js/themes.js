// Burrow themes: every built-in map is a district of the city (see data/lore_places.csv). A theme restyles the board
// (tile colours + textures), the UI (colour variables, fonts) and draws an animated backdrop behind the board.
// Custom maps use the generic "Downtown" look. Colours of the territory tiles keep their meaning (Blu = blue family,
// Red = red family, Middle = neutral): tests/themes.js checks that they stay easy to tell apart in every theme.
import { PLACES } from './data.js';

const rng = (seed) => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const grad = (id, stops, h = false) => `<linearGradient id="${id}" x1="0" y1="${h ? 0 : 1}" x2="${h ? 1 : 0}" y2="${h ? 0 : 0}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`;
const stars = (r, n, ymax, col = '#fff') => Array.from({ length: n }, () => `<circle cx="${(r() * 1600) | 0}" cy="${(r() * ymax) | 0}" r="${(0.6 + r() * 1.3).toFixed(1)}" fill="${col}" opacity="${(0.3 + r() * 0.6).toFixed(2)}"${r() < 0.3 ? ` class="twk" style="animation-delay:${(r() * 4).toFixed(1)}s"` : ''}/>`).join('');
const glowText = (u, x, y, txt, col, size = 44, font = 'Impact, "Arial Black", sans-serif') =>
  `<g class="neon" text-anchor="middle" font-family='${font}' font-size="${size}" letter-spacing="4"><text x="${x}" y="${y}" fill="${col}" filter="url(#${u}g)" opacity=".9">${txt}</text><text x="${x}" y="${y}" fill="#fff" fill-opacity=".92" stroke="${col}" stroke-width="1.5">${txt}</text></g>`;
const glowDef = (u) => `<filter id="${u}g" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>`;
// rows of buildings; `deco` = stepped art-deco towers with a spire, `win` = id of a window pattern drawn over them
function towers(r, { base = 900, x0 = -30, x1 = 1630, wMin = 50, wMax = 120, hMin = 100, hMax = 300, fill, deco = false, win = null, op = 1 }) {
  let o = `<g fill="${fill}" opacity="${op}">`; let x = x0;
  while (x < x1) {
    const w = wMin + r() * (wMax - wMin); const h = hMin + r() * (hMax - hMin);
    if (deco) {
      const t1 = h * 0.6, t2 = h * 0.26, t3 = h * 0.14; const c = x + w / 2;
      o += `<rect x="${x.toFixed(0)}" y="${(base - t1).toFixed(0)}" width="${w.toFixed(0)}" height="${t1.toFixed(0)}"/><rect x="${(c - w * 0.36).toFixed(0)}" y="${(base - t1 - t2).toFixed(0)}" width="${(w * 0.72).toFixed(0)}" height="${t2.toFixed(0)}"/><rect x="${(c - w * 0.2).toFixed(0)}" y="${(base - t1 - t2 - t3).toFixed(0)}" width="${(w * 0.4).toFixed(0)}" height="${t3.toFixed(0)}"/><rect x="${(c - 1.5).toFixed(0)}" y="${(base - h - 30).toFixed(0)}" width="3" height="${(30 + 0).toFixed(0)}"/>`;
      if (win) o += `<rect x="${x.toFixed(0)}" y="${(base - t1).toFixed(0)}" width="${w.toFixed(0)}" height="${t1.toFixed(0)}" fill="url(#${win})" opacity=".55"/><rect x="${(c - w * 0.36).toFixed(0)}" y="${(base - t1 - t2).toFixed(0)}" width="${(w * 0.72).toFixed(0)}" height="${t2.toFixed(0)}" fill="url(#${win})" opacity=".45"/>`;
    } else {
      o += `<rect x="${x.toFixed(0)}" y="${(base - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}"/>`;
      if (win) o += `<rect x="${x.toFixed(0)}" y="${(base - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="url(#${win})" opacity=".5"/>`;
    }
    x += w * (0.7 + r() * 0.3);
  }
  return o + '</g>';
}
const winPat = (id, col = '#ffd98a', w = 9, h = 11) => `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"><rect x="2" y="2" width="${w * 0.42}" height="${h * 0.45}" fill="${col}"/></pattern>`;
const beam = (u, x, tilt, col = '#fff6d0') => `<polygon class="beam" style="transform-origin:${x}px 900px;--tilt:${tilt}deg" points="${x},900 ${x - 90},60 ${x + 90},60" fill="url(#${u}b)"/>`;
const beamDef = (u, col = '#fff6d0') => `<linearGradient id="${u}b" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${col}" stop-opacity=".45"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient>`;
const smoke = (x, y, n, r, col = '#2a2523') => Array.from({ length: n }, (_, i) => `<circle class="smk" cx="${x + (r() * 24 - 12) | 0}" cy="${y}" r="${(14 + r() * 14).toFixed(0)}" fill="${col}" style="animation-delay:${(i * 1.4).toFixed(1)}s"/>`).join('');
function gear(cx, cy, R, teeth, fill) {
  const pts = []; for (let i = 0; i < teeth * 2; i++) { const a = Math.PI * i / teeth; const rr = i % 2 ? R * 0.84 : R; pts.push(`${(cx + rr * Math.cos(a)).toFixed(0)},${(cy + rr * Math.sin(a)).toFixed(0)}`); }
  return `<g class="spin" style="transform-origin:${cx}px ${cy}px"><polygon points="${pts.join(' ')}" fill="${fill}"/><circle cx="${cx}" cy="${cy}" r="${R * 0.45}" fill="#0000" stroke="#0007" stroke-width="${R * 0.12}"/></g>`;
}
const tree = (x, base, s, col, trunk = '#24150d') => `<rect x="${x - 4 * s}" y="${base - 60 * s}" width="${8 * s}" height="${60 * s}" fill="${trunk}"/><circle cx="${x}" cy="${base - 85 * s}" r="${44 * s}" fill="${col}"/><circle cx="${x - 30 * s}" cy="${base - 62 * s}" r="${30 * s}" fill="${col}"/><circle cx="${x + 30 * s}" cy="${base - 62 * s}" r="${30 * s}" fill="${col}"/>`;
const cactus = (x, base, s, col) => `<g fill="${col}"><rect x="${x - 7 * s}" y="${base - 110 * s}" width="${14 * s}" height="${110 * s}" rx="${7 * s}"/><path d="M${x - 7 * s} ${base - 60 * s} h${-22 * s} v${-34 * s} h${12 * s} v${22 * s} h${10 * s}Z M${x + 7 * s} ${base - 46 * s} h${22 * s} v${-40 * s} h${-12 * s} v${28 * s} h${-10 * s}Z"/></g>`;

// ------------------------------------------------------------------ backdrops (viewBox 0 0 1600 900)
const SCENERY = {
  pride: (u) => { const r = rng(7); return `<defs>${grad(u + 'a', [[0, '#a8603f'], [0.5, '#2a2342'], [1, '#080c18']])}${winPat(u + 'w')}${beamDef(u)}${glowDef(u)}</defs>
    <rect width="1600" height="900" fill="url(#${u}a)"/>${stars(r, 60, 420)}<circle cx="1300" cy="150" r="42" fill="#f4e7c6" opacity=".9"/><circle cx="1312" cy="140" r="38" fill="#2a2342" opacity=".25"/>
    ${towers(r, { base: 860, hMin: 150, hMax: 340, fill: '#1a2140', wMin: 60, wMax: 130, op: 0.9 })}
    ${towers(r, { base: 900, hMin: 220, hMax: 560, fill: '#0b101f', deco: true, win: u + 'w', wMin: 90, wMax: 160 })}
    <g fill="#080b16"><rect x="150" y="300" width="120" height="600"/><rect x="170" y="230" width="80" height="80"/><rect x="190" y="180" width="40" height="55"/><rect x="208" y="90" width="4" height="92"/></g><rect x="150" y="300" width="120" height="600" fill="url(#${u}w)" opacity=".5"/>
    ${beam(u, 140, 9)}${beam(u, 1470, -9)}
    <g fill="#05070d"><rect x="1330" y="620" width="270" height="280"/><rect x="0" y="700" width="210" height="200"/></g><rect x="1330" y="620" width="270" height="280" fill="url(#${u}w)" opacity=".5"/>
    ${glowText(u, 1465, 700, 'DINER', '#ff5f8f', 46)}${glowText(u, 105, 780, 'HOTEL', '#4fd8ff', 40)}`; },

  wrath: (u) => { const r = rng(11); return `<defs>${grad(u + 'a', [[0, '#e0652a'], [0.35, '#4a2417'], [1, '#0d0a09']])}${winPat(u + 'w', '#ff9d4a', 12, 14)}</defs>
    <rect width="1600" height="900" fill="url(#${u}a)"/><ellipse class="furn" cx="800" cy="900" rx="900" ry="260" fill="#ff7a22" opacity=".25"/>
    ${towers(r, { base: 880, hMin: 80, hMax: 200, fill: '#1c1411', wMin: 140, wMax: 260, win: u + 'w', op: 0.95 })}
    ${[[130, 420], [330, 330], [1330, 380], [1500, 450]].map(([x, h]) => `<rect x="${x - 26}" y="${880 - h}" width="52" height="${h}" fill="#150f0d"/><rect x="${x - 26}" y="${880 - h}" width="52" height="14" fill="#7a2c18"/><rect x="${x - 26}" y="${880 - h + 40}" width="52" height="10" fill="#7a2c18" opacity=".6"/>${smoke(x, 880 - h - 6, 4, r)}`).join('')}
    <g stroke="#150f0d" stroke-width="10" fill="none"><path d="M1000 880V250H1250M1250 250v90M1200 250l-50 -60"/><path d="M480 880V300H640"/></g>
    ${gear(110, 760, 130, 14, '#1b1411')}${gear(1520, 780, 150, 16, '#1b1411')}${gear(330, 840, 70, 10, '#251a15')}
    ${Array.from({ length: 22 }, () => `<circle class="spark" cx="${(r() * 1600) | 0}" cy="${(560 + r() * 330) | 0}" r="2" fill="#ffb347" style="animation-delay:${(r() * 3).toFixed(1)}s"/>`).join('')}`; },

  gluttony: (u) => { const r = rng(5); return `<defs>${grad(u + 'a', [[0, '#c5a85a'], [0.45, '#2f5a3c'], [1, '#0a1a12']])}</defs>
    <rect width="1600" height="900" fill="url(#${u}a)"/><circle cx="230" cy="170" r="56" fill="#ffe9a8" opacity=".85"/>
    <g fill="#12301c" opacity=".9">${Array.from({ length: 12 }, (_, i) => tree(40 + i * 140 + r() * 40, 760, 0.8 + r() * 0.5, '#1a4a2a')).join('')}</g>
    <g fill="#0a2012">${Array.from({ length: 9 }, (_, i) => tree(100 + i * 190 + r() * 50, 900, 1.2 + r() * 0.6, '#0e2d19')).join('')}</g>
    <path d="M0 150 Q400 230 800 150 T1600 150" stroke="#2a1a10" stroke-width="3" fill="none"/>
    ${Array.from({ length: 14 }, (_, i) => { const x = 60 + i * 115; const y = 150 + Math.sin(i * 0.55) * 36 + 30; return `<polygon points="${x},${y - 14} ${x + 26},${y - 14} ${x + 13},${y + 20}" fill="${['#e04a3f', '#f2c230', '#f4efe0', '#3aa6c4'][i % 4]}" opacity=".9"/>`; }).join('')}
    <g class="drift">${[[280, 330, '#e04a3f'], [1320, 280, '#f2c230'], [1450, 380, '#3aa6c4']].map(([x, y, c]) => `<ellipse cx="${x}" cy="${y}" rx="22" ry="28" fill="${c}"/><path d="M${x} ${y + 28} q-6 40 8 70" stroke="#fff8" fill="none"/>`).join('')}</g>
    <g><rect x="1180" y="690" width="170" height="90" fill="#7a3a22"/><path d="M1170 690 h190 l-14 -40 h-162Z" fill="#e8dcc0"/><path d="M1170 690 h38 l-6 -40 h-26Z M1246 690 h38 l-6 -40 h-26Z M1322 690 h38 l-6 -40 h-26Z" fill="#c03a2e"/><circle cx="1210" cy="790" r="18" fill="#222"/><circle cx="1320" cy="790" r="18" fill="#222"/></g>`; },

  greed: (u) => { const r = rng(3); const col = (x) => `<rect x="${x}" y="300" width="46" height="560" fill="#1b2a22"/>${[8, 18, 28, 38].map((d) => `<rect x="${x + d - 1}" y="300" width="2" height="560" fill="#d9b24a" opacity=".22"/>`).join('')}<rect x="${x - 8}" y="285" width="62" height="20" fill="#d9b24a" opacity=".5"/><rect x="${x - 8}" y="855" width="62" height="25" fill="#d9b24a" opacity=".35"/>`;
    return `<defs>${grad(u + 'a', [[0, '#1d3a2b'], [0.6, '#0e211a'], [1, '#050c09']])}${grad(u + 'c', [[0, '#d9b24a', 0.35], [1, '#d9b24a', 0]])}</defs>
    <rect width="1600" height="900" fill="url(#${u}a)"/>
    <g opacity=".9">${[40, 130, 220, 1300, 1390, 1480].map(col).join('')}<polygon points="20,300 330,300 175,230" fill="#1b2a22"/><polygon points="1280,300 1590,300 1435,230" fill="#1b2a22"/><polygon points="20,300 330,300 175,230" fill="none" stroke="#d9b24a" opacity=".4"/><polygon points="1280,300 1590,300 1435,230" fill="none" stroke="#d9b24a" opacity=".4"/></g>
    <g class="chart"><polyline points="${Array.from({ length: 30 }, (_, i) => `${i * 56},${520 - i * 6 + Math.round((r() - 0.5) * 120)}`).join(' ')}" fill="none" stroke="#6fd36f" stroke-width="3" opacity=".35"/><polyline points="${Array.from({ length: 30 }, (_, i) => `${i * 56},${640 + i * 3 + Math.round((r() - 0.5) * 100)}`).join(' ')}" fill="none" stroke="#e0584f" stroke-width="3" opacity=".3"/></g>
    <rect y="40" width="1600" height="44" fill="#050c09" opacity=".8"/><g class="ticker" font-family="Georgia, serif" font-size="20" font-weight="700">${Array.from({ length: 30 }, (_, i) => `<text x="${i * 175}" y="71" fill="${i % 3 === 1 ? '#e0584f' : '#6fd36f'}">${i % 3 === 1 ? '▼' : '▲'} ${['GLD', 'MOB', 'CRP', 'BNK', 'LUX', 'VLT'][i % 6]} ${(10 + ((i * 37) % 90)).toFixed(0)}.${(i * 13) % 100}</text>`).join('')}</g>
    ${Array.from({ length: 28 }, () => `<text class="coin" x="${(r() * 1600) | 0}" y="${(120 + r() * 700) | 0}" font-family="Georgia, serif" font-size="${(18 + r() * 26) | 0}" fill="#d9b24a" opacity=".16" style="animation-delay:${(r() * 6).toFixed(1)}s">$</text>`).join('')}`; },

  lust: (u) => { const r = rng(9); return `<defs>${grad(u + 'a', [[0, '#3a1250'], [0.55, '#1a0d33'], [1, '#08040f']])}${glowDef(u)}${grad(u + 's', [[0, '#fff', 0], [1, '#fff', 0.35]])}</defs>
    <rect width="1600" height="900" fill="url(#${u}a)"/>${stars(r, 40, 300, '#ffd0ff')}
    <g fill="#0c0618">${towers(r, { base: 900, hMin: 200, hMax: 480, fill: '#0c0618', wMin: 90, wMax: 170 })}</g>
    ${[[110, 260, 90, 120], [1390, 240, 110, 140], [170, 520, 70, 90], [1470, 560, 90, 110]].map(([x, y, w, h], i) => `<rect x="${x - w / 2}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#d9b24a" stroke-width="5"/><rect x="${x - w / 2 + 10}" y="${y + 10}" width="${w - 20}" height="${h - 20}" fill="${['#ff5fb0', '#4fd8ff', '#ffd23f', '#8a5cff'][i]}" opacity=".35"/>`).join('')}
    <g class="neon" fill="none" stroke-width="7" stroke-linecap="round"><circle cx="1320" cy="640" r="70" stroke="#ff5fb0" filter="url(#${u}g)"/><circle cx="1320" cy="640" r="70" stroke="#ffd0ee" stroke-width="2.5"/><path d="M180 660 q40 -90 90 0 t90 0" stroke="#4fd8ff" filter="url(#${u}g)"/><path d="M180 660 q40 -90 90 0 t90 0" stroke="#e0fbff" stroke-width="2.5"/></g>
    ${glowText(u, 1230, 250, 'GALLERY', '#ff5fb0', 50, 'Futura, "Century Gothic", sans-serif')}
    <polygon class="beam" style="transform-origin:420px 0px;--tilt:7deg" points="420,0 300,900 540,900" fill="url(#${u}s)" opacity=".5"/><polygon class="beam" style="transform-origin:1180px 0px;--tilt:-7deg" points="1180,0 1060,900 1300,900" fill="url(#${u}s)" opacity=".5"/>
    ${Array.from({ length: 36 }, (_, i) => `<circle class="twk" cx="${60 + i * 43}" cy="40" r="6" fill="${i % 2 ? '#ffd23f' : '#fff3c8'}" style="animation-delay:${((i % 6) * 0.3).toFixed(1)}s"/>`).join('')}
    ${Array.from({ length: 9 }, () => `<circle cx="${(r() * 1600) | 0}" cy="${(r() * 900) | 0}" r="${(10 + r() * 26) | 0}" fill="${['#ff5fb0', '#4fd8ff', '#8a5cff'][(r() * 3) | 0]}" opacity=".12"/>`).join('')}`; },

  envy: (u) => { const r = rng(13); const wave = (y, col, op, dur) => `<g class="drift" style="animation-duration:${dur}s"><path d="M-200 ${y} ${Array.from({ length: 22 }, (_, i) => `q50 -26 100 0 t100 0`).slice(0, 11).join(' ')} V900 H-200Z" fill="${col}" opacity="${op}"/></g>`;
    return `<defs>${grad(u + 'a', [[0, '#17463f'], [0.5, '#0a2328'], [1, '#040d12']])}${beamDef(u, '#c8fff0')}${grad(u + 'f', [[0, '#9fe8d0', 0.22], [1, '#9fe8d0', 0]])}</defs>
    <rect width="1600" height="900" fill="url(#${u}a)"/>${stars(r, 45, 380, '#d8fff0')}<circle cx="1180" cy="170" r="52" fill="#e9fff6" opacity=".85"/>
    <rect y="470" width="1600" height="430" fill="#071a20"/>
    <g fill="#0a1d22"><path d="M90 470 l22 -150 h40 l22 150Z"/><rect x="104" y="270" width="56" height="52"/><polygon points="98,270 166,270 132,226"/></g><circle cx="132" cy="296" r="9" fill="#e9fff6"/><polygon class="beam" style="transform-origin:132px 296px;--tilt:14deg;transform:rotate(-14deg)" points="132,296 700,246 700,346" fill="url(#${u}b)"/>
    <g stroke="#08171c" stroke-width="12" fill="none"><path d="M1350 470V250H1530M1530 250v70M1440 250V470"/></g>
    ${wave(540, '#0d3038', 0.8, 60)}${wave(620, '#0b2830', 0.85, 46)}${wave(720, '#08202a', 0.9, 38)}${wave(820, '#061821', 0.95, 30)}
    <g class="drift" style="animation-duration:70s"><ellipse cx="500" cy="500" rx="420" ry="46" fill="url(#${u}f)"/><ellipse cx="1150" cy="590" rx="460" ry="50" fill="url(#${u}f)"/></g>
    ${[300, 760, 1120].map((x, i) => `<g class="bob" style="animation-delay:${i}s"><circle cx="${x}" cy="${680 + i * 20}" r="12" fill="#c63a48"/><rect x="${x - 3}" y="${650 + i * 20}" width="6" height="22" fill="#e9fff6" opacity=".7"/></g>`).join('')}`; },

  sloth: (u) => { const r = rng(17); return `<defs>${grad(u + 'a', [[0, '#f0b062'], [0.35, '#c4603a'], [0.7, '#4a2640'], [1, '#1a1020']])}</defs>
    <rect width="1600" height="900" fill="url(#${u}a)"/><circle cx="800" cy="520" r="140" fill="#ffd89a" opacity=".85"/><circle cx="800" cy="520" r="190" fill="#ffd89a" opacity=".16"/>
    <polygon points="0,640 0,470 110,470 150,420 260,420 300,480 380,480 440,640" fill="#5a2c3a"/><polygon points="1000,640 1070,470 1150,440 1220,440 1260,500 1360,500 1420,430 1500,430 1560,520 1600,520 1600,640" fill="#4a2434"/>
    <polygon points="0,700 0,600 140,590 200,640 320,610 460,690 700,650 1000,690 1250,630 1420,680 1600,620 1600,700" fill="#38202e"/>
    <rect y="700" width="1600" height="200" fill="#22121c"/>
    ${cactus(150, 790, 1.5, '#0f0a10')}${cactus(1450, 800, 1.8, '#0f0a10')}${cactus(1280, 780, 1, '#150d14')}${cactus(330, 770, 0.9, '#150d14')}
    <g fill="#0f0a10"><rect x="610" y="640" width="380" height="150"/><polygon points="600,640 1000,640 960,590 640,590"/><rect x="760" y="560" width="80" height="30"/><rect x="700" y="700" width="30" height="90" fill="#1d1018"/><rect x="870" y="700" width="30" height="90" fill="#1d1018"/><rect x="740" y="700" width="120" height="10"/></g>
    <g stroke="#0f0a10" stroke-width="6" fill="none"><path d="M520 790V470M470 490h100M360 790V500M310 520h100"/><path d="M310 524Q415 560 520 494M-10 520Q150 570 310 524" stroke-width="2"/></g>
    <g class="roll"><circle cx="0" cy="838" r="26" fill="none" stroke="#7a5a3a" stroke-width="3"/><path d="M-20 828 l40 20 M-22 846 l44 -16 M0 812 v52" stroke="#7a5a3a" stroke-width="2"/></g>
    ${[[420, 180], [980, 130], [1180, 230]].map(([x, y], i) => `<path class="drift" style="animation-delay:${i * 3}s" d="M${x} ${y} q16 -22 32 0 q16 -22 32 0" stroke="#0f0a10" stroke-width="4" fill="none"/>`).join('')}`; },
};

// ------------------------------------------------------------------ tile textures (drawn over the base colour, per tile code)
export const PATTERNS = {
  pave: '<pattern id="tx-pave" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 9H18M9 0V9M0 18V9" stroke="#000" stroke-opacity=".16" fill="none"/></pattern>',
  win: '<pattern id="tx-win" width="10" height="12" patternUnits="userSpaceOnUse"><rect x="2" y="3" width="4" height="5" fill="#ffd98a" fill-opacity=".5"/></pattern>',
  plate: '<pattern id="tx-plate" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect x="2" y="5" width="8" height="2.4" rx="1.2" fill="#fff" fill-opacity=".14"/><rect x="5" y="9" width="2.4" height="5" rx="1.2" fill="#000" fill-opacity=".16"/></pattern>',
  rivet: '<pattern id="tx-rivet" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.8" fill="#fff" fill-opacity=".26"/><circle cx="14" cy="14" r="1.8" fill="#fff" fill-opacity=".26"/><path d="M0 10H20" stroke="#000" stroke-opacity=".25"/></pattern>',
  grass: '<pattern id="tx-grass" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M2 12L3 6M6 12L7 3M10 12L9 7" stroke="#0a3a10" stroke-opacity=".38" stroke-width="1.3" fill="none"/><path d="M4 12L5 8" stroke="#c8f0a0" stroke-opacity=".22" stroke-width="1.2"/></pattern>',
  hedge: '<pattern id="tx-hedge" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="3.2" fill="#0a2a14" fill-opacity=".5"/><circle cx="8" cy="8" r="2.6" fill="#5aa045" fill-opacity=".3"/></pattern>',
  marble: '<pattern id="tx-marble" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M0 30C10 8 22 40 40 12" stroke="#fff" stroke-opacity=".2" fill="none"/><path d="M6 40C18 22 28 34 40 26" stroke="#d9b24a" stroke-opacity=".35" fill="none"/></pattern>',
  check: '<pattern id="tx-check" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#fff" fill-opacity=".1"/><rect x="7" y="7" width="7" height="7" fill="#fff" fill-opacity=".1"/></pattern>',
  frame: '<pattern id="tx-frame" width="18" height="22" patternUnits="userSpaceOnUse"><rect x="2.5" y="2.5" width="13" height="17" fill="none" stroke="#d9b24a" stroke-opacity=".55" stroke-width="1.5"/></pattern>',
  dots: '<pattern id="tx-dots" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.8" fill="#fff" fill-opacity=".18"/></pattern>',
  piling: '<pattern id="tx-piling" width="11" height="11" patternUnits="userSpaceOnUse"><path d="M5.5 0V11" stroke="#000" stroke-opacity=".38" stroke-width="2"/><path d="M0 0V11" stroke="#fff" stroke-opacity=".1"/></pattern>',
  plank: '<pattern id="tx-plank" width="30" height="10" patternUnits="userSpaceOnUse"><path d="M0 9.5H30M15 0V9.5" stroke="#000" stroke-opacity=".3" fill="none"/></pattern>',
  wave: '<pattern id="tx-wave" width="20" height="10" patternUnits="userSpaceOnUse"><path d="M0 5Q5 0 10 5T20 5" stroke="#fff" stroke-opacity=".2" fill="none"/></pattern>',
  strata: '<pattern id="tx-strata" width="24" height="12" patternUnits="userSpaceOnUse"><path d="M0 6Q6 2 12 6T24 6" stroke="#000" stroke-opacity=".3" fill="none"/></pattern>',
  sand: '<pattern id="tx-sand" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r=".9" fill="#fff" fill-opacity=".26"/><circle cx="11" cy="9" r=".9" fill="#000" fill-opacity=".2"/><circle cx="7" cy="14" r=".8" fill="#fff" fill-opacity=".2"/></pattern>',
  crack: '<pattern id="tx-crack" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M2 4L12 10L9 20M12 10L26 8M9 20L22 26" stroke="#000" stroke-opacity=".3" fill="none"/></pattern>',
};
export const patternDefs = () => Object.values(PATTERNS).join('');

// ------------------------------------------------------------------ themes
const BASE_TILES = { BS: '#2a62c4', RS: '#c42a40', BN: '#4f86b8', RN: '#a9604a', MM: '#55705f', WW: '#343a48', WB: '#8a5a2b', SB: '#9aa3a8', BT: '#b88ad0', RT: '#b88ad0', BA: '#a99ad8', RA: '#d89aa8', CP: '#c06bff', MP: '#f2bd2c', HG: '#6d7a5a', HT: '#7ccfb0' };
const FLOORS = ['BN', 'RN', 'MM', 'BS', 'RS'];
const floors = (id, extra = {}) => ({ ...Object.fromEntries(FLOORS.map((c) => [c, id])), ...extra });
const mk = (o) => ({ ...o, tiles: { ...BASE_TILES, ...o.tiles } });

export const THEMES = {
  pride: mk({ key: 'pride', sin: 'Pride', tag: 'Midtown', stroke: '#1b1f29', tex: floors('pave', { WW: 'win' }),
    vars: { '--bg': '#0b0f17', '--panel': '#141a25', '--panel2': '#1d2635', '--line': '#3b4457', '--gold': '#e2b64d', '--inset': '#0a0e15', '--board': '#0b1019', '--blu-bg': '#14294a', '--red-bg': '#431a28', '--head': '"Copperplate", "Copperplate Gothic Light", "Didot", Georgia, serif' } }),
  wrath: mk({ key: 'wrath', sin: 'Wrath', tag: 'The Foundry Row', stroke: '#14110f', tex: floors('plate', { WW: 'rivet' }),
    tiles: { BS: '#2a5ec0', RS: '#c0302a', BN: '#4a7f93', RN: '#a8562f', MM: '#66705a', WW: '#2b2d31', HG: '#6b6b52' },
    vars: { '--bg': '#12100e', '--panel': '#1d1916', '--panel2': '#2a241f', '--line': '#4d4238', '--gold': '#e8832f', '--inset': '#0e0c0a', '--board': '#120f0d', '--blu-bg': '#16293f', '--red-bg': '#44201a', '--head': 'Impact, "Haettenschweiler", "Arial Narrow Bold", "Franklin Gothic Demi Cond", sans-serif' } }),
  gluttony: mk({ key: 'gluttony', sin: 'Gluttony', tag: 'The Great Lawn', stroke: '#0c1d12', tex: floors(null, { BN: 'grass', RN: 'grass', MM: 'grass', WW: 'hedge' }),
    tiles: { BS: '#2a62b8', RS: '#c0343a', BN: '#3f8da8', RN: '#b8664a', MM: '#5aa045', WW: '#1f4a2b', HT: '#9be08a', HG: '#7a8a50' },
    vars: { '--bg': '#0c1812', '--panel': '#13241a', '--panel2': '#1c3526', '--line': '#3c5e46', '--gold': '#e8b84a', '--inset': '#0a130e', '--board': '#0b1810', '--blu-bg': '#143049', '--red-bg': '#472420', '--head': 'Rockwell, "Rockwell Nova", "Roboto Slab", Georgia, serif' } }),
  greed: mk({ key: 'greed', sin: 'Greed', tag: 'The Exchange', stroke: '#0a120e', tex: floors('check', { WW: 'marble' }),
    tiles: { BS: '#22509e', RS: '#a8262f', BN: '#3f78a6', RN: '#b8695e', MM: '#566b4c', WW: '#2c2b30', MP: '#f4c542', HG: '#6a7a52' },
    vars: { '--bg': '#0a1410', '--panel': '#10201a', '--panel2': '#182e25', '--line': '#4a5a3c', '--gold': '#d9b24a', '--inset': '#08110d', '--board': '#09120e', '--blu-bg': '#112c46', '--red-bg': '#41201f', '--head': '"Didot", "Bodoni MT", "Bodoni 72", "Playfair Display", Georgia, serif' } }),
  lust: mk({ key: 'lust', sin: 'Lust', tag: 'The Gallery Quarter', stroke: '#140a20', tex: floors('dots', { WW: 'frame' }),
    tiles: { BS: '#1b2f9c', RS: '#d0243f', BN: '#6482e6', RN: '#d14a86', MM: '#3a8a8f', WW: '#2a1c3a', BT: '#d29af0', RT: '#d29af0', BA: '#c3a8f0', RA: '#f0a8c8', CP: '#e07aff', HG: '#6a5a8a' },
    vars: { '--bg': '#120a1c', '--panel': '#1d1230', '--panel2': '#2a1b45', '--line': '#5b3d86', '--gold': '#ff5fb0', '--inset': '#0e0716', '--board': '#0f0818', '--blu-bg': '#1a2552', '--red-bg': '#4a1a3a', '--head': '"Avant Garde", "ITC Avant Garde Gothic", "Century Gothic", Futura, sans-serif' } }),
  envy: mk({ key: 'envy', sin: 'Envy', tag: 'The Harbor', stroke: '#06141a', tex: floors('wave', { MM: 'plank', WW: 'piling' }),
    tiles: { BS: '#1f5fb8', RS: '#c63a48', BN: '#2f8f9d', RN: '#c46a58', MM: '#8d7a55', WW: '#33434d', HT: '#8ae0c0', HG: '#6a8a70' },
    vars: { '--bg': '#08161c', '--panel': '#0f2630', '--panel2': '#17373f', '--line': '#2f6670', '--gold': '#5ccfb4', '--inset': '#07121a', '--board': '#08151b', '--blu-bg': '#12314f', '--red-bg': '#45232b', '--head': 'Optima, Candara, "Gill Sans", "Trebuchet MS", sans-serif' } }),
  sloth: mk({ key: 'sloth', sin: 'Sloth', tag: 'The Dust Flats', stroke: '#1a110b', tex: floors('sand', { BS: 'crack', RS: 'crack', WW: 'strata' }),
    tiles: { BS: '#2c5cb0', RS: '#b8322f', BN: '#6a8da3', RN: '#b8684a', MM: '#c4a468', WW: '#5a4230', HG: '#8a6a48', HT: '#8fd0a8' },
    vars: { '--bg': '#1a120d', '--panel': '#261a12', '--panel2': '#36261a', '--line': '#6a4f36', '--gold': '#e5a24a', '--inset': '#150e09', '--board': '#1a110b', '--blu-bg': '#1c2c46', '--red-bg': '#48201a', '--head': 'Rockwell, "Rockwell Nova", "American Typewriter", Georgia, serif' } }),
};
// custom maps (and anything unknown): a generic downtown street
export const DEFAULT_THEME = { ...THEMES.pride, key: 'pride', sin: '', tag: 'Downtown', custom: true };
export const TILE_FILL = THEMES.pride.tiles; // default tile colours (map maker palette)
const norm = (n) => String(n || '').replace(/ Map$/, '').trim().toLowerCase();
export const burrowKeyOf = (mapName) => (THEMES[norm(mapName)] ? norm(mapName) : null); // 'Pride Map' -> 'pride'; custom maps -> null
export const themeFor = (mapName) => THEMES[norm(mapName)] || DEFAULT_THEME;
export const burrowInfo = (theme) => { const p = PLACES[theme.sin] || {}; return { title: p.name || theme.sin || 'Downtown', district: theme.tag, desc: p.desc || 'Anywhere in the city' }; };

let uid = 0;
// full-bleed animated backdrop for a theme (an <svg>, cropped to fill its box)
export const sceneryHtml = (theme) => `<svg class="scn" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${SCENERY[theme.key]('s' + uid++)}</svg>`;
export const themeStyle = (theme) => Object.entries(theme.vars).map(([k, v]) => `${k}:${v}`).join(';');
export function plaqueHtml(theme) {
  const b = burrowInfo(theme);
  return `<div class="plaque"><small>${theme.custom ? 'Custom map' : 'Burrow of'}</small><b>${b.title.toUpperCase()}</b><span>${b.district}</span><em>${b.desc}</em></div>`;
}
export const burrowKeys = () => Object.keys(THEMES);
