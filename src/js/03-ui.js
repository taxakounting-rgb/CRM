/* ==========================================================================
   03-ui.js — UI kit: logo, toast (with Undo), modal/confirm/prompt, form builder
   with validation + masks, data table (sort/paginate/select), filters, charts
   (pure SVG/HTML), tooltip, command palette, action delegation.
   ========================================================================== */
const UIState = { branch: '', tables: {}, views: {} };
const vs = (k, init = {}) => (UIState.views[k] = UIState.views[k] || Object.assign({}, init));

/* ---------- Icons (inline SVG paths) ---------- */
const ICONS = {
  dashboard: 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z', clients: 'M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z',
  vault: 'M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5zm0 10.9h7c-.5 4.1-3.3 7.8-7 8.9V12H5V6.3l7-3.1z', team: 'M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z',
  projects: 'M3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2zm12 10H9v-2h6zm2-4H9V9h8z', tasks: 'M19 3h-4.2C14.4 1.8 13.3 1 12 1s-2.4.8-2.8 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14-4-4 1.4-1.4 2.6 2.6 6.6-6.6L18 9z', services: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8zm2 16H8v-2h8zm0-4H8v-2h8zm-3-5V3.5L18.5 9z',
  compliance: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14zM7 11h5v5H7z', invoices: 'M21 7.3V5c0-1.1-.9-2-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-2.3A2 2 0 0 0 22 15V9a2 2 0 0 0-1-1.7zM20 9v6h-7V9zM5 19V5h14v2h-6c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h6v2z',
  documents: 'M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8z', reports: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2zm4 0h-2V7h2zm4 0h-2v-4h2z',
  settings: 'M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.3 7.3 0 0 0-1.7-1L15 3h-4l-.4 2.7c-.6.3-1.2.6-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z', audit: 'M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 2 4.9l-1.4 1.4A9 9 0 1 0 13 3zm-1 5v5l4.3 2.5.7-1.2-3.5-2.1V8z',
  bell: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.1-1.6-5.6-4.5-6.3V4a1.5 1.5 0 0 0-3 0v.7C7.6 5.4 6 7.9 6 11v5l-2 2v1h16v-1z', search: 'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z',
  menu: 'M3 18h18v-2H3zm0-5h18v-2H3zm0-7v2h18V6z', moon: 'M12 3a9 9 0 1 0 9 9c0-.5 0-1-.1-1.4A5.5 5.5 0 0 1 12.4 3.1L12 3z', sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 13h2v-2H2zm18 0h2v-2h-2zM11 2v2h2V2zm0 18v2h2v-2zM5.6 4.2 4.2 5.6l1.4 1.4L7 5.6zm12.8 12.8L17 18.4l1.4 1.4 1.4-1.4zM18.4 4.2 17 5.6 18.4 7l1.4-1.4zM5.6 17l-1.4 1.4 1.4 1.4L7 18.4z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z', palette: 'M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.42-4.03-8-9-8zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z', lock: 'M18 8h-1V6A5 5 0 0 0 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6a3 3 0 0 1 6 0v2H9zm3 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4z',
  eye: 'M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', copy: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11z',
  edit: 'M3 17.2V21h3.8L17.8 9.9l-3.7-3.7zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7z', trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z',
  phone: 'M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z', mail: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5z',
  wa: 'M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1a8 8 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.6.7.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4l-.6-.5zM12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2z',
  print: 'M19 8H5c-1.7 0-3 1.3-3 3v6h4v4h12v-4h4v-6c0-1.7-1.3-3-3-3zm-3 11H8v-5h8zm3-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-1-9H6v4h12z', download: 'M19 9h-4V3H9v6H5l7 7zM5 18v2h14v-2z', upload: 'M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z',
  logout: 'M10.1 15.6 11.5 17l5-5-5-5-1.4 1.4 2.6 2.6H3v2h9.7zM19 3H5a2 2 0 0 0-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z', more: 'M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  close: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z', timer: 'M15 1H9v2h6zm-4 13h2V8h-2zm8-6.6 1.4-1.4-1.4-1.4-1.4 1.4A9 9 0 1 0 21 13a9 9 0 0 0-2-5.6zM12 20a7 7 0 1 1 0-14 7 7 0 0 1 0 14z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z', key: 'M12.7 10A6 6 0 1 0 7 18a6 6 0 0 0 5.7-4H17v4h4v-4h2v-4zM7 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4z', check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  filter: 'M10 18h4v-2h-4zM3 6v2h18V6zm3 7h12v-2H6z', calendar: 'M9 11H7v2h2zm4 0h-2v2h2zm4 0h-2v2h2zm2-7h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14z', grid: 'M4 11h5V5H4zm0 7h5v-6H4zm6 0h5v-6h-5zm6 0h5v-6h-5zm-6-7h5V5h-5zm6-6v6h5V5z', list: 'M3 13h2v-2H3zm0 4h2v-2H3zm0-8h2V7H3zm4 4h14v-2H7zm0 4h14v-2H7zM7 7v2h14V7z', kanban: 'M4 4h4v16H4zm6 0h4v10h-4zm6 0h4v13h-4z'
};
const icon = (n, cls = '') => raw(`<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n] || ''}"/></svg>`);

/* ---------- Small components ---------- */
const TONES = { green: 'green', amber: 'amber', blue: 'blue', red: 'red', grey: 'grey', black: 'black' };
function badge(text, tone = 'grey') {
  if (tone && tone[0] === '#') return html`<span class="badge" style="--bc:${tone}">${text}</span>`;
  return html`<span class="badge b-${TONES[tone] || 'grey'}">${text}</span>`;
}
function listBadge(k, id) { const x = Lists.get(k, id); return x ? badge(x.name, x.color || 'grey') : html`<span class="muted">—</span>`; }
function statusTone(s) { return ({ Paid: 'green', Active: 'green', Filed: 'green', Completed: 'green', 'Partially Paid': 'amber', Pending: 'amber', Sent: 'blue', Draft: 'grey', Overdue: 'red', Cancelled: 'grey', Inactive: 'grey', locked: 'red', pending: 'amber', active: 'green', rejected: 'grey' })[s] || 'grey'; }
function avatar(name, photo, size = 32) {
  if (photo) return html`<img class="avatar" src="${photo}" alt="" style="width:${size}px;height:${size}px">`;
  const ini = String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return html`<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size / 2.6)}px">${ini}</span>`;
}
function emptyState(title, sub = '', btn = '') { return html`<div class="empty"><div class="empty-ic">${icon('documents')}</div><h3>${title}</h3><p class="muted">${sub}</p>${btn}</div>`; }
function skeleton(n = 5) { return raw('<div class="skel-wrap">' + Array.from({ length: n }, () => '<div class="skel"></div>').join('') + '</div>'); }
function pageHead(title, sub, actions = '') { return html`<div class="page-head"><div><h1>${title}</h1>${sub ? html`<p class="muted">${sub}</p>` : ''}</div><div class="page-actions">${actions}</div></div>`; }
function btn(label, act, opts = {}) {
  return html`<button type="button" class="btn ${opts.cls || ''}" data-act="${act}" ${opts.id !== undefined ? raw(`data-id="${esc(opts.id)}"`) : ''} ${opts.extra ? raw(opts.extra) : ''} title="${opts.title || ''}">${opts.icon ? icon(opts.icon) : ''}${label ? html`<span>${label}</span>` : ''}</button>`;
}
function tabsBar(key, tabs, active) { return html`<div class="tabs" role="tablist">${tabs.map(([id, label, count]) => html`<button type="button" role="tab" class="tab ${id === active ? 'on' : ''}" data-vs-set="${key}.tab" data-val="${id}" aria-selected="${id === active}">${label}${count !== undefined ? html` <span class="cnt">${count}</span>` : ''}</button>`)}</div>`; }
function progress(p, tone = '') { p = Math.max(0, Math.min(100, Math.round(p || 0))); return html`<div class="prog ${tone}" title="${p}%"><i style="width:${p}%"></i></div>`; }
function kv(rows) { return html`<dl class="kv">${rows.filter(Boolean).map(([k, v]) => html`<dt>${k}</dt><dd>${v === '' || v === undefined || v === null ? html`<span class="muted">—</span>` : v}</dd>`)}</dl>`; }

/* ---------- Toasts (with optional Undo) ---------- */
function toast(msg, type = 'ok', opts = {}) {
  const root = $('#toast-root'); if (!root) return;
  const el = document.createElement('div'); el.className = 'toast t-' + type; el.setAttribute('role', 'status');
  el.innerHTML = html`<span>${msg}</span>${opts.undo ? html`<button type="button" class="btn sm ghost-light" data-undo>Undo</button>` : ''}<button type="button" class="x" aria-label="Dismiss">×</button>`;
  root.appendChild(el);
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
  const t = setTimeout(kill, opts.timeout || (opts.undo ? 5000 : 3200));
  el.querySelector('.x').onclick = () => { clearTimeout(t); kill(); };
  if (opts.undo) el.querySelector('[data-undo]').onclick = () => { clearTimeout(t); kill(); opts.undo(); };
}

/* ---------- Modal stack ---------- */
const Modal = {
  stack: [],
  open({ title, body, foot = '', size = '', onMount, onClose, cls = '' }) {
    const wrap = document.createElement('div'); wrap.className = 'modal-wrap';
    wrap.innerHTML = html`<div class="modal ${size} ${cls}" role="dialog" aria-modal="true" aria-label="${title}"><div class="modal-h"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('close')}</button></div><div class="modal-b">${raw(String(body))}</div>${foot ? html`<div class="modal-f">${raw(String(foot))}</div>` : ''}</div>`;
    document.body.appendChild(wrap);
    const m = { el: wrap, close: () => this.close(m), onClose };
    this.stack.push(m);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) m.close(); });
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => m.close()));
    requestAnimationFrame(() => wrap.classList.add('in'));
    if (onMount) onMount(wrap, m);
    const f = wrap.querySelector('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea'); if (f) setTimeout(() => { if (!wrap.contains(document.activeElement)) f.focus(); }, 30);
    return m;
  },
  close(m) {
    const i = this.stack.indexOf(m); if (i < 0) return;
    this.stack.splice(i, 1); m.el.classList.remove('in'); setTimeout(() => m.el.remove(), 180);
    if (m.onClose) m.onClose();
  },
  closeTop() { const m = this.stack[this.stack.length - 1]; if (m) { m.close(); return true; } return false; },
  closeAll() { this.stack.slice().forEach((m) => m.close()); }
};
function confirmDlg(msg, opts = {}) {
  return new Promise((res) => {
    let done = false;
    const m = Modal.open({
      title: opts.title || 'Please confirm', size: 'sm', body: html`<p>${msg}</p>`,
      foot: html`<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn ${opts.danger ? 'danger' : 'primary'}" data-ok>${opts.ok || 'Confirm'}</button>`,
      onMount: (el, mm) => { el.querySelector('[data-ok]').onclick = () => { done = true; res(true); mm.close(); }; el.querySelector('[data-ok]').focus(); },
      onClose: () => { if (!done) res(false); }
    });
    return m;
  });
}
function promptDlg(title, label, opts = {}) {
  return new Promise((res) => {
    let done = false;
    Modal.open({
      title, size: 'sm',
      body: html`<form data-p><label class="fld"><span>${label}</span><input name="v" type="${opts.type || 'text'}" value="${opts.value || ''}" autocomplete="off" ${opts.inputmode ? raw(`inputmode="${opts.inputmode}"`) : ''} required></label>${opts.help ? html`<p class="help">${opts.help}</p>` : ''}<p class="err" data-err></p></form>`,
      foot: html`<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" data-ok>${opts.ok || 'OK'}</button>`,
      onMount: (el, m) => {
        bindPwToggle(el);
        const go = async () => {
          const v = el.querySelector('[name=v]').value;
          if (opts.validate) { const e = await opts.validate(v); if (e) { el.querySelector('[data-err]').textContent = e; return; } }
          done = true; res(v); m.close();
        };
        el.querySelector('[data-ok]').onclick = go;
        el.querySelector('form').onsubmit = (e) => { e.preventDefault(); go(); };
      },
      onClose: () => { if (!done) res(null); }
    });
  });
}

/* ---------- Validation & masks ---------- */
const Valid = {
  cnic: () => '',
  ntn: () => '',
  mobile: (v) => !v || /^\+?[\d\s().-]{5,22}$/.test(v) ? '' : 'Enter a valid phone number (digits, spaces, + - ( ) allowed)',
  email: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Enter a valid email address',
  url: (v) => !v || /^https?:\/\/\S+$/i.test(v) ? '' : 'URL must start with http:// or https://'
};
const Masks = { cnic: (v) => v, mobile: (v) => v, ntn: (v) => v };
document.addEventListener('input', (e) => { const m = e.target.dataset && e.target.dataset.mask; if (m && Masks[m]) { const p = e.target.value; const n = Masks[m](p); if (n !== p) e.target.value = n; } });

/* ---------- Form builder ----------
   fields: {name,label,type,list,options,required,full,placeholder,help,validate,min,max,step,rows,accept} */
function fieldHTML(f, v) {
  const req = f.required ? raw(' required') : '';
  const id = 'f_' + f.name;
  const lab = html`<span>${f.label}${f.required ? html`<b class="req">*</b>` : ''}</span>`;
  const help = f.help ? html`<small class="help">${f.help}</small>` : '';
  const err = html`<small class="err" data-err-for="${f.name}"></small>`;
  const cls = 'fld' + (f.full ? ' full' : '');
  if (f.type === 'section') return html`<h4 class="form-sec full">${f.label}</h4>`;
  if (f.type === 'html') return html`<div class="${cls}">${f.html}</div>`;
  if (f.type === 'hidden') return html`<input type="hidden" name="${f.name}" value="${v ?? ''}">`;
  if (f.type === 'checkbox') return html`<label class="chk ${f.full ? 'full' : ''}"><input type="checkbox" name="${f.name}" ${v ? raw('checked') : ''}> <span>${f.label}</span></label>`;
  if (f.type === 'textarea') return html`<label class="${cls}" for="${id}">${lab}<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" placeholder="${f.placeholder || ''}"${req}>${v ?? ''}</textarea>${help}${err}</label>`;
  if (f.type === 'select' || f.type === 'multi') {
    const opts = f.list ? Lists.all(f.list).map((x) => ({ value: x.id, label: x.name })) : (typeof f.options === 'function' ? f.options() : f.options || []);
    const sel = f.type === 'multi' ? new Set(v || []) : null;
    const canAdd = f.list && Auth.can('settings', 'edit');
    if (f.type === 'multi') return html`<div class="${cls}">${lab}<div class="multi" data-multi="${f.name}">${opts.map((o) => html`<label class="pill-chk"><input type="checkbox" value="${o.value}" ${sel.has(o.value) ? raw('checked') : ''}><span>${o.label}</span></label>`)}${opts.length ? '' : html`<span class="muted">No values. Add them in Settings › Master Lists.</span>`}</div>${help}${err}</div>`;
    return html`<label class="${cls}" for="${id}">${lab}<select id="${id}" name="${f.name}"${req} ${f.list ? raw(`data-list="${f.list}"`) : ''}><option value="">${f.placeholder || '— Select —'}</option>${opts.map((o) => html`<option value="${o.value}" ${String(o.value) === String(v ?? '') ? raw('selected') : ''}>${o.label}</option>`)}${canAdd ? html`<option value="__add__">+ Add new value…</option>` : ''}</select>${help}${err}</label>`;
  }
  if (f.type === 'image') return html`<div class="${cls}">${lab}<div class="img-pick"><img data-img-prev="${f.name}" src="${v || ''}" alt="" ${v ? '' : raw('hidden')}><input type="file" accept="image/*" data-img="${f.name}"><input type="hidden" name="${f.name}" value="${v || ''}"><button type="button" class="btn sm ghost" data-img-clear="${f.name}">Remove</button></div>${help}${err}</div>`;
  const map = { cnic: ['text', '', 'ID / passport / registration no.', ''], mobile: ['tel', '', '+1 555 000 0000', 'tel'], ntn: ['text', '', 'Tax / VAT / GST no.', ''], money: ['number', '', '0', 'decimal'] };
  const [type, mask, ph, im] = map[f.type] || [f.type || 'text', '', '', ''];
  return html`<label class="${cls}" for="${id}">${lab}<input id="${id}" name="${f.name}" type="${type}" value="${v ?? ''}" placeholder="${f.placeholder || ph}" ${mask ? raw(`data-mask="${mask}"`) : ''} ${im ? raw(`inputmode="${im}"`) : ''} ${f.min !== undefined ? raw(`min="${esc(f.min)}"`) : ''} ${f.max !== undefined ? raw(`max="${esc(f.max)}"`) : ''} ${f.step ? raw(`step="${esc(f.step)}"`) : (type === 'number' ? raw('step="any"') : '')} ${f.autocomplete ? raw(`autocomplete="${esc(f.autocomplete)}"`) : ''}${req}>${help}${err}</label>`;
}
function readForm(form, fields) {
  const out = {};
  fields.forEach((f) => {
    if (!f.name || f.type === 'section' || f.type === 'html') return;
    if (f.type === 'multi') { out[f.name] = $$(`[data-multi="${f.name}"] input:checked`, form).map((i) => i.value); return; }
    const el = form.elements[f.name]; if (!el) return;
    if (f.type === 'checkbox') out[f.name] = el.checked;
    else if (f.type === 'number' || f.type === 'money') out[f.name] = el.value === '' ? '' : Number(el.value);
    else out[f.name] = typeof el.value === 'string' ? el.value.trim() : el.value;
  });
  return out;
}
function validateForm(vals, fields) {
  const errs = {};
  fields.forEach((f) => {
    const v = vals[f.name];
    if (f.required && (v === '' || v === undefined || v === null || (Array.isArray(v) && !v.length))) { errs[f.name] = 'This field is required'; return; }
    const auto = Valid[f.type]; if (auto) { const e = auto(v); if (e) { errs[f.name] = e; return; } }
    if (f.type === 'email') { const e = Valid.email(v); if (e) { errs[f.name] = e; return; } }
    if ((f.type === 'number' || f.type === 'money') && v !== '' && f.min !== undefined && v < f.min) { errs[f.name] = `Must be at least ${f.min}`; return; }
    if (f.validate) { const e = f.validate(v, vals); if (e) errs[f.name] = e; }
  });
  return errs;
}
function showErrors(form, errs) {
  $$('[data-err-for]', form).forEach((e) => { e.textContent = ''; e.closest('.fld') && e.closest('.fld').classList.remove('bad'); });
  Object.entries(errs).forEach(([k, m]) => { const e = form.querySelector(`[data-err-for="${k}"]`); if (e) { e.textContent = m; e.closest('.fld') && e.closest('.fld').classList.add('bad'); } });
  const first = Object.keys(errs)[0]; if (first) { const el = form.elements[first] || form.querySelector(`[data-multi="${first}"]`); if (el && el.focus) el.focus(); }
}
/* Opens a modal form; onSubmit(values) may return an {field:msg} object to show errors. */
function formModal({ title, fields, values = {}, submit = 'Save', onSubmit, size = '', extraFoot = '', intro = '' }) {
  const body = html`${intro ? html`<div class="form-intro">${intro}</div>` : ''}<form class="grid-form" novalidate>${fields.map((f) => fieldHTML(f, values[f.name]))}<button type="submit" hidden></button></form>`;
  return Modal.open({
    title, size, body,
    foot: html`${extraFoot}<span class="grow"></span><button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" data-save>${submit}</button>`,
    onMount: (el, m) => {
      const form = el.querySelector('form');
      bindFormExtras(form);
      let busy = false;
      const go = async () => {
        if (busy) return;
        const vals = readForm(form, fields); const errs = validateForm(vals, fields);
        if (Object.keys(errs).length) { showErrors(form, errs); return; }
        busy = true; const b = el.querySelector('[data-save]'); b.disabled = true;
        try { const r = await onSubmit(vals, form); if (r && typeof r === 'object' && Object.keys(r).length) showErrors(form, r); else if (r !== false) m.close(); }
        catch (e) { console.warn(e); toast(e.message || 'Something went wrong', 'err'); }
        finally { busy = false; b.disabled = false; }
      };
      el.querySelector('[data-save]').onclick = go;
      form.onsubmit = (e) => { e.preventDefault(); go(); };
    }
  });
}
/* Show / hide toggle for every password input inside a form or dialog (vault passwords, PINs). */
function bindPwToggle(root) {
  $$('input[type=password]', root).forEach((inp) => {
    if (inp.dataset.pwt || inp.closest('.pw-wrap')) return;
    inp.dataset.pwt = '1';
    const wrap = document.createElement('div'); wrap.className = 'pw-wrap';
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'icon-btn'; b.setAttribute('aria-label', 'Show password'); b.title = 'Show / hide';
    b.innerHTML = String(icon('eye'));
    b.onclick = () => { const show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; b.classList.toggle('on', show); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); inp.focus(); };
    wrap.appendChild(b);
  });
}
/* Image pickers + "add new master list value" inside forms */
function bindFormExtras(form) {
  bindPwToggle(form);
  $$('[data-img]', form).forEach((inp) => inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return; if (f.size > 2 * 1048576) { toast('Image must be under 2 MB', 'warn'); return; }
    const url = await resizeImage(f, 320); const n = inp.dataset.img;
    form.elements[n].value = url; const p = form.querySelector(`[data-img-prev="${n}"]`); p.src = url; p.hidden = false;
  }));
  $$('[data-img-clear]', form).forEach((b) => b.addEventListener('click', () => { const n = b.dataset.imgClear; form.elements[n].value = ''; const p = form.querySelector(`[data-img-prev="${n}"]`); p.hidden = true; }));
  $$('select[data-list]', form).forEach((sel) => {
    let prev = sel.value;
    sel.addEventListener('change', async () => {
      if (sel.value !== '__add__') { prev = sel.value; return; }
      sel.value = prev;
      const k = sel.dataset.list; const name = await promptDlg('Add to ' + Lists.defs[k], 'New value');
      if (!name) return;
      const item = Settings.addListItem(k, name);
      if (item) { const o = document.createElement('option'); o.value = item.id; o.textContent = item.name; sel.insertBefore(o, sel.querySelector('option[value="__add__"]')); sel.value = item.id; prev = item.id; }
    });
  });
}
function resizeImage(file, max) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85)); }; img.onerror = rej; img.src = r.result; };
    r.onerror = rej; r.readAsDataURL(file);
  });
}

/* ---------- Data table (sort / paginate / select) ---------- */
function tstate(key) { return (UIState.tables[key] = UIState.tables[key] || { sort: null, dir: 1, page: 1, size: 25, sel: new Set() }); }
function sortRows(key, rows, cols) {
  const st = tstate(key); if (!st.sort) return rows;
  const c = cols.find((x) => x.key === st.sort); if (!c) return rows;
  const g = c.get || ((r) => r[c.key]);
  return rows.slice().sort((a, b) => { const x = g(a), y = g(b); if (x === y) return 0; if (x === undefined || x === '' || x === null) return 1; if (y === undefined || y === '' || y === null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * st.dir; });
}
function dataTable(key, { rows, cols, selectable = false, rowAttr, empty, rowCls }) {
  const st = tstate(key);
  if (!rows.length) return empty || emptyState('Nothing here yet', 'Try changing filters or add a new record.');
  const sorted = sortRows(key, rows, cols);
  const pages = Math.max(1, Math.ceil(sorted.length / st.size)); if (st.page > pages) st.page = pages;
  const slice = sorted.slice((st.page - 1) * st.size, st.page * st.size);
  const ids = new Set(rows.map((r) => r.id)); st.sel.forEach((id) => { if (!ids.has(id)) st.sel.delete(id); });
  const allSel = slice.length && slice.every((r) => st.sel.has(r.id));
  return html`<div class="tbl-wrap"><table class="tbl"><thead><tr>
    ${selectable ? html`<th class="cb"><input type="checkbox" aria-label="Select page" data-act="tbl:selall" data-key="${key}" ${allSel ? raw('checked') : ''}></th>` : ''}
    ${cols.map((c) => html`<th class="${c.cls || ''} ${c.sort === false ? '' : 'sortable'}" ${c.sort === false ? '' : raw(`data-act="tbl:sort" data-key="${esc(key)}" data-col="${esc(c.key)}"`)}>${c.label}${st.sort === c.key ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`)}
  </tr></thead><tbody>
    ${slice.map((r) => html`<tr class="${rowCls ? rowCls(r) : ''}" ${rowAttr ? raw(rowAttr(r)) : ''}>${selectable ? html`<td class="cb"><input type="checkbox" aria-label="Select row" data-act="tbl:sel" data-key="${key}" data-id="${r.id}" ${st.sel.has(r.id) ? raw('checked') : ''}></td>` : ''}${cols.map((c) => html`<td class="${c.cls || ''}" data-label="${c.label}">${c.render ? c.render(r) : (r[c.key] ?? '')}</td>`)}</tr>`)}
  </tbody></table></div>
  <div class="pager"><span class="muted">${(st.page - 1) * st.size + 1}–${Math.min(st.page * st.size, sorted.length)} of ${sorted.length}${st.sel.size ? html` · <b>${st.sel.size} selected</b>` : ''}</span><span class="grow"></span>
    <label class="muted sm">Rows <select data-act-change="tbl:size" data-key="${key}">${[25, 50, 100].map((n) => html`<option ${n === st.size ? raw('selected') : ''}>${n}</option>`)}</select></label>
    <button type="button" class="btn sm ghost" data-act="tbl:page" data-key="${key}" data-p="${st.page - 1}" ${st.page <= 1 ? raw('disabled') : ''}>‹ Prev</button><span class="sm">Page ${st.page} / ${pages}</span><button type="button" class="btn sm ghost" data-act="tbl:page" data-key="${key}" data-p="${st.page + 1}" ${st.page >= pages ? raw('disabled') : ''}>Next ›</button></div>`;
}

/* ---------- Filter bar helpers (state lives in UIState.views) ---------- */
function fInput(path, ph, type = 'search') { const [k, f] = path.split('.'); return html`<input class="inp" type="${type}" placeholder="${ph}" value="${vs(k)[f] || ''}" data-vs="${path}" id="vs_${k}_${f}" aria-label="${ph}">`; }
function fSelect(path, label, opts) { const [k, f] = path.split('.'); const v = vs(k)[f] || ''; return html`<select class="inp" data-vs="${path}" aria-label="${label}"><option value="">${label}</option>${opts.map((o) => html`<option value="${o.value}" ${String(o.value) === String(v) ? raw('selected') : ''}>${o.label}</option>`)}</select>`; }
function fDate(path, label) { const [k, f] = path.split('.'); return html`<label class="inp-date"><span>${label}</span><input class="inp" type="date" value="${vs(k)[f] || ''}" data-vs="${path}"></label>`; }
const listOpts = (k) => Lists.all(k).map((x) => ({ value: x.id, label: x.name }));
const memberOpts = () => Auth.team().map((m) => ({ value: m.id, label: m.name }));
const clientOpts = () => Auth.clients().slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }));
/* Saved filters per view */
function savedFiltersBar(k) {
  const mine = Store.s.savedFilters.filter((f) => f.view === k && f.userId === Auth.user.id);
  return html`<div class="saved-f">${mine.map((f) => html`<span class="chip"><button type="button" class="chip-b" data-act="sf:apply" data-id="${f.id}">${f.name}</button><button type="button" class="chip-x" data-act="sf:del" data-id="${f.id}" aria-label="Delete saved filter">×</button></span>`)}<button type="button" class="btn sm ghost" data-act="sf:save" data-id="${k}">${icon('filter')}<span>Save filter</span></button><button type="button" class="btn sm ghost" data-act="sf:clear" data-id="${k}">Clear</button></div>`;
}
function inRange(d, from, to) { if (!d) return !from && !to; const x = String(d).slice(0, 10); return (!from || x >= from) && (!to || x <= to); }
function textMatch(q, ...vals) { if (!q) return true; q = q.toLowerCase(); return vals.some((v) => v && String(v).toLowerCase().includes(q)); }

/* ---------- Charts (pure SVG / HTML) ---------- */
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const Charts = {
  /* Vertical bars (single series). data: [{label, value, tip}] */
  /* Bars are drawn at the real pixel width of their box (crisp, normal-size text at any width). */
  _reg: {}, _n: 0,
  bars(data, opts = {}) {
    if (!data.length || data.every((d) => !d.value)) return html`<div class="chart-empty muted">No data for this period</div>`;
    const id = 'ch' + (++this._n); this._reg[id] = { data, opts };
    const keys = Object.keys(this._reg); if (keys.length > 120) keys.slice(0, keys.length - 60).forEach((k) => { delete this._reg[k]; });
    return html`<div class="chart-box" data-chart="${id}" style="height:${opts.h || 230}px">${raw(this.barsSVG(data, 600, opts))}</div>`;
  },
  barsSVG(data, W, { h = 230, fmt = (v) => v, color = 'var(--brand)' } = {}) {
    W = Math.max(260, Math.round(W)); const H = h, pl = 58, pb = 30, pt = 12, pr = 10; const max = Math.max(...data.map((d) => d.value), 1);
    const nice = niceMax(max); const bw = (W - pl - pr) / data.length; const barW = Math.max(8, Math.min(46, bw * 0.55));
    const y = (v) => pt + (H - pt - pb) * (1 - v / nice);
    const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor((W - pl) / 58))));
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Bar chart">`;
    for (let i = 0; i <= 4; i++) { const v = nice * i / 4; s += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pl - 8}" y="${y(v) + 4}" class="ax" text-anchor="end">${esc(fmt(v))}</text>`; }
    data.forEach((d, i) => {
      const x = pl + bw * i + (bw - barW) / 2; const top = y(d.value); const hh = H - pb - top;
      s += `<g class="hit" data-tip="${esc(d.tip || d.label + ': ' + fmt(d.value))}"><rect x="${pl + bw * i}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent"/>`;
      if (hh > 0) s += `<path d="${roundTop(x, top, barW, hh, Math.min(4, barW / 2))}" fill="${color}"/>`;
      s += `</g>${i % every === 0 ? `<text x="${pl + bw * i + bw / 2}" y="${H - 9}" class="ax" text-anchor="middle">${esc(d.label)}</text>` : ''}`;
    });
    return s + '</svg>';
  },
  ro: null,
  hydrate(root = document) {
    if (!this.ro && window.ResizeObserver) this.ro = new ResizeObserver((ents) => ents.forEach((e) => this.drawBox(e.target)));
    $$('.chart-box[data-chart]', root).forEach((b) => { this.drawBox(b); if (this.ro) this.ro.observe(b); });
  },
  drawBox(b) { const r = this._reg[b.dataset.chart]; const w = b.clientWidth; if (!r || !w || b._w === w) return; b._w = w; b.innerHTML = this.barsSVG(r.data, w, r.opts); },
  /* Donut with legend. data: [{label, value, color}] */
  donut(data, { center = '', sub = '' } = {}) {
    const total = sum(data, (d) => d.value);
    if (!total) return html`<div class="chart-empty muted">No data yet</div>`;
    const R = 70, r = 46, cx = 90, cy = 90; let a0 = -Math.PI / 2; let s = `<svg viewBox="0 0 180 180" class="donut" role="img" aria-label="Donut chart">`;
    data.filter((d) => d.value > 0).forEach((d) => {
      const frac = d.value / total; const a1 = a0 + frac * Math.PI * 2 - (frac < 1 ? 0.03 : 0);
      const big = a1 - a0 > Math.PI ? 1 : 0; const p = (a, rad) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
      const path = frac >= 0.999 ? `M${cx - R},${cy}a${R},${R} 0 1,0 ${R * 2},0a${R},${R} 0 1,0 -${R * 2},0M${cx - r},${cy}a${r},${r} 0 1,1 ${r * 2},0a${r},${r} 0 1,1 -${r * 2},0` : `M${p(a0, R)}A${R},${R} 0 ${big} 1 ${p(a1, R)}L${p(a1, r)}A${r},${r} 0 ${big} 0 ${p(a0, r)}Z`;
      s += `<path d="${path}" fill="${d.color}" fill-rule="evenodd" class="hit" data-tip="${esc(d.label)}: ${d.value} (${Math.round(frac * 100)}%)"/>`;
      a0 += frac * Math.PI * 2;
    });
    s += `<text x="90" y="88" text-anchor="middle" class="d-c">${esc(center || total)}</text><text x="90" y="106" text-anchor="middle" class="ax">${esc(sub)}</text></svg>`;
    return html`<div class="donut-wrap">${raw(s)}<ul class="legend">${data.map((d) => html`<li><i style="background:${d.color}"></i><span>${d.label}</span><b>${d.value}</b></li>`)}</ul></div>`;
  },
  /* Horizontal bars (HTML). data: [{label, value, sub, color}] */
  hbars(data, { fmt = (v) => v } = {}) {
    if (!data.length) return html`<div class="chart-empty muted">No data yet</div>`;
    const max = Math.max(...data.map((d) => d.value), 1);
    return html`<div class="hbars">${data.map((d) => html`<div class="hb hit" data-tip="${d.label}: ${fmt(d.value)}${d.sub ? ' · ' + d.sub : ''}"><span class="hb-l">${d.label}</span><span class="hb-t"><i style="width:${Math.max(1, d.value / max * 100)}%;background:${d.color || 'var(--brand)'}"></i></span><b class="hb-v">${fmt(d.value)}</b></div>`)}</div>`;
  }
};
function niceMax(v) { const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
function roundTop(x, y, w, h, r) { r = Math.min(r, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }

/* Tooltip for any [data-tip] */
(function tooltip() {
  let tip;
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]'); if (!t) { if (tip) tip.hidden = true; return; }
    if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip); }
    tip.textContent = t.getAttribute('data-tip'); tip.hidden = false;
  });
  document.addEventListener('mousemove', (e) => { if (tip && !tip.hidden) { const w = tip.offsetWidth; tip.style.left = Math.min(window.innerWidth - w - 8, e.clientX + 12) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; } });
})();

/* ---------- Action delegation ----------
   data-act="name" (click), data-act-change="name" (change), data-vs="view.field" (filter state),
   data-vs-set="view.field" data-val (click sets value). */
const Actions = {};
const act = (name, fn) => { Actions[name] = fn; };
document.addEventListener('click', (e) => {
  const s = e.target.closest('[data-vs-set]');
  if (s) { const [k, f] = s.dataset.vsSet.split('.'); vs(k)[f] = s.dataset.val; if (UIState.tables[k]) UIState.tables[k].page = 1; Router.refresh(); return; }
  const a = e.target.closest('[data-act]'); if (!a || a.disabled) return;
  if (a.tagName === 'INPUT' && a.type === 'checkbox') { /* handled below */ }
  if (!License.guardAct(a.dataset.act)) { e.preventDefault(); return; }
  const fn = Actions[a.dataset.act]; if (fn) { if (a.tagName === 'A' && a.getAttribute('href') === '#') e.preventDefault(); fn(a, e); }
});
document.addEventListener('change', (e) => {
  const a = e.target.closest('[data-act-change]'); if (a) { if (!License.guardAct(a.dataset.actChange)) { Router.refresh(); return; } const fn = Actions[a.dataset.actChange]; if (fn) fn(a, e); return; }
  const v = e.target.closest('[data-vs]'); if (v && v.type !== 'search' && v.type !== 'text') setVs(v);
});
const debouncedRefresh = debounce(() => Router.refresh(), 220);
document.addEventListener('input', (e) => { const v = e.target.closest('[data-vs]'); if (v && (v.type === 'search' || v.type === 'text')) setVs(v, true); });
function setVs(el, deb) {
  const [k, f] = el.dataset.vs.split('.'); vs(k)[f] = el.type === 'checkbox' ? el.checked : el.value;
  Object.keys(UIState.tables).forEach((t) => { if (t.startsWith(k)) UIState.tables[t].page = 1; });
  if (deb) debouncedRefresh(); else Router.refresh();
}
act('tbl:sort', (a) => { const st = tstate(a.dataset.key); if (st.sort === a.dataset.col) st.dir = -st.dir; else { st.sort = a.dataset.col; st.dir = 1; } Router.refresh(); });
act('tbl:page', (a) => { tstate(a.dataset.key).page = Number(a.dataset.p); Router.refresh(); const m = $('#main'); if (m) m.scrollTop = 0; });
act('tbl:size', (a) => { const st = tstate(a.dataset.key); st.size = Number(a.value); st.page = 1; Router.refresh(); });
act('tbl:sel', (a) => { const st = tstate(a.dataset.key); if (a.checked) st.sel.add(a.dataset.id); else st.sel.delete(a.dataset.id); Router.refresh(); });
act('tbl:selall', (a) => { const st = tstate(a.dataset.key); $$(`[data-act="tbl:sel"][data-key="${a.dataset.key}"]`).forEach((c) => { if (a.checked) st.sel.add(c.dataset.id); else st.sel.delete(c.dataset.id); }); Router.refresh(); });
act('sf:save', async (a) => {
  const k = a.dataset.id; const name = await promptDlg('Save filter', 'Filter name'); if (!name) return;
  Store.commit((s) => s.savedFilters.push({ id: uid('sf'), view: k, userId: Auth.user.id, name, state: clone(vs(k)) }), { allowRO: true });
  toast('Filter saved');
});
act('sf:apply', (a) => { const f = Store.s.savedFilters.find((x) => x.id === a.dataset.id); if (f) { UIState.views[f.view] = clone(f.state); Router.refresh(); } });
act('sf:del', (a) => Store.commit((s) => { s.savedFilters = s.savedFilters.filter((x) => x.id !== a.dataset.id); }, { allowRO: true }));
act('sf:clear', (a) => { const k = a.dataset.id; const keep = { tab: vs(k).tab, view: vs(k).view }; UIState.views[k] = keep; Router.refresh(); });
act('nav', (a) => { location.hash = a.dataset.href; });

/* ---------- Download helpers ---------- */
function downloadFile(name, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function toCSV(headers, rows) { const q = (v) => { v = v === null || v === undefined ? '' : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }; return '﻿' + [headers.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\r\n'); }
function toXLS(title, headers, rows) { return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1"><caption>${esc(title)}</caption><tr>${headers.map((h) => `<th style="background:#111;color:#fff">${esc(h)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></body></html>`; }
function printHTML(title, bodyHTML) {
  const area = $('#print-area');
  const go = () => {
    const acc = Brand.printColor();
    area.style.setProperty('--print-accent', acc);
    area.style.setProperty('--print-on', (typeof Theme !== 'undefined' && Theme.onColor) ? Theme.onColor(acc) : '#ffffff');
    area.innerHTML = String(bodyHTML); document.title = title;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; document.title = Brand.appName(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('printing') && !window.matchMedia('print').matches) done(); }, 1500); }, 60);
  };
  const co = Brand.company();
  if (co.logo && co.logoColor === undefined) Brand.syncLogoColor().then(go, go); else go();
}
function printFooter() { const c = Store.s.settings.company || {}; return [c.name, c.phone, c.website].filter(Boolean).join('  |  '); }
function printHeader(title, sub = '') {
  const c = Store.s.settings.company || {};
  return html`<div class="p-head">${brandLogo('p-logo')}<div class="p-co"><b>${c.name || ''}</b><br>${[c.phone, c.email, c.website].filter(Boolean).join(' · ')}${c.address ? html`<br>${c.address}` : ''}${c.ntn ? html`<br>${c.taxLabel || 'Tax / Reg. No'}: ${c.ntn}` : ''}${c.strn ? html`<br>${c.strn2Label || 'Reg. No 2'}: ${c.strn}` : ''}</div></div><h2 class="p-title">${title}</h2>${sub ? html`<p class="p-sub">${sub}</p>` : ''}`;
}

/* ---------- Command palette (Ctrl+K) ---------- */
const Palette = {
  open() {
    if (!Auth.user || Auth.locked) return;
    if ($('.palette')) return;
    const m = Modal.open({
      title: 'Search', cls: 'palette', size: 'md',
      body: html`<input class="inp pal-q" placeholder="Search clients, ID, tax no., phone, tasks, invoices, documents…" autocomplete="off" aria-label="Search"><div class="pal-res" role="listbox"></div><p class="muted sm">↑ ↓ to move · Enter to open · Esc to close</p>`,
      onMount: (el) => {
        const q = el.querySelector('.pal-q'); const box = el.querySelector('.pal-res'); let items = []; let idx = 0;
        const draw = () => { box.innerHTML = items.length ? items.map((it, i) => html`<div class="pal-it ${i === idx ? 'on' : ''}" role="option" data-i="${i}"><span class="pal-k">${it.kind}</span><span><b>${it.title}</b><br><small class="muted">${it.sub || ''}</small></span></div>`).join('') : html`<p class="muted pad">No matches</p>`; };
        const run = debounce(() => { items = Palette.search(q.value); idx = 0; draw(); }, 120);
        q.addEventListener('input', run);
        q.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); draw(); e.preventDefault(); }
          if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
          if (e.key === 'Enter' && items[idx]) { Modal.closeTop(); location.hash = items[idx].href; }
        });
        box.addEventListener('click', (e) => { const it = e.target.closest('.pal-it'); if (it) { Modal.closeTop(); location.hash = items[+it.dataset.i].href; } });
        items = Palette.search(''); draw();
      }
    });
    return m;
  },
  search(q) {
    q = q.trim().toLowerCase(); const out = []; const digits = q.replace(/\D/g, '');
    const nav = Router.nav().filter((n) => !q || n.label.toLowerCase().includes(q)).map((n) => ({ kind: 'Go to', title: n.label, href: n.href }));
    if (!q) return nav.slice(0, 8);
    out.push(...nav.slice(0, 3));
    if (Auth.can('clients')) Auth.clients(true).filter((c) => textMatch(q, c.name, c.code, c.cnic, c.ntn, c.mobile, c.email, c.businessName) || (digits.length >= 4 && [c.cnic, c.ntn, c.mobile].some((v) => v && v.replace(/\D/g, '').includes(digits)))).slice(0, 8).forEach((c) => out.push({ kind: 'Client', title: `${c.code} · ${c.name}`, sub: [c.businessName, c.mobile, c.cnic].filter(Boolean).join(' · '), href: '#/clients/' + c.code }));
    if (Auth.can('tasks')) Auth.tasks().filter((t) => textMatch(q, t.code, t.title, (DB.client(t.clientId) || {}).name)).slice(0, 6).forEach((t) => out.push({ kind: 'Task', title: `${t.code} · ${t.title}`, sub: `${(DB.client(t.clientId) || {}).name || ''} · due ${fmtDate(t.due)}`, href: '#/tasks/' + t.code }));
    if (Auth.can('invoices')) Auth.byClient(Store.s.invoices).filter((i) => textMatch(q, i.number, (DB.client(i.clientId) || {}).name)).slice(0, 5).forEach((i) => out.push({ kind: 'Invoice', title: `${i.number} · ${(DB.client(i.clientId) || {}).name || ''}`, sub: money(DB.invTotal(i).total) + ' · ' + DB.invStatus(i), href: '#/invoices/' + i.number }));
    if (Auth.can('documents')) Auth.byClient(Store.s.documents).filter((d) => textMatch(q, d.code, d.name, Lists.name('docCategories', d.category), (DB.client(d.clientId) || {}).name)).slice(0, 5).forEach((d) => out.push({ kind: 'Document', title: `${d.code} · ${d.name}`, sub: Lists.name('docCategories', d.category), href: '#/documents?doc=' + d.id }));
    return out;
  }
};
