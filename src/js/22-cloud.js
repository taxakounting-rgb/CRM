/* ==========================================================================
   22-cloud.js — Cloud storage (multi-company).
   Each company has its own account (company username + password) and private data
   in the cloud database via /api/sync. This browser keeps a local cache for speed.
   Employees then sign in inside the company with their own username/password.
   The password never leaves the browser: only a salted PBKDF2 hash is sent.
   ========================================================================== */
const Cloud = {
  API: '/api/sync',
  avail: false, status: 'off', timer: null, busy: false, lastSync: 0, adopting: false,
  st: (() => { try { return JSON.parse(localStorage.getItem('crm_cloud') || '{}'); } catch (e) { return {}; } })(),
  persist() { try { localStorage.setItem('crm_cloud', JSON.stringify(this.st)); } catch (e) { /* ignore */ } },
  async call(body) {
    const r = await fetch(this.API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch (e) { /* non-JSON */ }
    if (!r.ok) { const e = new Error(j.error || 'Server error ' + r.status); e.status = r.status; e.data = j; throw e; }
    return j;
  },
  async init() {
    if (location.protocol === 'file:') { this.avail = false; return; }
    try { const r = await fetch(this.API, { cache: 'no-store' }); const j = await r.json(); this.avail = !!(j && j.configured); } catch (e) { this.avail = false; }
    if (!this.avail) return;
    this.status = this.st.token ? 'ok' : 'off';
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.poll(); });
    setInterval(() => this.poll(), 60000);
    if (this.st.token) { // refresh from the cloud when the page opens (works offline too: falls back to the local copy)
      try { const m = await this.call({ action: 'meta', token: this.st.token }); if (m.ws !== this.st.ws || m.ver !== this.st.ver) await this.reconcile(m, m.ws !== this.st.ws); this.status = 'ok'; this.lastSync = Date.now(); }
      catch (e) { if (e.status === 401) { this.st.token = ''; this.persist(); this.status = 'off'; } else this.status = 'offline'; }
    }
  },
  linked() { return this.avail && !!this.st.token; },
  company() { return this.st.co || ''; },
  async idFree(id) { return (await this.call({ action: 'available', id })).free; },
  async wipeLocal() {
    clearTimeout(this.timer); this.timer = null;
    sessionStorage.removeItem('crm_session'); localStorage.removeItem(LS_KEY);
    try { await IDB.clear('kv'); await IDB.clear('blobs'); await IDB.clear('snapshots'); } catch (e) { /* ignore */ }
  },
  /* NEW COMPANY: create the company account in the cloud with an empty workspace. */
  async signupCompany(id, name, pw) {
    const salt = Crypto.newSalt(); const hash = await Crypto.hashPassword(pw, salt);
    await this.wipeLocal();
    Store.s = Store.blank(); await Seed.ensure(); Store.s.settings.company.name = name;
    const j = await this.call({ action: 'signup', id, salt, hash, state: Store.s });
    this.st = { token: j.token, ver: j.ver, ws: j.ws, co: id }; this.persist();
    this.adopting = true; Store.saveNow(); this.adopting = false; this.status = 'ok'; this.lastSync = Date.now();
  },
  /* EXISTING COMPANY: company username + password, then download its data. */
  async signIn(id, pw) {
    const { salt } = await this.call({ action: 'challenge', id });
    const hash = await Crypto.hashPassword(pw, salt);
    const j = await this.call({ action: 'login', id, hash });
    const same = this.st.ws === j.ws;
    if (!same) await this.wipeLocal();
    this.st = { token: j.token, ver: same ? this.st.ver : 0, ws: j.ws, co: id }; this.persist();
    await this.reconcile(j, !same);
  },
  /* Take the cloud copy when it is newer (or belongs to a different company). */
  async reconcile(remote, force) {
    if (!force && Store.s.users.length && this.st.ver === remote.ver) { this.status = 'ok'; return false; }
    const j = await this.call({ action: 'pull', token: this.st.token });
    if (!j.state) return false;
    if (!force && Store.s.users.length) { try { await Backup.snapshot('before-cloud'); } catch (e) { /* ignore */ } }
    const lic = Store.s.license; Store.s = Object.assign(Store.blank(), j.state); if (lic && !Store.s.license) Store.s.license = lic;
    this.st.ver = j.ver; this.st.ws = j.ws; this.persist();
    this.adopting = true; Store.saveNow(); this.adopting = false;
    await Seed.ensure(); setFavicon(); Theme.apply(); document.title = Brand.appName(); this.status = 'ok'; this.lastSync = Date.now();
    return true;
  },
  async leave() { // switch company: forget this company on this computer
    await this.wipeLocal(); this.st = {}; try { localStorage.removeItem('crm_cloud'); } catch (e) { /* ignore */ }
    Store.s = Store.blank(); await Seed.ensure(); Auth.user = null; setFavicon(); document.title = Brand.appName(); App.showGate();
  },
  schedule() { if (this.adopting || !this.linked()) return; clearTimeout(this.timer); this.timer = setTimeout(() => { this.timer = null; this.push(); }, 2000); },
  async push() {
    if (!this.linked() || this.busy || !Store.s || !Store.s.users.length) return;
    this.busy = true; this.status = 'syncing';
    try {
      const j = await this.call({ action: 'push', token: this.st.token, ver: this.st.ver, state: Store.s });
      this.st.ver = j.ver; this.persist(); this.status = 'ok'; this.lastSync = Date.now();
    } catch (e) {
      if (e.status === 409) await this.conflict(e.data);
      else if (e.status === 401) { this.st.token = ''; this.persist(); this.status = 'expired'; toast('Company session expired. Please sign in to your company again.', 'warn', { timeout: 8000 }); }
      else if (e.status === 413) { this.status = 'error'; toast(e.message, 'warn'); }
      else this.status = 'offline';
    }
    this.busy = false; this.refreshChip();
  },
  /* Someone else saved first: keep a snapshot of this copy, then take the newer cloud copy. */
  async conflict(remote) {
    try {
      const me = Auth.user ? Auth.user.username : '';
      await this.reconcile({ ver: remote.ver, savedAt: remote.savedAt }, false);
      if (me) { Auth.user = Store.s.users.find((u) => u.username === me && u.status === 'active') || null; if (!Auth.user) return Auth.logout('account changed'); }
      toast('Newer data from another computer was loaded. Your previous copy is kept in Settings › Cloud & Data › Snapshots.', 'warn', { timeout: 8000 });
      Bus.emit('change', {});
    } catch (e) { this.status = 'offline'; }
  },
  async poll() {
    if (!this.linked() || this.busy || !Auth.user || Store.saveTimer || this.timer) return;
    try {
      const m = await this.call({ action: 'meta', token: this.st.token });
      if (m.ver !== this.st.ver) {
        const me = Auth.user.username;
        if (await this.reconcile(m, false)) { Auth.user = Store.s.users.find((u) => u.username === me && u.status === 'active') || null; if (!Auth.user) return Auth.logout('account changed on another computer'); Bus.emit('change', {}); toast('Updated with the latest data from the cloud.'); }
      }
      this.status = 'ok'; this.lastSync = Date.now();
    } catch (e) { this.status = e.status === 401 ? 'expired' : 'offline'; }
    this.refreshChip();
  },
  /* Document files: kept in the cloud, cached in this browser. */
  async putBlob(vid, blob) { if (!this.linked()) return; await this.call({ action: 'blob_put', token: this.st.token, vid, type: blob.type || '', data: Crypto.b64(await blob.arrayBuffer()) }); },
  async getBlob(vid) { if (!this.linked()) return null; const j = await this.call({ action: 'blob_get', token: this.st.token, vid }); return j && j.data ? new Blob([Crypto.unb64(j.data)], { type: j.type || '' }) : null; },
  delBlob(vid) { if (!this.linked()) return Promise.resolve(); return this.call({ action: 'blob_del', token: this.st.token, vid }); },
  maxFileMB() { return this.avail ? 3 : 10; },
  refreshChip() { const c = $('[data-cloud-chip]'); if (c) c.outerHTML = String(this.chip()); },
  chip() {
    const m = { ok: ['Saved in cloud', 'green'], syncing: ['Saving…', 'amber'], offline: ['Offline: will save later', 'amber'], expired: ['Sign in to company again', 'red'], error: ['Cloud error', 'red'], off: ['Not connected', 'grey'] }[this.status] || ['Not connected', 'grey'];
    return html`<span data-cloud-chip>${badge(m[0], m[1])}</span>`;
  },
  card() {
    return html`<div class="card"><div class="card-h"><h3>Cloud storage</h3>${this.chip()}</div><p>All data of <b>${this.company() || 'your company'}</b> is stored safely in the cloud. Open the app from your link on any computer, sign in with the company username and password, then with your own employee login.</p>${this.lastSync ? html`<p class="sm muted">Last synced ${timeAgo(this.lastSync)}</p>` : ''}<div class="row-acts" style="justify-content:flex-start">${btn('Sync now', 'cloud:now', { cls: 'sm primary' })}</div></div>`;
  }
};
act('cloud:now', async () => { Store.saveNow(); await Cloud.push(); toast(Cloud.status === 'ok' ? 'Saved to the cloud' : 'Could not sync right now', Cloud.status === 'ok' ? 'ok' : 'warn'); Router.refresh(); });
act('cloud:leave', async () => { if (await confirmDlg('Sign out of this company on this computer? Your data stays safe in the cloud.', { ok: 'Sign out of company' })) Cloud.leave(); });
