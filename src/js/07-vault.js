/* ==========================================================================
   07-vault.js — IRIS & portal credential vault. Passwords are AES-GCM encrypted
   with a key derived (PBKDF2, 250k iterations, per-vault salt) from the Vault PIN.
   Reveal/copy require the PIN every time, auto-hide after 15 s, audit-logged.
   ========================================================================== */
const Vault = {
  ITER: 250000,
  timers: {},
  fails: 0, blockedUntil: 0,
  ready() { const v = Store.s.settings.vault; return !!(v && v.salt && v.check); },
  async keyFromPin(pin) {
    const v = Store.s.settings.vault;
    const key = await Crypto.deriveVaultKey(pin, v.salt, v.iter || this.ITER);
    await Crypto.decrypt(key, v.check); // throws if PIN is wrong
    return key;
  },
  /* Ask for the PIN; resolves to a CryptoKey or null. */
  async askKey(reason) {
    if (!this.ready()) { await this.setupPin(); if (!this.ready()) return null; }
    if (Date.now() < this.blockedUntil) { toast(`Too many wrong PIN attempts. Try again in ${Math.ceil((this.blockedUntil - Date.now()) / 1000)} s.`, 'err'); return null; }
    let key = null;
    const pin = await promptDlg('Vault PIN required', reason || 'Enter the Vault PIN', {
      type: 'password', inputmode: 'numeric', ok: 'Unlock',
      validate: async (p) => {
        if (Date.now() < this.blockedUntil) return 'Vault temporarily blocked. Please wait.';
        try { key = await this.keyFromPin(p); this.fails = 0; return ''; }
        catch (e) {
          this.fails++; Auth.audit('vault_pin_failed', 'vault', 'Wrong Vault PIN entered');
          if (this.fails >= 5) { this.blockedUntil = Date.now() + 120000; this.fails = 0; return 'Too many wrong attempts. Vault blocked for 2 minutes.'; }
          return 'Incorrect Vault PIN.';
        }
      }
    });
    return pin === null ? null : key;
  },
  async setupPin() {
    if (!Auth.can('vault', 'create') && !Auth.can('settings', 'edit')) { toast('The vault has not been set up yet. Ask an administrator to set the Vault PIN.', 'warn'); return; }
    await new Promise((res) => formModal({
      title: 'Set up the Vault PIN', size: 'sm', submit: 'Create vault',
      intro: html`<p>The Vault PIN encrypts all portal passwords (AES-256-GCM). It is <b>never stored</b> — if it is lost, saved passwords cannot be recovered. Share it only with authorised staff.</p>`,
      fields: [{ name: 'p1', label: 'New Vault PIN (6+ digits/characters)', type: 'password', required: true, validate: (v) => v.length < 6 ? 'Use at least 6 characters' : '' }, { name: 'p2', label: 'Confirm PIN', type: 'password', required: true, validate: (v, all) => v !== all.p1 ? 'PINs do not match' : '' }],
      onSubmit: async (v) => {
        const salt = Crypto.newSalt(); const key = await Crypto.deriveVaultKey(v.p1, salt, this.ITER);
        const check = await Crypto.encrypt(key, 'TAK-VAULT-OK');
        Store.commit((s) => { s.settings.vault = { salt, iter: this.ITER, check, createdAt: new Date().toISOString() }; });
        Auth.audit('vault_setup', 'vault', 'Vault PIN created'); toast('Vault ready');
      }
    }).onClose = res);
  },
  async changePin() {
    const oldKey = await this.askKey('Enter the CURRENT Vault PIN'); if (!oldKey) return;
    formModal({
      title: 'Change Vault PIN', size: 'sm', submit: 'Re-encrypt & save',
      fields: [{ name: 'p1', label: 'New Vault PIN', type: 'password', required: true, validate: (v) => v.length < 6 ? 'Use at least 6 characters' : '' }, { name: 'p2', label: 'Confirm new PIN', type: 'password', required: true, validate: (v, all) => v !== all.p1 ? 'PINs do not match' : '' }],
      onSubmit: async (v) => {
        const salt = Crypto.newSalt(); const nk = await Crypto.deriveVaultKey(v.p1, salt, this.ITER);
        const out = [];
        for (const c of Store.s.creds) out.push([c, await Crypto.encrypt(nk, await Crypto.decrypt(oldKey, c.secret))]);
        const check = await Crypto.encrypt(nk, 'TAK-VAULT-OK');
        Store.commit((s) => { out.forEach(([c, sec]) => { c.secret = sec; }); s.settings.vault = { salt, iter: this.ITER, check, createdAt: new Date().toISOString() }; });
        Auth.audit('vault_pin_change', 'vault', `Vault PIN changed; ${out.length} credentials re-encrypted`); toast('Vault PIN changed');
      }
    });
  },
  forget() { Object.values(this.timers).forEach(clearInterval); this.timers = {}; },
  age(c) { return daysBetween(isoDate(c.changedAt || c.createdAt), today()); },
  portalUrl(c) { return c.url || (Lists.get('portals', c.portal) || {}).url || ''; },
  open(c, clientId) {
    const isNew = !c;
    formModal({
      title: isNew ? 'Add portal credential' : 'Edit credential', size: 'md',
      intro: html`<p class="muted sm">${icon('lock')} The password is encrypted with the Vault PIN before it is saved.</p>`,
      fields: [
        { name: 'clientId', label: 'Client', type: 'select', options: clientOpts, required: true },
        { name: 'portal', label: 'Portal', type: 'select', list: 'portals', required: true },
        { name: 'username', label: 'Username / Login ID', required: true, autocomplete: 'off' },
        { name: 'password', label: isNew ? 'Password' : 'New password (leave blank to keep)', type: 'password', required: isNew, autocomplete: 'new-password' },
        { name: 'pin2', label: 'Extra PIN / secret answer (optional, encrypted)', type: 'password', autocomplete: 'off' },
        { name: 'url', label: 'Login URL (optional)', type: 'url', placeholder: 'Uses the portal default if blank', validate: Valid.url },
        { name: 'changedAt', label: 'Password last changed', type: 'date' },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }
      ],
      values: c ? { clientId: c.clientId, portal: c.portal, username: c.username, url: c.url, changedAt: isoDate(c.changedAt || c.createdAt), notes: c.notes } : { clientId: clientId || '', changedAt: today() },
      onSubmit: async (v) => {
        if (!Auth.canSeeClient(v.clientId)) return { clientId: 'Choose one of your clients' };
        let key = null;
        if (v.password || v.pin2 || isNew) { key = await this.askKey('Enter the Vault PIN to encrypt this password'); if (!key) return false; }
        const secret = v.password ? await Crypto.encrypt(key, v.password) : c.secret;
        const extra = v.pin2 ? await Crypto.encrypt(key, v.pin2) : (c ? c.extra : null);
        const data = { clientId: v.clientId, portal: v.portal, username: v.username, url: v.url, notes: v.notes, secret, extra, changedAt: v.password ? today() : (v.changedAt || today()) };
        const client = DB.client(v.clientId);
        if (isNew) {
          const rec = Rec.stamp(Object.assign({ id: uid('cr') }, data), true);
          Store.commit((s) => { s.creds.push(rec); Timeline.add(v.clientId, 'credential', `${Lists.name('portals', v.portal)} credential added`); });
          Auth.audit('create', 'vault', `Credential added: ${Lists.name('portals', v.portal)} for ${client.code}`, { recordId: rec.id, new: { portal: Lists.name('portals', v.portal), username: v.username } });
        } else {
          const old = { username: c.username, portal: c.portal, url: c.url };
          Store.commit(() => { Object.assign(c, data); Rec.stamp(c); });
          Auth.audit('edit', 'vault', `Credential edited: ${Lists.name('portals', c.portal)} for ${client.code}${v.password ? ' (password changed)' : ''}`, { recordId: c.id, old, new: { username: v.username, portal: v.portal, url: v.url } });
        }
        toast('Credential saved (encrypted)');
      }
    });
  },
  async reveal(c, field = 'secret') {
    const client = DB.client(c.clientId) || {};
    const key = await this.askKey(`Enter the Vault PIN to reveal the ${Lists.name('portals', c.portal)} password for ${client.code || ''}`); if (!key) return;
    let pw; try { pw = await Crypto.decrypt(key, c[field]); } catch (e) { toast('Could not decrypt this entry', 'err'); return; }
    Auth.audit('reveal', 'vault', `Password revealed: ${Lists.name('portals', c.portal)} for ${client.code || ''} ${client.name || ''}`, { recordId: c.id });
    const el = document.querySelector(`[data-secret="${c.id}${field}"]`);
    if (!el) { toast('Revealed — open the vault list to view', 'info'); return; }
    let left = 15; clearInterval(this.timers[c.id + field]);
    el.textContent = pw; el.classList.add('shown'); const cd = document.createElement('small'); cd.className = 'cd'; el.after(cd);
    const tick = () => { cd.textContent = ` hides in ${left}s`; if (left-- <= 0) { clearInterval(this.timers[c.id + field]); el.textContent = '••••••••'; el.classList.remove('shown'); cd.remove(); } };
    tick(); this.timers[c.id + field] = setInterval(tick, 1000);
  },
  async copy(c) {
    const client = DB.client(c.clientId) || {};
    const key = await this.askKey('Enter the Vault PIN to copy this password'); if (!key) return;
    let pw; try { pw = await Crypto.decrypt(key, c.secret); } catch (e) { toast('Could not decrypt this entry', 'err'); return; }
    try { await navigator.clipboard.writeText(pw); } catch (e) { const t = document.createElement('textarea'); t.value = pw; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    pw = null;
    Auth.audit('copy', 'vault', `Password copied: ${Lists.name('portals', c.portal)} for ${client.code || ''}`, { recordId: c.id });
    toast('Password copied. Clipboard will be cleared in 20 seconds.', 'info');
    setTimeout(() => { navigator.clipboard && navigator.clipboard.writeText(' ').catch(() => {}); }, 20000);
  },
  table(rows, key) {
    if (!Auth.can('vault')) return html`<p class="muted">No access.</p>`;
    return dataTable(key, {
      rows, empty: emptyState('No credentials saved', 'Add website, portal, email or software logins for your clients.'),
      rowCls: (c) => (this.age(c) > 90 ? 'row-warn' : ''),
      cols: [
        { key: 'client', label: 'Client', get: (c) => (DB.client(c.clientId) || {}).name, render: (c) => { const cl = DB.client(c.clientId); return cl ? html`<a href="#/clients/${cl.code}">${cl.code} · ${cl.name}</a>` : '—'; } },
        { key: 'portal', label: 'Portal', get: (c) => Lists.name('portals', c.portal), render: (c) => html`<b>${Lists.name('portals', c.portal)}</b>` },
        { key: 'username', label: 'Username', render: (c) => html`<code>${c.username}</code>` },
        { key: 'pw', label: 'Password', sort: false, render: (c) => html`<span class="secret-v" data-secret="${c.id}secret">••••••••</span>` },
        { key: 'changedAt', label: 'Last changed', get: (c) => c.changedAt, render: (c) => html`${fmtDate(c.changedAt)}${this.age(c) > 90 ? html`<br>${badge(`${this.age(c)} days old`, 'amber')}` : ''}` },
        { key: 'a', label: '', sort: false, cls: 'act', render: (c) => html`<div class="row-acts">${btn('', 'vault:reveal', { id: c.id, icon: 'eye', cls: 'icon-btn sm', title: 'Reveal (PIN)' })}${btn('', 'vault:copy', { id: c.id, icon: 'copy', cls: 'icon-btn sm', title: 'Copy (PIN)' })}${this.portalUrl(c) ? html`<a class="icon-btn sm" href="${this.portalUrl(c)}" target="_blank" rel="noopener noreferrer" title="Open login page" aria-label="Open login page">↗</a>` : ''}${Auth.can('vault', 'edit') ? btn('', 'vault:edit', { id: c.id, icon: 'edit', cls: 'icon-btn sm', title: 'Edit' }) : ''}${Auth.can('vault', 'delete') ? btn('', 'vault:del', { id: c.id, icon: 'trash', cls: 'icon-btn sm', title: 'Delete' }) : ''}</div>` }
      ]
    });
  }
};

Views.vault = {
  onNew() { if (Auth.can('vault', 'create')) Vault.open(); },
  render() {
    const f = vs('vault');
    const rows = Auth.byClient(Store.s.creds).filter((c) => { const cl = DB.client(c.clientId) || {}; return textMatch(f.q, cl.name, cl.code, c.username, Lists.name('portals', c.portal), c.notes) && (!f.portal || c.portal === f.portal) && (!f.client || c.clientId === f.client) && (!f.old || Vault.age(c) > 90); });
    const old = Auth.byClient(Store.s.creds).filter((c) => Vault.age(c) > 90).length;
    return html`${pageHead('IRIS & Portal Credentials Vault', 'Passwords are encrypted with AES-256-GCM. Reveal and copy require the Vault PIN and are audit-logged.', html`${!Vault.ready() ? btn('Set up Vault PIN', 'vault:setup', { cls: 'primary', icon: 'key' }) : (Auth.can('settings', 'edit') ? html`${btn('Change Vault PIN', 'vault:changepin', { cls: 'ghost', icon: 'key' })}${btn('Reset vault', 'vault:reset', { cls: 'ghost danger-txt', title: 'Forgot the PIN? Delete all saved passwords and start a new vault' })}` : '')}${Auth.can('vault', 'create') ? btn('Add credential', 'vault:new', { cls: 'primary', icon: 'plus' }) : ''}`)}
      ${!Vault.ready() ? html`<div class="note warn">${icon('lock')} The vault is not set up yet. Create a Vault PIN to start saving portal passwords.</div>` : ''}
      ${old ? html`<div class="note warn">${old} password${old > 1 ? 's are' : ' is'} older than 90 days. Consider changing ${old > 1 ? 'them' : 'it'} on the portal and updating the vault.</div>` : ''}
      <div class="card filters">${fInput('vault.q', 'Search client, portal, username…')}${fSelect('vault.portal', 'All portals', listOpts('portals'))}${fSelect('vault.client', 'All clients', clientOpts())}<label class="chk"><input type="checkbox" data-vs="vault.old" ${f.old ? raw('checked') : ''}> <span>Older than 90 days</span></label></div>
      <div class="card p0">${Vault.table(rows, 'vault')}</div>`;
  }
};
const credOf = (a) => Store.s.creds.find((c) => c.id === a.dataset.id);
act('vault:new', (a) => Vault.open(null, a.dataset.client));
act('vault:edit', (a) => Vault.open(credOf(a)));
act('vault:reveal', (a) => Vault.reveal(credOf(a)));
act('vault:copy', (a) => Vault.copy(credOf(a)));
act('vault:setup', () => Vault.setupPin());
act('vault:changepin', () => Vault.changePin());
act('vault:reset', async () => {
  const n = Store.s.creds.length;
  const v = await promptDlg('Reset the vault', `Use this only if the Vault PIN is lost. All ${n} saved portal passwords will be permanently deleted and you will set a new PIN. Type RESET VAULT to continue.`, { ok: 'Reset vault' });
  if (v === null) return; if (v.trim().toUpperCase() !== 'RESET VAULT') { toast('Not reset — you must type RESET VAULT', 'warn'); return; }
  await Backup.snapshot('before-vault-reset');
  Store.commit((s) => { s.creds = []; s.settings.vault = null; });
  Auth.audit('vault_reset', 'vault', `Vault reset: ${n} encrypted credentials deleted`);
  toast('Vault reset. Set a new Vault PIN to continue.'); Vault.setupPin();
});
act('vault:del', async (a) => { const c = credOf(a); if (await confirmDlg('Delete this credential?', { danger: true, ok: 'Delete' })) Rec.remove('creds', c, `${Lists.name('portals', c.portal)} credential`, 'vault'); });
