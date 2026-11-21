/* ==========================================================================
   20-datafile.js — Permanent data safety.
   1. Asks the browser for persistent storage (not cleared automatically).
   2. Auto-save to a real file on this computer (File System Access API,
      Chrome / Edge): every change is written to e.g. Documents\<YourCompany>_Data.json.
      If browser data is ever lost, "Restore data from file" brings it back.
   Document files (scans/PDFs) stay in the browser; use Export full backup for those.
   ========================================================================== */
const DataFile = {
  handle: null, status: 'off', lastWrite: 0, timer: null, persisted: false,
  supported() { return typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function'; },
  async init() {
    try { if (navigator.storage && navigator.storage.persist) this.persisted = await navigator.storage.persist(); } catch (e) { /* ignore */ }
    if (!this.supported()) { this.status = 'unsupported'; return; }
    try { this.handle = await IDB.get('kv', 'dataFileHandle'); } catch (e) { this.handle = null; }
    if (!this.handle) { this.status = 'off'; return; }
    try { this.status = (await this.handle.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'needs-permission'; } catch (e) { this.status = 'needs-permission'; }
    this.lastWrite = Number(localStorage.getItem('crm_datafile_last') || 0);
  },
  fileTypes: [{ description: 'CRM data file', accept: { 'application/json': ['.json'] } }],
  async choose() {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: (Brand.name() || 'CRM').replace(/[^\w]+/g, '_') + '_Data.json', types: this.fileTypes });
      this.handle = h; try { await IDB.put('kv', 'dataFileHandle', h); } catch (e) { /* handle could not be stored; auto-save still works this session */ } this.status = 'ok';
      await this.write(); Auth.audit('edit', 'settings', `Auto-save to file turned on (${h.name})`);
      toast(`Auto-save is on. Every change is saved to ${h.name}.`); this.refresh();
    } catch (e) { if (e.name !== 'AbortError') toast('Could not set up the data file: ' + e.message, 'err'); }
  },
  async reconnect() {
    if (!this.handle) return this.choose();
    try { this.status = (await this.handle.requestPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'needs-permission'; } catch (e) { this.status = 'needs-permission'; }
    if (this.status === 'ok') { await this.write(); toast('Auto-save reconnected'); }
    this.refresh();
  },
  async stop() {
    if (!(await confirmDlg('Stop auto-saving to the data file? The file itself is not deleted.', { ok: 'Stop auto-save' }))) return;
    this.handle = null; this.status = 'off'; await IDB.del('kv', 'dataFileHandle'); Auth.audit('edit', 'settings', 'Auto-save to file turned off'); this.refresh();
  },
  schedule() { if (this.status !== 'ok' || !this.handle) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.write(), 1200); },
  async write() {
    if (!this.handle || !Store.s) return false;
    try {
      const w = await this.handle.createWritable();
      await w.write(JSON.stringify({ app: Brand.appName(), format: 1, autosave: true, exportedAt: new Date().toISOString(), state: Store.s }));
      await w.close(); this.lastWrite = Date.now(); localStorage.setItem('crm_datafile_last', String(this.lastWrite)); this.status = 'ok'; return true;
    } catch (e) { this.status = e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'needs-permission' : 'error'; this.refresh(); return false; }
  },
  /* Load data from an auto-save file or a backup file (works from the sign-in screen too). */
  async restoreFromFile() {
    if (!this.supported()) { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = () => { if (i.files[0]) Backup.importJSON(i.files[0]); }; i.click(); return; }
    try {
      const [h] = await window.showOpenFilePicker({ types: this.fileTypes });
      const file = await h.getFile();
      await Backup.importJSON(file);
      try { if ((await h.requestPermission({ mode: 'readwrite' })) === 'granted') { this.handle = h; try { await IDB.put('kv', 'dataFileHandle', h); } catch (e) { /* ignore */ } this.status = 'ok'; } } catch (e) { /* keep read-only */ }
    } catch (e) { if (e.name !== 'AbortError') toast('Could not open the file: ' + e.message, 'err'); }
  },
  refresh() { if (Auth.user && $('#main')) Router.refresh(); },
  canManage() { return Auth.user && (Auth.can('settings', 'edit') || (Auth.role() || {}).all); },
  banner() {
    if (!Auth.user || !this.canManage()) return '';
    if (this.status === 'needs-permission') return html`<div class="lic-banner warn">${icon('documents')} Auto-save to <b>${this.handle ? this.handle.name : 'your data file'}</b> is paused. Click to allow saving again. <button type="button" class="btn sm" data-act="df:reconnect">Reconnect auto-save</button></div>`;
    if (this.status === 'error') return html`<div class="lic-banner err">${icon('documents')} Could not write the auto-save file. <button type="button" class="btn sm" data-act="df:choose">Choose the file again</button></div>`;
    if (this.status === 'off' && localStorage.getItem('crm_df_hint') !== 'no' && Router.cur.name === 'dashboard') return html`<div class="lic-banner info">${icon('check')} <span><b>Keep your data safe:</b> turn on auto-save to a file on this computer. Every change is saved there too, and you can restore everything from it at any time.</span> <button type="button" class="btn sm primary" data-act="df:choose">Turn on auto-save</button> <button type="button" class="btn sm ghost" data-act="df:hide">Not now</button></div>`;
    return '';
  },
  card(ro) {
    const st = { ok: ['On', 'green'], off: ['Off', 'grey'], 'needs-permission': ['Paused: needs permission', 'amber'], error: ['Error', 'red'], unsupported: ['Not supported in this browser', 'grey'] }[this.status];
    return html`<div class="card df-card"><div class="card-h"><h3>Auto-save to a file on this computer</h3>${badge(st[0], st[1])}</div>
      <p>Saves all your data (clients, tasks, invoices, users, settings…) to a file such as <code>Documents\\YourCompany_Data.json</code> after every change. If the browser's data is ever cleared, use <b>Restore data from file</b> to get everything back.</p>
      ${this.handle ? html`<p class="sm">File: <b>${this.handle.name}</b>${this.lastWrite ? html` · last saved ${timeAgo(this.lastWrite)}` : ''}</p>` : ''}
      ${this.status === 'unsupported' ? html`<p class="muted sm">Open this app in Google Chrome or Microsoft Edge to use auto-save.</p>` : ro ? '' : html`<div class="row-acts" style="justify-content:flex-start">${this.status === 'ok' ? html`${btn('Save now', 'df:save', { cls: 'sm primary' })}${btn('Change file', 'df:choose', { cls: 'sm ghost' })}${btn('Stop', 'df:stop', { cls: 'sm ghost' })}` : this.status === 'needs-permission' ? btn('Reconnect auto-save', 'df:reconnect', { cls: 'sm primary' }) : btn('Turn on auto-save', 'df:choose', { cls: 'sm primary' })}${btn('Restore data from file', 'df:restore', { cls: 'sm ghost' })}</div>`}
      <p class="muted sm mt">${this.persisted ? '✓ The browser has marked this app\'s storage as permanent.' : 'Tip: keep using the same browser and do not clear its "cookies and site data".'} Scanned documents stay in the browser; include them with <b>Export full backup</b>.</p></div>`;
  }
};
act('df:choose', () => DataFile.choose());
act('df:reconnect', () => DataFile.reconnect());
act('df:stop', () => DataFile.stop());
act('df:save', async () => { if (await DataFile.write()) toast('Saved to ' + DataFile.handle.name); });
act('df:restore', () => DataFile.restoreFromFile());
act('df:hide', () => { localStorage.setItem('crm_df_hint', 'no'); Router.refresh(); });
