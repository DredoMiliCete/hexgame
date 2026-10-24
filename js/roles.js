// Role / Subrole chips: coloured by roles.csv, with a hover tooltip showing the role description.
import { ROLES, SUBROLES } from './data.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const roleColor = (name) => ROLES[name]?.color || SUBROLES[name]?.color || '#8a8f98';

const chip = (kind, name) => (name ? `<span class="rchip ${kind}" data-${kind}="${esc(name)}" style="--rc:${roleColor(name)}">${esc(name)}</span>` : '');
// <span class="rchips">Enforcer Protector</span> (chips for a hero definition)
export const roleChips = (def) => (def?.class ? `<span class="rchips">${chip('role', def.class)}${chip('subrole', def.subrole)}</span>` : '');

function tipHtml(el) {
  const sub = el.dataset.subrole; const name = sub || el.dataset.role; const d = sub ? SUBROLES[sub] : ROLES[name];
  if (!d) return '';
  const meta = sub ? `<div class="rtmeta">Subrole of <b style="--rc:${roleColor(d.parent)}">${esc(d.parent)}</b>${d.like ? ` · resembles <b style="--rc:${roleColor(d.like)}">${esc(d.like)}</b>` : ''}</div>` : '<div class="rtmeta">Role</div>';
  return `<div class="rthead" style="--rc:${d.color}">${esc(name)}</div>${meta}<p>${esc(d.desc)}</p>`;
}

let tip = null;
function place(el) {
  const r = el.getBoundingClientRect(); const w = tip.offsetWidth, h = tip.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  let x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), Math.max(8, vw - w - 8));
  let y = r.bottom + 8; if (y + h > vh - 8) y = Math.max(8, r.top - h - 8);
  tip.style.left = `${Math.round(x)}px`; tip.style.top = `${Math.round(y)}px`;
}
const show = (el) => { const html = tipHtml(el); if (!html) return; tip.innerHTML = html; tip.hidden = false; place(el); };
const hide = () => { if (tip) tip.hidden = true; };

// Call once: one floating tooltip for every .rchip on any screen (the screens re-render their HTML freely).
export function initRoleTips() {
  if (tip) return;
  tip = document.createElement('div'); tip.id = 'roletip'; tip.className = 'roletip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
  document.body.appendChild(tip);
  document.addEventListener('mouseover', (e) => { const el = e.target.closest?.('.rchip'); if (el) show(el); else hide(); });
  document.addEventListener('focusin', (e) => { const el = e.target.closest?.('.rchip'); if (el) show(el); });
  document.addEventListener('click', hide);
  window.addEventListener('scroll', hide, true);
}
