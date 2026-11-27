/* ==========================================================================
   02-auth.js — users, login/registration, roles & permission matrix (data),
   data scoping (assigned-only roles see their own clients), audit log, inactivity lock.
   ========================================================================== */
const MODULES = [
  ['dashboard', 'Dashboard'], ['clients', 'Clients'], ['vault', 'Credential Vault'], ['team', 'Team'], ['tasks', 'Tasks'],
  ['services', 'Services'], ['compliance', 'Deadlines'], ['invoices', 'Invoices & Payments'],
  ['projects', 'Projects'], ['documents', 'Documents'], ['reports', 'Reports'], ['settings', 'Settings'], ['users', 'Users & Roles'], ['audit', 'Audit Log']
];
const ACTIONS = ['view', 'create', 'edit', 'delete', 'export'];
const MOD_FEATURE = { vault: 'vault', audit: 'audit' };

const Auth = {
  user: null,
  lastActive: Date.now(),
  idleTimer: null,

  role(u = this.user) { return u && Store.s.roles.find((r) => r.id === u.roleId); },
  /* Permission check, driven entirely by the stored matrix. */
  can(mod, act = 'view') {
    const r = this.role(); if (!r) return false;
    if (MOD_FEATURE[mod] && !License.has(MOD_FEATURE[mod])) return false;
    if (License.readOnly() && act !== 'view' && act !== 'export') return false;
    if (r.all) return true;
    return !!(r.perms && r.perms[mod] && r.perms[mod][act]);
  },
  assignedOnly() { const r = this.role(); return !!(r && r.scope === 'assigned'); },
  memberId() { return this.user && this.user.memberId; },

  /* ----- Data scoping: applied by every list, search, report and dashboard ----- */
  _cache: null,
  scopeKey() { return [Store.s.savedAt, this.user && this.user.id, UIState.branch, Store.s.clients.length].join('|'); },
  clients(includeArchived = false) {
    let list = Store.s.clients;
    if (this.assignedOnly()) list = list.filter((c) => c.assignedTo && c.assignedTo === this.memberId());
    if (UIState.branch) list = list.filter((c) => c.branch === UIState.branch);
    if (!includeArchived) list = list.filter((c) => !c.archived);
    return list;
  },
  clientIds() {
    const k = this.scopeKey();
    if (!this._cache || this._cache.k !== k) this._cache = { k, ids: new Set(this.clients(true).map((c) => c.id)) };
    return this._cache.ids;
  },
  canSeeClient(id) { return this.clientIds().has(id); },
  tasks() {
    const ids = this.clientIds(); const me = this.memberId(); const all = !this.assignedOnly() && !UIState.branch;
    return Store.s.tasks.filter((t) => all || ids.has(t.clientId) || (this.assignedOnly() && t.assignedTo === me) || (!t.clientId && !UIState.branch));
  },
  byClient(arr) { const ids = this.clientIds(); const all = !this.assignedOnly() && !UIState.branch; return arr.filter((x) => (x.clientId ? ids.has(x.clientId) : all)); },
  team() { return UIState.branch ? Store.s.team.filter((m) => m.branch === UIState.branch) : Store.s.team; },

  /* ----- Audit log ----- */
  audit(action, module, summary, extra = {}) {
    const u = this.user;
    Store.s.audit.unshift({ id: uid('a'), at: new Date().toISOString(), userId: u ? u.id : '', user: u ? u.username : (extra.user || 'system'), action, module, summary, recordId: extra.recordId || '', old: extra.old ?? null, new: extra.new ?? null });
    if (Store.s.audit.length > 5000) Store.s.audit.length = 5000;
    Store.scheduleSave();
  },
  /* Field-level diff for edit audits. */
  diff(a = {}, b = {}) {
    const o = {}, n = {};
    Object.keys(Object.assign({}, a, b)).forEach((k) => { if (['photo', 'updatedAt', 'history', 'items'].includes(k)) return; if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { o[k] = a[k]; n[k] = b[k]; } });
    return { old: o, new: n };
  },

  /* ----- Password policy ----- */
  policy(pw) {
    const errs = [];
    if (!pw || pw.length < 8) errs.push('at least 8 characters');
    if (!/[A-Z]/.test(pw)) errs.push('an uppercase letter');
    if (!/[a-z]/.test(pw)) errs.push('a lowercase letter');
    if (!/\d/.test(pw)) errs.push('a number');
    return errs.length ? 'Password needs ' + errs.join(', ') + '.' : '';
  },
  strength(pw) {
    let s = 0; if (!pw) return 0;
    if (pw.length >= 8) s++; if (pw.length >= 12) s++; if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(4, s);
  },
  async setPassword(u, pw) { u.salt = Crypto.newSalt(); u.hash = await Crypto.hashPassword(pw, u.salt); u.pwChangedAt = new Date().toISOString(); },
  async checkPassword(u, pw) { return Crypto.same(await Crypto.hashPassword(pw, u.salt), u.hash); },
  findUser(name) { const n = String(name || '').trim().toLowerCase(); return Store.s.users.find((u) => u.username.toLowerCase() === n || (u.email && u.email.toLowerCase() === n)); },

  /* Step 1 of login. Returns {ok, user, next:'2fa'|'setup2fa'|'change'|'app'} or {error}. */
  async login(username, pw) {
    const u = this.findUser(username);
    if (!u) { await Crypto.hashPassword(pw || 'x', 'AAAAAAAAAAAAAAAAAAAAAA=='); this.audit('login_failed', 'auth', `Unknown user "${String(username).slice(0, 40)}"`, { user: String(username).slice(0, 40) }); return { error: 'Invalid username or password.' }; }
    if (u.lockUntil && u.lockUntil > Date.now()) { const m = Math.ceil((u.lockUntil - Date.now()) / 60000); return { error: `Too many failed attempts. Try again in ${m} minute${m > 1 ? 's' : ''}.` }; }
    const ok = await this.checkPassword(u, pw);
    if (!ok) {
      Store.commit(() => { u.failed = (u.failed || 0) + 1; if (u.failed >= 5) { u.lockUntil = Date.now() + 5 * 60000; u.failed = 0; } }, { silent: true });
      this.audit('login_failed', 'auth', `Wrong password for ${u.username}`, { user: u.username });
      return { error: u.lockUntil > Date.now() ? 'Too many failed attempts. Account locked for 5 minutes.' : 'Invalid username or password.' };
    }
    if (u.status === 'pending') return { error: 'Your account is waiting for administrator approval.' };
    if (u.status === 'rejected') return { error: 'Your registration was not approved. Please contact the office.' };
    if (u.status === 'locked') return { error: 'This account is locked. Please contact the administrator.' };
    Store.commit(() => { u.failed = 0; u.lockUntil = 0; }, { silent: true });
    if (u.totp && u.totp.enabled) return { ok: true, user: u, next: '2fa' };
    if (u.force2fa) return { ok: true, user: u, next: 'setup2fa' };
    if (u.mustChange) return { ok: true, user: u, next: 'change' };
    return { ok: true, user: u, next: 'app' };
  },
  start(u) {
    this.user = u;
    Store.commit(() => { u.lastLogin = new Date().toISOString(); }, { silent: true });
    this.audit('login', 'auth', `${u.username} signed in`);
    sessionStorage.setItem('crm_session', JSON.stringify({ uid: u.id, last: Date.now(), locked: false }));
    this.lastActive = Date.now();
    this.watchIdle();
  },
  resume() {
    try {
      const s = JSON.parse(sessionStorage.getItem('crm_session') || 'null'); if (!s) return null;
      const u = Store.s.users.find((x) => x.id === s.uid); if (!u || u.status !== 'active' || u.mustChange) return null;
      const idleMs = (Number(Store.s.settings.inactivityMin) || 15) * 60000;
      this.user = u; this.lastActive = s.last; this.watchIdle();
      return { user: u, locked: s.locked || Date.now() - s.last > idleMs };
    } catch (e) { return null; }
  },
  logout(reason = 'signed out') {
    if (this.user) this.audit('logout', 'auth', `${this.user.username} ${reason}`);
    Store.saveNow();
    this.user = null; Vault.forget(); sessionStorage.removeItem('crm_session'); clearInterval(this.idleTimer);
    Modal.closeAll(); location.hash = '#/dashboard'; App.showLogin();
  },
  touch() {
    this.lastActive = Date.now();
    const s = sessionStorage.getItem('crm_session'); if (s && this.user && !this.locked) { try { const o = JSON.parse(s); if (Date.now() - o.last > 5000) { o.last = this.lastActive; sessionStorage.setItem('crm_session', JSON.stringify(o)); } } catch (e) { /* ignore */ } }
  },
  locked: false,
  watchIdle() {
    clearInterval(this.idleTimer);
    this.idleTimer = setInterval(() => {
      if (!this.user || this.locked) return;
      const idleMs = (Number(Store.s.settings.inactivityMin) || 15) * 60000;
      if (Date.now() - this.lastActive > idleMs) this.lock('inactivity');
    }, 10000);
  },
  lock(why = 'manual') {
    if (!this.user) return;
    this.locked = true; Vault.forget(); Modal.closeAll();
    this.audit('lock', 'auth', `Screen locked (${why})`);
    try { const o = JSON.parse(sessionStorage.getItem('crm_session')); o.locked = true; sessionStorage.setItem('crm_session', JSON.stringify(o)); } catch (e) { /* ignore */ }
    App.showLock();
  },
  unlocked() {
    this.locked = false; this.lastActive = Date.now();
    try { const o = JSON.parse(sessionStorage.getItem('crm_session')); o.locked = false; o.last = Date.now(); sessionStorage.setItem('crm_session', JSON.stringify(o)); } catch (e) { /* ignore */ }
    this.audit('unlock', 'auth', 'Screen unlocked');
  },

  /* Self-registration: creates a pending account (or active if approval is off). */
  async register(f) {
    const st = Store.s.settings;
    if (License.readOnly()) return { error: 'Registration is closed because the subscription is not active.' };
    if (License.limit('users') && License.usage().users >= License.limit('users')) return { error: 'This company has reached the number of users allowed by its subscription. Please contact your administrator.' };
    if (!st.allowRegistration) return { error: 'Self-registration is turned off. Please ask the administrator to create your account.' };
    const username = String(f.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return { error: 'Username: 3-30 letters, numbers, dot, dash or underscore.', field: 'username' };
    if (this.findUser(username)) return { error: 'This username is already taken.', field: 'username' };
    if (f.email && Store.s.users.some((u) => u.email && u.email.toLowerCase() === f.email.toLowerCase())) return { error: 'An account with this email already exists.', field: 'email' };
    const pe = this.policy(f.password); if (pe) return { error: pe, field: 'password' };
    const regRole = Store.s.roles.find((r) => r.id === st.registrationRole) || Store.s.roles.find((r) => r.name === 'Viewer') || Store.s.roles[Store.s.roles.length - 1];
    const u = { id: uid('u'), username, name: String(f.name).trim(), email: String(f.email || '').trim(), mobile: f.mobile || '', roleId: regRole.id, status: st.requireApproval ? 'pending' : 'active', mustChange: false, createdAt: new Date().toISOString(), selfRegistered: true, branch: '' };
    await this.setPassword(u, f.password);
    Store.commit((s) => {
      s.users.push(u);
      s.users.filter((x) => x.status === 'active' && (this.role(x) || {}).all).forEach((a) => Notify.push(a.id, 'registration', 'New registration request', `${u.name} (${u.username}) registered${st.requireApproval ? ' and is waiting for approval' : ''}.`, '#/settings/users'));
    });
    this.audit('register', 'users', `New self-registration: ${u.username}`, { recordId: u.id, user: u.username });
    return { ok: true, pending: u.status === 'pending' };
  }
};

/* Inactivity tracking */
['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach((e) => window.addEventListener(e, () => Auth.touch(), { passive: true }));
