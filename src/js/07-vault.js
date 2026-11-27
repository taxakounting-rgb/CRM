/* ==========================================================================
   07-vault.js — Credentials Vault. Every service can have its own credential
   TYPE (e.g. Taxation: User ID / Email + Password + PIN; Digital Marketing:
   Platform, Login, Password, 2FA code ...). Types and their fields are data
   (Credentials Vault > Credential types), not code. Secret fields (password /
   PIN) are AES-GCM encrypted with a key derived (PBKDF2, 250k iterations,
   per-vault salt) from the Vault PIN. Reveal/copy require the PIN every time,
   auto-hide after 15 s, audit-logged.
   ========================================================================== */
const CRED_KINDS = { text: 'Text', email: 'Email', url: 'Link / URL', secret: 'Password (encrypted)', pin: 'PIN (encrypted)' };
const isSecretKind = (k) => k === 'secret' || k === 'pin';
/* Starter types. Fully editable / deletable by the owner. */
const DEFAULT_CRED_TYPES = [
  { id: 'ct_tax', name: 'Tax / Government Portal', service: '', url: '', fields: [
    { id: 'f1', label: 'User ID / Email', kind: 'text', required: true }, { id: 'f2', label: 'Password', kind: 'secret', required: true }, { id: 'f3', label: 'PIN', kind: 'pin', required: false } ] },
  { id: 'ct_social', name: 'Social Media', service: '', url: '', fields: [
    { id: 'f1', label: 'Platform / Page name', kind: 'text', required: true }, { id: 'f2', label: 'Username / Email', kind: 'text', required: true }, { id: 'f3', label: 'Password', kind: 'secret', required: true }, { id: 'f4', label: '2FA / Backup code', kind: 'secret', required: false } ] },
  { id: 'ct_ads', name: 'Ads Account (Google / Meta / TikTok)', service: '', url: '', fields: [
    { id: 'f1', label: 'Ad account ID', kind: 'text', required: false }, { id: 'f2', label: 'Login email', kind: 'email', required: true }, { id: 'f3', label: 'Password', kind: 'secret', required: true }, { id: 'f4', label: '2FA / Backup code', kind: 'secret', required: false } ] },
  { id: 'ct_web', name: 'Website / Hosting', service: '', url: '', fields: [
    { id: 'f1', label: 'Panel / Login URL', kind: 'url', required: false }, { id: 'f2', label: 'Username', kind: 'text', required: true }, { id: 'f3', label: 'Password', kind: 'secret', required: true } ] },
  { id: 'ct_email', name: 'Email Account', service: '', url: '', fields: [
    { id: 'f1', label: 'Email address', kind: 'email', required: true }, { id: 'f2', label: 'Password', kind: 'secret', required: true }, { id: 'f3', label: 'Recovery email / phone', kind: 'text', required: false } ] },
  { id: 'ct_bank', name: 'Bank Portal', service: '', url: '', fields: [
    { id: 'f1', label: 'User ID', kind: 'text', required: true }, { id: 'f2', label: 'Password', kind: 'secret', required: true }, { id: 'f3', label: 'PIN / MPIN', kind: 'pin', required: false } ] },
  { id: 'ct_login', name: 'General Login', service: '', url: '', fields: [
    { id: 'f1', label: 'Username / Login ID', kind: 'text', required: true }, { id: 'f2', label: 'Password', kind: 'secret', required: true } ] }
];
/* Old (pre-types) credentials carried a Portal list value; map them to a starter type. */
const LEGACY_PORTAL_TYPE = { 'email account': 'ct_email', 'website / hosting': 'ct_web', 'bank portal': 'ct_bank', 'social media': 'ct_social', 'government portal': 'ct_tax' };

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
        const jobs = [];
        for (const c of Store.s.creds) {
          if (c.secret) jobs.push([c, 'secret', c.secret]);
          if (c.extra) jobs.push([c, 'extra', c.extra]);
          Object.entries(c.secrets || {}).forEach(([k, b]) => jobs.push([c, 's:' + k, b]));
        }
        const out = [];
        for (const [c, slot, b] of jobs) out.push([c, slot, await Crypto.encrypt(nk, await Crypto.decrypt(oldKey, b))]);
        const check = await Crypto.encrypt(nk, 'TAK-VAULT-OK');
        Store.commit((s) => {
          out.forEach(([c, slot, val]) => { if (slot === 'secret') c.secret = val; else if (slot === 'extra') c.extra = val; else c.secrets[slot.slice(2)] = val; });
          s.settings.vault = { salt, iter: this.ITER, check, createdAt: new Date().toISOString() };
        });
        Auth.audit('vault_pin_change', 'vault', `Vault PIN changed; ${out.length} secrets re-encrypted`); toast('Vault PIN changed');
      }
    });
  },
  forget() { Object.values(this.timers).forEach(clearInterval); this.timers = {}; },
  age(c) { return daysBetween(isoDate(c.changedAt || c.createdAt), today()); },

  /* ---------- Credential types (data, editable) ---------- */
  types() { const t = Store.s.settings.credTypes; return JSON.parse(JSON.stringify(Array.isArray(t) ? t : DEFAULT_CRED_TYPES)); },
  type(id) { return this.types().find((t) => t.id === id); },
  saveTypes(arr) { Store.commit((s) => { s.settings.credTypes = arr; }); },
  typeLabel(t) { const sv = t.service ? Lists.get('services', t.service) : null; return (sv ? sv.name + ' › ' : '') + t.name; },
  typeName(c) {
    if (c.typeId) { const t = this.type(c.typeId); return t ? t.name : 'Credential'; }
    return Lists.name('portals', c.portal);
  },
  /* Non-mutating: returns the credential in the typed shape (old records are converted on the fly). */
  upgrade(c) {
    if (c.typeId) return Object.assign({}, c, { layout: c.layout || [], fields: c.fields || {}, secrets: c.secrets || {} });
    const pname = String(Lists.name('portals', c.portal) || '').toLowerCase();
    const t = this.type(LEGACY_PORTAL_TYPE[pname] || 'ct_login') || this.types()[0] || null;
    const lay = (t ? t.fields : []).map(({ id, label, kind }) => ({ id, label, kind }));
    const fields = {}, secrets = {};
    let txt = lay.find((f) => !isSecretKind(f.kind)); if (!txt) { txt = { id: 'u0', label: 'Username / Login ID', kind: 'text' }; lay.unshift(txt); }
    let pw = lay.find((f) => f.kind === 'secret') || lay.find((f) => isSecretKind(f.kind)); if (!pw) { pw = { id: 'p0', label: 'Password', kind: 'secret' }; lay.push(pw); }
    fields[txt.id] = c.username || ''; if (c.secret) secrets[pw.id] = c.secret;
    if (c.extra) {
      const pin = lay.find((f) => f !== pw && f.kind === 'pin') || lay.find((f) => f !== pw && isSecretKind(f.kind));
      if (pin) secrets[pin.id] = c.extra; else { lay.push({ id: 'x1', label: 'Extra PIN / secret answer', kind: 'pin' }); secrets.x1 = c.extra; }
    }
    return Object.assign({}, c, { typeId: t ? t.id : '', layout: lay, fields, secrets });
  },
  plain(c) { const u = this.upgrade(c); return u.layout.filter((f) => !isSecretKind(f.kind) && u.fields[f.id]).map((f) => [f.label, u.fields[f.id], f.kind]); },
  secretList(c) { const u = this.upgrade(c); return u.layout.filter((f) => isSecretKind(f.kind) && u.secrets[f.id]); },
  portalUrl(c) { const t = c.typeId ? this.type(c.typeId) : null; return c.url || (t && t.url) || (!c.typeId ? (Lists.get('portals', c.portal) || {}).url : '') || ''; },

  /* ---------- Add / edit a credential ---------- */
  open(c, clientId) {
    const isNew = !c; const types = this.types();
    if (!types.length) { toast('No credential types yet. Add one first.', 'warn'); if (Auth.can('vault', 'create')) this.manageTypes(); return; }
    const u = c ? this.upgrade(c) : null;
    let typeId = u && this.type(u.typeId) ? u.typeId : '';
    const clientF = { name: 'clientId', label: 'Client', type: 'select', options: clientOpts, required: true };
    const typeF = { name: 'typeId', label: 'Credential type', type: 'select', options: () => types.map((t) => ({ value: t.id, label: this.typeLabel(t) })), required: true, placeholder: '— Choose what you are saving —' };
    const tail = [
      { name: 'url', label: 'Login URL (optional)', type: 'url', placeholder: 'Opens from the vault list', validate: Valid.url },
      { name: 'changedAt', label: 'Password last changed', type: 'date' },
      { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }
    ];
    const dynFields = (tid) => { const t = types.find((x) => x.id === tid); return t ? t.fields.map((f) => ({ name: 'cf_' + f.id, label: f.label, type: isSecretKind(f.kind) ? 'password' : (f.kind === 'email' ? 'email' : f.kind === 'url' ? 'url' : 'text'), required: !!f.required && !(u && u.secrets[f.id]), autocomplete: isSecretKind(f.kind) ? 'new-password' : 'off', placeholder: isSecretKind(f.kind) && u && u.secrets[f.id] ? 'Leave blank to keep the saved value' : '', _kind: f.kind, _id: f.id, validate: f.kind === 'url' ? Valid.url : undefined })) : []; };
    const dynVals = (tid) => { const o = {}; if (u && u.typeId === tid) Object.entries(u.fields).forEach(([k, v]) => { o['cf_' + k] = v; }); return o; };
    const base = c ? { clientId: u.clientId, url: u.url, changedAt: isoDate(u.changedAt || u.createdAt), notes: u.notes } : { clientId: clientId || '', changedAt: today() };
    const dynHTML = (tid, vals) => { const fs = dynFields(tid); return fs.length ? html`${fs.map((f) => fieldHTML(f, vals[f.name]))}` : html`<p class="muted sm full">Choose a credential type to see its fields.</p>`; };
    const body = html`<p class="muted sm form-intro">${icon('lock')} Passwords and PINs are encrypted with the Vault PIN before they are saved. Each type has its own fields — change them from <b>Credential types</b>.</p>
      <form class="grid-form" novalidate>${fieldHTML(clientF, base.clientId)}${fieldHTML(typeF, typeId)}<div data-dyn style="display:contents">${dynHTML(typeId, dynVals(typeId))}</div>${tail.map((f) => fieldHTML(f, base[f.name]))}<button type="submit" hidden></button></form>`;
    Modal.open({
      title: isNew ? 'Add credential' : 'Edit credential', size: 'md', body,
      foot: html`${Auth.can('vault', 'create') ? html`<button type="button" class="btn ghost" data-mgr>${icon('key')}<span>Credential types</span></button>` : ''}<span class="grow"></span><button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" data-save>Save</button>`,
      onMount: (el, m) => {
        const form = el.querySelector('form'); const dyn = el.querySelector('[data-dyn]');
        const fieldsNow = () => [clientF, typeF, ...dynFields(typeId), ...tail];
        const paintDyn = (vals) => { dyn.innerHTML = String(dynHTML(typeId, vals)); dynFields(typeId).forEach((f) => { if (f._kind === 'pin') { const i = form.elements[f.name]; if (i) i.setAttribute('inputmode', 'numeric'); } }); bindFormExtras(dyn); };
        bindFormExtras(form); paintDyn(dynVals(typeId));
        form.elements.typeId.addEventListener('change', () => { typeId = form.elements.typeId.value; paintDyn(dynVals(typeId)); });
        const mg = el.querySelector('[data-mgr]'); if (mg) mg.onclick = () => this.manageTypes();
        let busy = false;
        const go = async () => {
          if (busy) return;
          const vals = readForm(form, fieldsNow()); const errs = validateForm(vals, fieldsNow());
          if (vals.clientId && !Auth.canSeeClient(vals.clientId)) errs.clientId = 'Choose one of your clients';
          if (Object.keys(errs).length) { showErrors(form, errs); return; }
          busy = true; const b = el.querySelector('[data-save]'); b.disabled = true;
          try {
            const t = types.find((x) => x.id === vals.typeId);
            const needKey = isNew || t.fields.some((f) => isSecretKind(f.kind) && vals['cf_' + f.id]);
            let key = null; if (needKey) { key = await this.askKey('Enter the Vault PIN to encrypt this credential'); if (!key) return; }
            const fields = {}, secrets = {};
            for (const f of t.fields) {
              const v = vals['cf_' + f.id];
              if (isSecretKind(f.kind)) { if (v) secrets[f.id] = await Crypto.encrypt(key, v); else if (u && u.typeId === t.id && u.secrets[f.id]) secrets[f.id] = u.secrets[f.id]; }
              else if (v) fields[f.id] = v;
            }
            const layout = t.fields.map(({ id, label, kind }) => ({ id, label, kind }));
            if (u && u.typeId === t.id) u.layout.forEach((f) => { if (!layout.some((x) => x.id === f.id) && (u.secrets[f.id] || u.fields[f.id])) { layout.push({ id: f.id, label: f.label, kind: f.kind }); if (u.secrets[f.id]) secrets[f.id] = u.secrets[f.id]; if (u.fields[f.id]) fields[f.id] = u.fields[f.id]; } });
            const changedSecret = Object.keys(secrets).some((k) => !(u && u.typeId === t.id && u.secrets[k] === secrets[k]));
            const data = { clientId: vals.clientId, typeId: t.id, layout, fields, secrets, url: vals.url, notes: vals.notes, changedAt: changedSecret ? today() : (vals.changedAt || today()) };
            const client = DB.client(vals.clientId); const first = layout.find((f) => !isSecretKind(f.kind)); const login = first ? fields[first.id] || '' : '';
            if (isNew) {
              const rec = Rec.stamp(Object.assign({ id: uid('cr') }, data), true);
              Store.commit((s) => { s.creds.push(rec); Timeline.add(vals.clientId, 'credential', `${t.name} credential added`); });
              Auth.audit('create', 'vault', `Credential added: ${t.name} for ${client.code}`, { recordId: rec.id, new: { type: t.name, login } });
            } else {
              const old = { type: this.typeName(c), url: c.url };
              Store.commit(() => { ['portal', 'username', 'secret', 'extra'].forEach((k) => { delete c[k]; }); Object.assign(c, data); Rec.stamp(c); });
              Auth.audit('edit', 'vault', `Credential edited: ${t.name} for ${client.code}${changedSecret ? ' (secret changed)' : ''}`, { recordId: c.id, old, new: { type: t.name, login, url: vals.url } });
            }
            toast('Credential saved (encrypted)'); m.close();
          } catch (e) { console.warn(e); toast(e.message || 'Something went wrong', 'err'); }
          finally { busy = false; b.disabled = false; }
        };
        el.querySelector('[data-save]').onclick = go; form.onsubmit = (e) => { e.preventDefault(); go(); };
      }
    });
  },

  /* ---------- Manage credential types ---------- */
  typesList() {
    const ts = this.types(); const used = (id) => Store.s.creds.filter((c) => c.typeId === id).length;
    if (!ts.length) return emptyState('No credential types', 'Add a type for each kind of login you store.');
    return html`<div class="ct-list">${ts.map((t) => html`<div class="ct-item"><div><b>${this.typeLabel(t)}</b> <small class="muted">· ${used(t.id)} saved</small><div class="ct-chips">${t.fields.map((f) => html`<span class="ct-chip ${isSecretKind(f.kind) ? 'sec' : ''}">${isSecretKind(f.kind) ? icon('lock') : ''}${f.label}</span>`)}</div></div><div class="row-acts">${btn('', 'vault:typeedit', { id: t.id, icon: 'edit', cls: 'icon-btn sm', title: 'Edit type' })}${btn('', 'vault:typedel', { id: t.id, icon: 'trash', cls: 'icon-btn sm', title: 'Delete type' })}</div></div>`)}</div>`;
  },
  redrawTypes() { const el = document.querySelector('[data-types]'); if (el) el.innerHTML = String(this.typesList()); try { Router.refresh(); } catch (e) { /* ignore */ } },
  manageTypes() {
    if (!Auth.can('vault', 'create')) { toast('You do not have permission to change credential types', 'warn'); return; }
    Modal.open({
      title: 'Credential types', size: 'md',
      body: html`<p class="muted sm">Each type has its own fields — e.g. <b>Taxation</b>: User ID / Email, Password and PIN; <b>Digital Marketing</b>: Platform, Login, Password, 2FA code. Password and PIN fields are always encrypted.</p><div data-types>${this.typesList()}</div>`,
      foot: html`${btn('Add credential type', 'vault:typenew', { cls: 'primary', icon: 'plus' })}<span class="grow"></span><button type="button" class="btn ghost" data-close>Close</button>`
    });
  },
  editType(t) {
    const isNew = !t;
    const draft = t ? JSON.parse(JSON.stringify(t)) : { id: uid('ct_'), name: '', service: '', url: '', fields: [{ id: uid('f'), label: 'Username / Login ID', kind: 'text', required: true }, { id: uid('f'), label: 'Password', kind: 'secret', required: true }] };
    const row = (f) => html`<div class="ct-row" data-fid="${f.id}"><input class="inp" data-k="label" value="${f.label}" placeholder="Field name (e.g. PIN)" aria-label="Field name"><select class="inp" data-k="kind" aria-label="Field type">${Object.entries(CRED_KINDS).map(([k, l]) => html`<option value="${k}" ${k === f.kind ? raw('selected') : ''}>${l}</option>`)}</select><label class="chk"><input type="checkbox" data-k="required" ${f.required ? raw('checked') : ''}><span>Required</span></label><button type="button" class="icon-btn sm" data-rm title="Remove field" aria-label="Remove field">${icon('trash')}</button></div>`;
    const svc = Lists.all('services');
    Modal.open({
      title: isNew ? 'New credential type' : 'Edit credential type', size: 'md',
      body: html`<div class="grid-form"><label class="fld full"><span>Type name<b class="req">*</b></span><input class="inp" data-name value="${draft.name}" placeholder="e.g. Taxation, Facebook Ads, Domain & Hosting"><small class="err" data-err></small></label>
        <label class="fld"><span>For service (optional)</span><select class="inp" data-svc><option value="">— Any / general —</option>${svc.map((x) => html`<option value="${x.id}" ${x.id === draft.service ? raw('selected') : ''}>${x.name}</option>`)}</select></label>
        <label class="fld"><span>Default login URL (optional)</span><input class="inp" data-url type="url" value="${draft.url || ''}" placeholder="https://"></label></div>
        <h4 class="form-sec">Fields</h4><div data-rows>${draft.fields.map(row)}</div><button type="button" class="btn ghost sm" data-addf>${icon('plus')}<span>Add field</span></button>`,
      foot: html`<span class="grow"></span><button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" data-save>Save type</button>`,
      onMount: (el, m) => {
        const rows = el.querySelector('[data-rows]');
        rows.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) b.closest('.ct-row').remove(); });
        el.querySelector('[data-addf]').onclick = () => { rows.insertAdjacentHTML('beforeend', String(row({ id: uid('f'), label: '', kind: 'text', required: false }))); const l = rows.querySelector('.ct-row:last-child [data-k=label]'); if (l) l.focus(); };
        el.querySelector('[data-save]').onclick = () => {
          const name = el.querySelector('[data-name]').value.trim(); const err = el.querySelector('[data-err]');
          const fields = [...rows.querySelectorAll('.ct-row')].map((r) => ({ id: r.dataset.fid, label: r.querySelector('[data-k=label]').value.trim(), kind: r.querySelector('[data-k=kind]').value, required: r.querySelector('[data-k=required]').checked }));
          if (!name) { err.textContent = 'Give the type a name'; return; }
          if (!fields.length) { toast('Add at least one field', 'warn'); return; }
          if (fields.some((f) => !f.label)) { toast('Every field needs a name', 'warn'); return; }
          if (!fields.some((f) => isSecretKind(f.kind))) { toast('Add at least one Password or PIN field — this is what the vault encrypts', 'warn'); return; }
          const url = el.querySelector('[data-url]').value.trim(); if (Valid.url(url)) { toast(Valid.url(url), 'warn'); return; }
          const all = this.types(); if (all.some((x) => x.id !== draft.id && x.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'A type with this name already exists'; return; }
          const rec = { id: draft.id, name, service: el.querySelector('[data-svc]').value, url, fields };
          const i = all.findIndex((x) => x.id === draft.id); if (i < 0) all.push(rec); else all[i] = rec;
          this.saveTypes(all); Auth.audit(isNew ? 'create' : 'edit', 'vault', `Credential type ${isNew ? 'added' : 'edited'}: ${name}`);
          toast('Credential type saved'); m.close(); this.redrawTypes();
        };
      }
    });
  },
  async delType(id) {
    const t = this.type(id); if (!t) return;
    const n = Store.s.creds.filter((c) => c.typeId === id).length;
    if (n) { toast(`${n} saved credential${n > 1 ? 's use' : ' uses'} this type. Edit or delete them first.`, 'warn'); return; }
    if (!(await confirmDlg(`Delete the type "${t.name}"?`, { danger: true, ok: 'Delete' }))) return;
    this.saveTypes(this.types().filter((x) => x.id !== id)); Auth.audit('delete', 'vault', `Credential type deleted: ${t.name}`); this.redrawTypes();
  },

  /* ---------- Reveal / copy (PIN every time) ---------- */
  async reveal(c, fk) {
    const client = DB.client(c.clientId) || {}; const u = this.upgrade(c); const f = u.layout.find((x) => x.id === fk); if (!f || !u.secrets[fk]) return;
    const key = await this.askKey(`Enter the Vault PIN to reveal "${f.label}" (${this.typeName(c)}) for ${client.code || ''}`); if (!key) return;
    let pw; try { pw = await Crypto.decrypt(key, u.secrets[fk]); } catch (e) { toast('Could not decrypt this entry', 'err'); return; }
    Auth.audit('reveal', 'vault', `Revealed: ${f.label} (${this.typeName(c)}) for ${client.code || ''} ${client.name || ''}`, { recordId: c.id });
    const el = document.querySelector(`[data-secret="${c.id}${fk}"]`);
    if (!el) { toast('Revealed — open the vault list to view', 'info'); return; }
    const tk = c.id + fk; let left = 15; clearInterval(this.timers[tk]);
    el.textContent = pw; el.classList.add('shown'); const cd = document.createElement('small'); cd.className = 'cd'; el.after(cd);
    const tick = () => { cd.textContent = ` hides in ${left}s`; if (left-- <= 0) { clearInterval(this.timers[tk]); el.textContent = '••••••••'; el.classList.remove('shown'); cd.remove(); } };
    tick(); this.timers[tk] = setInterval(tick, 1000);
  },
  async copy(c, fk) {
    const client = DB.client(c.clientId) || {}; const u = this.upgrade(c); const f = u.layout.find((x) => x.id === fk); if (!f || !u.secrets[fk]) return;
    const key = await this.askKey(`Enter the Vault PIN to copy "${f.label}"`); if (!key) return;
    let pw; try { pw = await Crypto.decrypt(key, u.secrets[fk]); } catch (e) { toast('Could not decrypt this entry', 'err'); return; }
    try { await navigator.clipboard.writeText(pw); } catch (e) { const t = document.createElement('textarea'); t.value = pw; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    pw = null;
    Auth.audit('copy', 'vault', `Copied: ${f.label} (${this.typeName(c)}) for ${client.code || ''}`, { recordId: c.id });
    toast('Copied. Clipboard will be cleared in 20 seconds.', 'info');
    setTimeout(() => { navigator.clipboard && navigator.clipboard.writeText(' ').catch(() => {}); }, 20000);
  },
  table(rows, key) {
    if (!Auth.can('vault')) return html`<p class="muted">No access.</p>`;
    const secretRow = (c, f) => html`<div class="vsec nw"><small class="muted">${f.label}</small><span class="secret-v" data-secret="${c.id}${f.id}">••••••••</span>${btn('', 'vault:reveal', { id: c.id, icon: 'eye', cls: 'icon-btn sm', title: `Reveal ${f.label} (PIN)`, extra: `data-fk="${esc(f.id)}"` })}${btn('', 'vault:copy', { id: c.id, icon: 'copy', cls: 'icon-btn sm', title: `Copy ${f.label} (PIN)`, extra: `data-fk="${esc(f.id)}"` })}</div>`;
    return dataTable(key, {
      rows, empty: emptyState('No credentials saved', 'Add website, portal, email or software logins for your clients.'),
      rowCls: (c) => (this.age(c) > 90 ? 'row-warn' : ''),
      cols: [
        { key: 'client', label: 'Client', get: (c) => (DB.client(c.clientId) || {}).name, render: (c) => { const cl = DB.client(c.clientId); return cl ? html`<a href="#/clients/${cl.code}">${cl.code} · ${cl.name}</a>` : '—'; } },
        { key: 'type', label: 'Type', get: (c) => this.typeName(c), render: (c) => html`<b>${this.typeName(c)}</b>` },
        { key: 'details', label: 'Login details', sort: false, render: (c) => { const p = this.plain(c); return p.length ? html`${p.map(([l, v, k]) => html`<div class="vsec"><small class="muted">${l}</small>${k === 'url' && /^https?:\/\//i.test(v) ? html`<a href="${v}" target="_blank" rel="noopener noreferrer">${v}</a>` : html`<code>${v}</code>`}</div>`)}` : '—'; } },
        { key: 'pw', label: 'Password / PIN', sort: false, render: (c) => html`${this.secretList(c).map((f) => secretRow(c, f))}` },
        { key: 'changedAt', label: 'Last changed', get: (c) => c.changedAt, render: (c) => html`${fmtDate(c.changedAt)}${this.age(c) > 90 ? html`<br>${badge(`${this.age(c)} days old`, 'amber')}` : ''}` },
        { key: 'a', label: '', sort: false, cls: 'act', render: (c) => html`<div class="row-acts">${this.portalUrl(c) ? html`<a class="icon-btn sm" href="${this.portalUrl(c)}" target="_blank" rel="noopener noreferrer" title="Open login page" aria-label="Open login page">↗</a>` : ''}${Auth.can('vault', 'edit') ? btn('', 'vault:edit', { id: c.id, icon: 'edit', cls: 'icon-btn sm', title: 'Edit' }) : ''}${Auth.can('vault', 'delete') ? btn('', 'vault:del', { id: c.id, icon: 'trash', cls: 'icon-btn sm', title: 'Delete' }) : ''}</div>` }
      ]
    });
  }
};

Views.vault = {
  onNew() { if (Auth.can('vault', 'create')) Vault.open(); },
  render() {
    const f = vs('vault');
    const rows = Auth.byClient(Store.s.creds).filter((c) => { const cl = DB.client(c.clientId) || {}; return textMatch(f.q, cl.name, cl.code, Vault.typeName(c), c.notes, ...Vault.plain(c).map((x) => x[1])) && (!f.type || (c.typeId || '') === f.type) && (!f.client || c.clientId === f.client) && (!f.old || Vault.age(c) > 90); });
    const old = Auth.byClient(Store.s.creds).filter((c) => Vault.age(c) > 90).length;
    const typeOpts = Vault.types().map((t) => ({ value: t.id, label: Vault.typeLabel(t) }));
    return html`${pageHead('Credentials Vault', 'Each credential type has its own fields. Passwords and PINs are encrypted with AES-256-GCM; reveal and copy require the Vault PIN and are audit-logged.', html`${!Vault.ready() ? btn('Set up Vault PIN', 'vault:setup', { cls: 'primary', icon: 'key' }) : (Auth.can('settings', 'edit') ? html`${btn('Change Vault PIN', 'vault:changepin', { cls: 'ghost', icon: 'key' })}${btn('Reset vault', 'vault:reset', { cls: 'ghost danger-txt', title: 'Forgot the PIN? Delete all saved passwords and start a new vault' })}` : '')}${Auth.can('vault', 'create') ? html`${btn('Credential types', 'vault:types', { cls: 'ghost', icon: 'vault' })}${btn('Add credential', 'vault:new', { cls: 'primary', icon: 'plus' })}` : ''}`)}
      ${!Vault.ready() ? html`<div class="note warn">${icon('lock')} The vault is not set up yet. Create a Vault PIN to start saving passwords.</div>` : ''}
      ${old ? html`<div class="note warn">${old} password${old > 1 ? 's are' : ' is'} older than 90 days. Consider changing ${old > 1 ? 'them' : 'it'} on the portal and updating the vault.</div>` : ''}
      <div class="card filters">${fInput('vault.q', 'Search client, type, login…')}${fSelect('vault.type', 'All types', typeOpts)}${fSelect('vault.client', 'All clients', clientOpts())}<label class="chk"><input type="checkbox" data-vs="vault.old" ${f.old ? raw('checked') : ''}> <span>Older than 90 days</span></label></div>
      <div class="card p0">${Vault.table(rows, 'vault')}</div>`;
  }
};
const credOf = (a) => Store.s.creds.find((c) => c.id === a.dataset.id);
act('vault:new', (a) => Vault.open(null, a.dataset.client));
act('vault:edit', (a) => Vault.open(credOf(a)));
act('vault:reveal', (a) => Vault.reveal(credOf(a), a.dataset.fk));
act('vault:copy', (a) => Vault.copy(credOf(a), a.dataset.fk));
act('vault:setup', () => Vault.setupPin());
act('vault:changepin', () => Vault.changePin());
act('vault:types', () => Vault.manageTypes());
act('vault:typenew', () => Vault.editType());
act('vault:typeedit', (a) => Vault.editType(Vault.type(a.dataset.id)));
act('vault:typedel', (a) => Vault.delType(a.dataset.id));
act('vault:reset', async () => {
  const n = Store.s.creds.length;
  const v = await promptDlg('Reset the vault', `Use this only if the Vault PIN is lost. All ${n} saved credentials will be permanently deleted and you will set a new PIN. Type RESET VAULT to continue.`, { ok: 'Reset vault' });
  if (v === null) return; if (v.trim().toUpperCase() !== 'RESET VAULT') { toast('Not reset — you must type RESET VAULT', 'warn'); return; }
  await Backup.snapshot('before-vault-reset');
  Store.commit((s) => { s.creds = []; s.settings.vault = null; });
  Auth.audit('vault_reset', 'vault', `Vault reset: ${n} encrypted credentials deleted`);
  toast('Vault reset. Set a new Vault PIN to continue.'); Vault.setupPin();
});
act('vault:del', async (a) => { const c = credOf(a); if (await confirmDlg('Delete this credential?', { danger: true, ok: 'Delete' })) Rec.remove('creds', c, `${Vault.typeName(c)} credential`, 'vault'); });
