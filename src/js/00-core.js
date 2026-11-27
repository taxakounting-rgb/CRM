/* ==========================================================================
   00-core.js — utilities, safe HTML templating, Store (reactive state with
   localStorage + IndexedDB mirror), counters, master-list helpers, IDB blobs.
   ========================================================================== */
'use strict';

/* ---------- Small utilities ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = (o) => JSON.parse(JSON.stringify(o));
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n, w) => String(n).padStart(w, '0');
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});

/* Escape any value for HTML text/attribute context. */
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
}
/* Trusted HTML wrapper; html`` escapes every interpolation unless it is Raw. */
class Raw { constructor(s) { this.s = String(s); } toString() { return this.s; } }
const raw = (s) => new Raw(s);
function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += htmlVal(v) + strings[i + 1]; });
  return raw(out);
}
function htmlVal(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(htmlVal).join('');
  if (v === false || v === null || v === undefined) return '';
  return esc(v);
}

/* ---------- Dates & formatting ---------- */
const today = () => isoDate(new Date());
function isoDate(d) { d = new Date(d); return isNaN(d) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`; }
function addDays(d, n) { const x = new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')); x.setDate(x.getDate() + n); return isoDate(x); }
function addMonths(d, n) { const x = new Date(d + 'T00:00:00'); const day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + n); const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(day, last)); return isoDate(x); }
function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5); }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d) { if (!d) return '—'; const x = new Date(String(d).length === 10 ? d + 'T00:00:00' : d); return isNaN(x) ? '—' : `${pad(x.getDate(), 2)} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`; }
function fmtDateTime(d) { if (!d) return '—'; const x = new Date(d); return `${fmtDate(x)} ${pad(x.getHours(), 2)}:${pad(x.getMinutes(), 2)}`; }
function timeAgo(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'; if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return fmtDate(d);
}
const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const curInfo = () => { const c = (typeof Store !== 'undefined' && Store.s && Store.s.settings && Store.s.settings.currency) || {}; return { code: c.code || 'USD', symbol: c.symbol || '$' }; };
const curCode = () => curInfo().code;
const curSym = (s = curInfo().symbol) => (/^[A-Za-z]/.test(s) ? s + ' ' : s);
const money = (n) => { n = Math.round(Number(n) || 0); return (n < 0 ? '-' : '') + curSym() + numFmt.format(Math.abs(n)); };
const moneyShort = (n) => { n = Number(n) || 0; const a = Math.abs(n); const sg = n < 0 ? '-' : ''; const y = curSym(); return a >= 1e9 ? sg + y + (a / 1e9).toFixed(1) + 'B' : a >= 1e6 ? sg + y + (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? sg + y + (a / 1e3).toFixed(0) + 'K' : sg + y + Math.round(a); };
const fmtSize = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1024).toFixed(0) + ' KB';
const monthKey = (d) => String(d || '').slice(0, 7);
const monthLabel = (k) => { const [y, m] = k.split('-'); return MONTHS[+m - 1] + ' \u2019' + y.slice(2); };

/* ---------- Event bus ---------- */
const Bus = {
  h: {},
  on(e, f) { (this.h[e] = this.h[e] || []).push(f); return () => { this.h[e] = this.h[e].filter((x) => x !== f); }; },
  emit(e, d) { (this.h[e] || []).slice().forEach((f) => { try { f(d); } catch (err) { console.warn('Bus handler failed', e, err); } }); }
};

/* ---------- IndexedDB (documents blobs, snapshots, state mirror) ---------- */
const IDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('IndexedDB not available'));
      const r = indexedDB.open('universal_crm', 1);
      r.onupgradeneeded = () => { const d = r.result; ['blobs', 'snapshots', 'kv'].forEach((s) => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); }); };
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async tx(store, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode); const s = t.objectStore(store); let out;
      const r = fn(s); if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  get(store, k) { return this.tx(store, 'readonly', (s) => s.get(k)); },
  put(store, k, v) { return this.tx(store, 'readwrite', (s) => s.put(v, k)); },
  del(store, k) { return this.tx(store, 'readwrite', (s) => s.delete(k)); },
  keys(store) { return this.tx(store, 'readonly', (s) => s.getAllKeys()); },
  clear(store) { return this.tx(store, 'readwrite', (s) => s.clear()); }
};

/* ---------- Store: single source of truth ---------- */
const LS_KEY = 'universal_crm_state_v1';
const Store = {
  s: null,
  saveTimer: null,
  lastWarn: 0,
  blank() {
    return {
      v: 1, savedAt: 0, createdAt: new Date().toISOString(),
      counters: { client: {}, task: 0, emp: 0, inv: 0, doc: 0, pay: 0, exp: 0, rcpt: 0, prj: 0 },
      settings: {}, lists: {}, roles: [], users: [],
      clients: [], team: [], tasks: [], services: [], filings: {}, compliance: [],
      invoices: [], payments: [], accounts: [], expenses: [], projects: [], documents: [], creds: [], notes: [],
      timeline: [], followups: [], notifications: [], audit: [], savedFilters: [], reportTemplates: [], deleted: []
    };
  },
  async load() {
    let a = null, b = null;
    try { a = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { a = null; }
    try { b = await IDB.get('kv', 'state'); } catch (e) { b = null; }
    const pick = (a && b) ? ((b.savedAt || 0) > (a.savedAt || 0) ? b : a) : (a || b);
    this.s = Object.assign(this.blank(), pick || {});
    return !!pick;
  },
  /* Mutate state and notify. meta: {silent} */
  commit(fn, meta = {}) {
    if (!meta.silent && !meta.allowRO && typeof License !== 'undefined' && License.readOnly()) { License.blocked(); return undefined; }
    const r = fn(this.s);
    this.scheduleSave();
    if (!meta.silent) Bus.emit('change', meta);
    return r;
  },
  scheduleSave() { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.saveNow(), 120); },
  saveNow() {
    clearTimeout(this.saveTimer); this.saveTimer = null;
    this.s.savedAt = Date.now();
    const json = JSON.stringify(this.s);
    try { localStorage.setItem(LS_KEY, json); }
    catch (e) {
      if (Date.now() - this.lastWarn > 60000) { this.lastWarn = Date.now(); if (window.toast) toast('Browser storage is full. Data is kept in IndexedDB; please export a backup.', 'warn'); }
    }
    IDB.put('kv', 'state', JSON.parse(json)).catch(() => {});
    if (typeof Cloud !== 'undefined') Cloud.schedule();
  },
  /* Next auto-number from counters with configurable prefix. */
  next(kind) {
    const map = { task: ['task', 4], emp: ['emp', 3], inv: ['inv', 4], doc: ['doc', 4], pay: ['pay', 4], exp: ['exp', 4], rcpt: ['rcpt', 4], prj: ['prj', 4] };
    const [k, w] = map[kind];
    this.s.counters[k] = (this.s.counters[k] || 0) + 1;
    const pre = (this.s.settings.prefixes || {})[k] ?? '';
    return pre + pad(this.s.counters[k], w);
  },
  /* Client code: first letter of name + next number for that letter. Checks existing codes. */
  clientCode(name) {
    const L = (String(name).trim().match(/[A-Za-z]/) || ['X'])[0].toUpperCase();
    const used = this.s.clients.filter((c) => c.code && c.code[0] === L).map((c) => parseInt(c.code.slice(1), 10) || 0);
    const n = Math.max(this.s.counters.client[L] || 0, used.length ? Math.max(...used) : 0) + 1;
    this.s.counters.client[L] = n;
    return L + n;
  }
};

/* ---------- Master lists (records store item ids; names resolve dynamically) ---------- */
const Lists = {
  defs: {
    services: 'Services / Products', businessTypes: 'Client Types', designations: 'Designations', departments: 'Departments',
    taskStatuses: 'Task Statuses', priorities: 'Priorities', docCategories: 'Document Categories', portals: 'Portals / Accounts',
    branches: 'Branches', clientStatuses: 'Client Statuses', paymentMethods: 'Payment Methods', expenseCategories: 'Expense Categories', tags: 'Client Tags',
    serviceStatuses: 'Service Statuses', staffStatuses: 'Staff Statuses', authorities: 'Deadline Categories'
  },
  all(k) { return Store.s.lists[k] || []; },
  get(k, id) { return this.all(k).find((x) => x.id === id); },
  name(k, id) { const x = this.get(k, id); return x ? x.name : (id ? '—' : '—'); },
  idByName(k, name) { const n = String(name || '').trim().toLowerCase(); const x = this.all(k).find((i) => i.name.toLowerCase() === n); return x ? x.id : ''; },
  options(k, sel) { return this.all(k).map((x) => html`<option value="${x.id}" ${x.id === sel ? raw('selected') : ''}>${x.name}</option>`); },
  doneStatus() { return (this.all('taskStatuses').find((x) => x.done) || {}).id; },
  firstStatus() { return (this.all('taskStatuses')[0] || {}).id; },
  isDone(id) { const x = this.get('taskStatuses', id); return !!(x && x.done); }
};

/* ---------- Lookups ---------- */
const DB = {
  client: (id) => Store.s.clients.find((c) => c.id === id),
  clientByCode: (code) => Store.s.clients.find((c) => c.code === code),
  member: (id) => Store.s.team.find((m) => m.id === id),
  memberName: (id) => (Store.s.team.find((m) => m.id === id) || {}).name || 'Unassigned',
  user: (id) => Store.s.users.find((u) => u.id === id),
  task: (id) => Store.s.tasks.find((t) => t.id === id),
  invoice: (id) => Store.s.invoices.find((i) => i.id === id),
  invPaid: (inv) => sum(Store.s.payments.filter((p) => p.invoiceId === inv.id), (p) => p.amount),
  invTotal(inv) {
    const sub = sum(inv.items || [], (i) => (Number(i.qty) || 0) * (Number(i.rate) || 0));
    const disc = Number(inv.discount) || 0; const taxable = Math.max(0, sub - disc);
    const tax = taxable * (Number(inv.taxPct) || 0) / 100;
    return { sub, disc, tax, total: Math.round(taxable + tax) };
  },
  invStatus(inv) {
    if (inv.status === 'Draft' || inv.status === 'Cancelled') return inv.status;
    const t = this.invTotal(inv).total; const p = this.invPaid(inv);
    if (t > 0 && p >= t) return 'Paid';
    if (inv.due && inv.due < today()) return 'Overdue';
    if (p > 0) return 'Partially Paid';
    return 'Sent';
  },
  invBalance(inv) { return Math.max(0, this.invTotal(inv).total - this.invPaid(inv)); },
  isOverdue(t) { return t.due && t.due < today() && !Lists.isDone(t.status); }
};

/* Flush any pending (debounced) save when the tab is closed, refreshed or hidden. */
['pagehide', 'beforeunload'].forEach((e) => window.addEventListener(e, () => { if (Store.s && Store.saveTimer) Store.saveNow(); }));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && Store.s && Store.saveTimer) Store.saveNow(); });
