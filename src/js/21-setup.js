/* ==========================================================================
   21-setup.js — First-run Setup Wizard.
   Step 1 Company (name, logo, contact, registration)  Step 2 Business
   (currency + your own services)  Step 3 Look & feel (themes)  Step 4 Admin
   account. Nothing is saved until "Create workspace"; then the company
   profile, services, theme and the administrator are written and the user is
   signed in.
   ========================================================================== */
const INDUSTRIES = ['Accounting & Tax', 'Marketing / Digital Agency', 'IT & Software', 'Consulting', 'Legal', 'Real Estate', 'Education & Training', 'Healthcare', 'Retail & E-commerce', 'Manufacturing', 'Construction', 'Finance & Insurance', 'Travel & Hospitality', 'Freelancer / Individual', 'Other'];
const needsSetup = () => !Store.s.users.length && !Store.s.settings.setupDone;

const Setup = {
  step: 0,
  W: { name: '', industry: '', phone: '', email: '', website: '', address: '', country: '', dialCode: '', ntn: '', logo: '', currency: 'USD', services: '', admName: '', admUser: '', admEmail: '', customColor: '#1d64c8' },
  steps: [['Company', 'Name, logo & contact'], ['Business', 'Currency & services'], ['Look & feel', 'Choose a theme'], ['Admin account', 'Your sign-in']],

  /* Read the visible form into W (keeps values when moving back and forth). */
  collect() {
    const f = $('#su-form'); if (!f) return;
    Array.from(f.elements).forEach((el) => { if (el.name && el.name in this.W && el.type !== 'file' && el.type !== 'password') this.W[el.name] = el.value; });
  },
  valid() {
    const f = $('#su-form'); const W = this.W; const errs = {};
    if (this.step === 0) {
      if (!W.name.trim()) errs.name = 'Enter your company name';
      if (W.email && Valid.email(W.email)) errs.email = Valid.email(W.email);
      if (W.phone && Valid.mobile(W.phone)) errs.phone = Valid.mobile(W.phone);
    }
    if (this.step === 3) {
      if (!W.admName.trim()) errs.admName = 'Enter your full name';
      if (!/^[a-z0-9._-]{3,30}$/i.test(W.admUser.trim())) errs.admUser = 'Username: 3-30 letters, numbers, dot, dash or underscore';
      if (W.admEmail && Valid.email(W.admEmail)) errs.admEmail = Valid.email(W.admEmail);
      const pe = Auth.policy(f.password.value); if (pe) errs.password = pe;
      else if (f.password.value !== f.confirm.value) errs.confirm = 'Passwords do not match';
    }
    $$('[data-err-for]', f).forEach((e) => { e.textContent = errs[e.dataset.errFor] || ''; });
    return !Object.keys(errs).length;
  },
  fld(name, label, o = {}) {
    const v = this.W[name] || '';
    return html`<label class="fld ${o.full ? 'full' : ''}"><span>${label}${o.req ? html`<b class="req">*</b>` : ''}</span><input name="${name}" value="${v}" type="${o.type || 'text'}" placeholder="${o.ph || ''}" ${o.req ? raw('required') : ''} autocomplete="off"><small class="err" data-err-for="${name}"></small></label>`;
  },
  body() {
    const W = this.W;
    if (this.step === 0) return html`<div class="su-logo-row"><div class="su-logo-prev" data-logo-prev>${brandLogo()}</div><div><b>Company logo</b><p class="muted sm">PNG, JPG or SVG. Optional: until you upload one, a badge with your company's initials is used.</p><input type="file" accept="image/*" data-su-logo aria-label="Upload logo"> ${W.logo ? html`<button type="button" class="btn sm ghost" data-su-logo-clear>Remove</button>` : ''}</div></div>
      <div class="grid-form">${this.fld('name', 'Company name', { req: true, full: true, ph: 'e.g. Acme Solutions' })}
      <label class="fld"><span>Industry</span><select name="industry"><option value="">— Select —</option>${INDUSTRIES.map((i) => html`<option ${i === W.industry ? raw('selected') : ''}>${i}</option>`)}</select></label>${this.fld('country', 'Country', { ph: 'e.g. United Kingdom' })}
      ${this.fld('phone', 'Phone', { type: 'tel', ph: '+1 555 000 0000' })}${this.fld('email', 'Email', { type: 'email', ph: 'info@company.com' })}${this.fld('website', 'Website', { ph: 'www.company.com' })}${this.fld('ntn', 'Tax / VAT / Registration no.', { ph: 'Optional' })}
      <label class="fld full"><span>Address</span><textarea name="address" rows="2" placeholder="Street, city">${W.address}</textarea></label></div>`;
    if (this.step === 1) return html`<div class="grid-form"><label class="fld full"><span>Currency</span><select name="currency">${CURRENCIES.map(([code, sym, n]) => html`<option value="${code}" ${code === W.currency ? raw('selected') : ''}>${code} (${sym.trim()}) · ${n}</option>`)}</select><small class="help">Used for invoices, payments and reports. You can change it later in Settings.</small></label>
      ${this.fld('dialCode', 'Phone country code', { full: true, ph: 'e.g. 44, 92, 971 (used for WhatsApp links)' })}
      <label class="fld full"><span>Your services / products <small class="muted">(optional)</small></span><textarea name="services" rows="7" placeholder="One per line. Optional price after a comma.&#10;Website Design, 1500&#10;Monthly Consulting, 400&#10;Logo Design">${W.services}</textarea><small class="help">This list starts empty. Add, rename or remove services any time in Settings › Master Lists.</small></label></div>`;
    if (this.step === 2) return html`<p class="muted">Pick a look. Each team member can change their own theme later, and Light / Dark mode is one click away.</p><div data-theme-gallery>${ThemeUI.gallery(false)}</div>`;
    return html`<div class="grid-form">${this.fld('admName', 'Your full name', { req: true, full: true })}${this.fld('admUser', 'Username', { req: true, ph: 'e.g. admin' })}${this.fld('admEmail', 'Email', { type: 'email' })}
      <label class="fld full"><span>Password<b class="req">*</b></span><div class="pw-wrap"><input name="password" type="password" autocomplete="new-password" data-strength required><button type="button" class="icon-btn" data-pw-eye aria-label="Show password">${icon('eye')}</button></div><div class="pw-meter" data-meter><i></i></div><small class="help">8+ characters with upper &amp; lower case letters and a number.</small><small class="err" data-err-for="password"></small></label>
      <label class="fld full"><span>Confirm password<b class="req">*</b></span><input name="confirm" type="password" autocomplete="new-password" required><small class="err" data-err-for="confirm"></small></label></div>
      <p class="muted sm">You will be the Super Admin and can add more users and roles later in Settings.</p>`;
  },
  /* keep the in-memory company in sync so brandLogo() previews what was typed/uploaded */
  sync() { const c = Store.s.settings.company; c.name = this.W.name.trim(); if (this.W.logo) c.logo = this.W.logo; else delete c.logo; },
  render() {
    this.sync();
    const last = this.step === this.steps.length - 1;
    $('#app').innerHTML = String(html`<div class="auth-wrap setup-wrap"><div class="auth-brand"><div class="auth-logo" data-brand-prev>${brandLogo()}</div><h1 data-brand-name>${this.W.name.trim() || 'Welcome'}</h1><p>Let's set up your CRM. It takes about a minute and everything can be changed later.</p>
      <ol class="su-steps">${this.steps.map(([t, d], i) => html`<li class="${i === this.step ? 'on' : i < this.step ? 'done' : ''}"><span>${i < this.step ? icon('check') : i + 1}</span><div><b>${t}</b><small>${d}</small></div></li>`)}</ol></div>
      <div class="auth-side"><div class="auth-card su-card"><h2>${this.steps[this.step][0]}</h2><p class="muted">Step ${this.step + 1} of ${this.steps.length}</p>
        <form id="su-form" novalidate autocomplete="off">${this.body()}
        <div class="su-actions">${this.step > 0 ? html`<button type="button" class="btn ghost" data-su-back>Back</button>` : html`<span></span>`}<button class="btn primary lg" type="submit">${last ? 'Create workspace' : 'Continue'}</button></div></form>
        </div></div></div>`);
    App.bindAuthCommon();
    const f = $('#su-form');
    f.onsubmit = (e) => { e.preventDefault(); this.collect(); if (!this.valid()) return; if (last) this.finish(f); else { this.step++; this.render(); } };
    const back = $('[data-su-back]'); if (back) back.onclick = () => { this.collect(); this.step--; this.render(); };
    // live brand preview (step 1)
    if (this.step === 0) {
      f.elements.name.addEventListener('input', () => { this.W.name = f.elements.name.value; this.preview(); });
      const lg = $('[data-su-logo]');
      lg.onchange = async () => { const file = lg.files[0]; if (!file) return; try { this.W.logo = await resizeImage(file, 600); } catch (e) { toast('Could not read that image', 'err'); return; } this.collect(); this.render(); };
      const cl = $('[data-su-logo-clear]'); if (cl) cl.onclick = () => { this.W.logo = ''; this.collect(); this.render(); };
    }
    this.preview();
    if (this.step === 2) { $$('[data-theme-gallery]').forEach((g) => { g.addEventListener('click', () => setTimeout(() => this.preview(), 30)); }); }
    const first = f.querySelector('input:not([type=file]):not([type=hidden]),textarea'); if (first && this.step !== 2) first.focus();
  },
  /* Reflect the company name/logo on the left panel while typing */
  preview() {
    const nm = this.W.name.trim(); const h = $('[data-brand-name]'); if (h) h.textContent = nm || 'Welcome';
    const lg = $('[data-brand-prev]'); if (lg) { this.sync(); lg.innerHTML = String(brandLogo()); const sp = $('[data-logo-prev]'); if (sp) sp.innerHTML = String(brandLogo()); }
  },
  async finish(f) {
    const W = this.W; const btnEl = f.querySelector('button[type=submit]'); btnEl.disabled = true; btnEl.textContent = 'Creating…';
    const s = Store.s; const cur = CURRENCIES.find((c) => c[0] === W.currency) || CURRENCIES[0];
    const skin = Theme.skinId(); const now = new Date().toISOString();
    Object.assign(s.settings.company, { name: W.name.trim(), industry: W.industry, phone: W.phone.trim(), email: W.email.trim(), website: W.website.trim(), address: W.address.trim(), country: W.country.trim(), dialCode: W.dialCode.replace(/\D/g, ''), ntn: W.ntn.trim() });
    if (W.logo) s.settings.company.logo = W.logo; else delete s.settings.company.logo;
    s.settings.currency = { code: cur[0], symbol: cur[1] };
    s.settings.defaultSkin = skin;
    // services typed by the owner: "Name, price" per line
    const seen = new Set(); s.lists.services = [];
    String(W.services || '').split(/\n+/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
      const m = line.match(/^(.*?)[,|;]\s*([\d.,]+)\s*$/); const name = (m ? m[1] : line).trim(); const fee = m ? Number(m[2].replace(/,/g, '')) || 0 : 0;
      if (!name || seen.has(name.toLowerCase())) return; seen.add(name.toLowerCase());
      s.lists.services.push({ id: 'svc_' + (s.lists.services.length + 1), name, fee });
    });
    const admin = { id: 'u_admin', username: W.admUser.trim().toLowerCase(), name: W.admName.trim(), email: W.admEmail.trim(), roleId: 'role_super', status: 'active', mustChange: false, createdAt: now };
    await Auth.setPassword(admin, f.password.value);
    s.users.push(admin);
    s.settings.setupDone = true; s.settings.setupAt = now;
    s.audit.unshift({ id: uid('a'), at: now, user: 'system', userId: '', action: 'create', module: 'settings', summary: `Setup completed for "${W.name.trim()}"; Super Admin "${admin.username}" created` });
    Store.saveNow();
    await Cloud.push();
    Theme.save({ skin });
    setFavicon(); document.title = Brand.appName();
    Auth.start(admin); App.enter();
    toast(`Welcome to ${Brand.appName()}! Start by adding your first client.`, 'ok', { timeout: 6000 });
  }
};
App.showSetup = function () { Setup.step = 0; if (!Setup.W.name) Setup.W.name = (Store.s.settings.company || {}).name || ''; Setup.render(); };
