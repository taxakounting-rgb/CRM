/* ==========================================================================
   04-router.js — App shell, auth screens (sign in, register, 2FA, forced
   password change, lock screen), hash router (#/clients/A1), theme, shortcuts.
   ========================================================================== */
const Views = {};

const Router = {
  cur: { name: '', params: [], query: {} },
  pending: false,
  nav() {
    const items = [
      ['dashboard', 'Dashboard', 'dashboard', '#/dashboard'], ['clients', 'Clients', 'clients', '#/clients'], ['tasks', 'Tasks', 'tasks', '#/tasks'],
      ['services', 'Services', 'services', '#/services'], ['compliance', 'Deadlines', 'compliance', '#/compliance'],
      ['vault', 'Credential Vault', 'vault', '#/vault'], ['invoices', 'Invoices & Payments', 'invoices', '#/invoices'], ['documents', 'Documents', 'documents', '#/documents'],
      ['team', 'Team', 'team', '#/team'], ['reports', 'Reports', 'reports', '#/reports'], ['audit', 'Audit Log', 'audit', '#/audit'], ['settings', 'Settings', 'settings', '#/settings']
    ];
    return items.filter(([m]) => m === 'settings' ? (Auth.can('settings') || Auth.can('users')) : Auth.can(m)).map(([mod, label, ic, href]) => ({ mod, label, ic, href }));
  },
  parse() {
    const h = (location.hash || '#/dashboard').slice(2); const [path, qs] = h.split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent); const query = {};
    (qs || '').split('&').filter(Boolean).forEach((kv) => { const [k, v] = kv.split('='); query[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
    return { name: parts[0] || 'dashboard', params: parts.slice(1), query };
  },
  go() {
    if (!Auth.user || Auth.locked) return;
    const r = this.parse();
    const changed = r.name !== this.cur.name || r.params.join('/') !== this.cur.params.join('/');
    this.cur = r;
    this.render(changed);
    App.renderChrome();
    if (changed) { const m = $('#main'); if (m) m.scrollTop = 0; window.scrollTo(0, 0); document.body.classList.remove('nav-open'); }
  },
  refresh() {
    if (this.pending) return; this.pending = true;
    requestAnimationFrame(() => { this.pending = false; if (Auth.user && !Auth.locked && $('#main')) { this.render(false); App.renderChrome(); } });
  },
  render(first) {
    const main = $('#main'); if (!main) return;
    const v = Views[this.cur.name];
    const permMod = v && (v.perm || this.cur.name);
    // Remember focus so debounced re-renders don't steal the caret
    const ae = document.activeElement; const fid = ae && main.contains(ae) && ae.id; const sel = fid && ae.selectionStart !== undefined ? [ae.selectionStart, ae.selectionEnd] : null;
    let out;
    if (!v) out = emptyState('Page not found', 'The page you are looking for does not exist.', btn('Go to dashboard', 'nav', { extra: 'data-href="#/dashboard"', cls: 'primary' }));
    else if (permMod !== 'any' && !(v.allow ? v.allow() : Auth.can(permMod))) out = emptyState('Access denied', 'Your role does not have permission to view this page. Ask the administrator to update your role permissions.');
    else { try { out = v.render(this.cur.params, this.cur.query); } catch (e) { console.warn(e); out = emptyState('Something went wrong', e.message); } }
    main.ondragover = main.ondrop = main.ondragleave = null;
    main.innerHTML = String(License.banner()) + String(out);
    if (v && v.mount) { try { v.mount(main, this.cur.params, this.cur.query); } catch (e) { console.warn(e); } }
    Charts.hydrate(main);
    if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } } }
  }
};

const App = {
  async boot() {
    setFavicon();
    Theme.apply();
    if (!Crypto.ok()) { $('#app').innerHTML = String(html`<div class="auth-wrap"><div class="auth-card"><h2>Browser not supported</h2><p>This app needs Web Crypto. Please open it in a current version of Chrome or Edge.</p></div></div>`); return; }
    await Store.load();
    await Seed.ensure();
    await License.load();
    setFavicon();
    await Cloud.init();
    Theme.apply(); document.title = Brand.appName();
    Backup.autoSnapshot();
    window.addEventListener('hashchange', () => Router.go());
    Bus.on('change', () => { Auth._cache = null; Router.refresh(); });
    setInterval(async () => { const before = License.info.status; await License.load(); if (License.info.status !== before) { App.renderChrome(); Router.refresh(); } }, 3600000);
    if (!Cloud.linked()) { this.showGate(); return; }
    if (needsSetup()) { this.showSetup(); return; }
    const r = Auth.resume();
    if (r && r.locked) { Auth.locked = true; this.showLock(); }
    else if (r) this.enter();
    else this.showLogin();
  },

  /* ---------- Auth screens ---------- */
  authFrame(inner) {
    const c = Store.s.settings.company || {};
    return html`<div class="auth-wrap"><div class="auth-brand"><div class="auth-logo">${brandLogo()}</div><h1>${Brand.appName()}</h1><p>Clients, tasks, invoices, documents and reports, all in one workspace.</p><ul class="auth-feats"><li>${icon('check')} Clients, tasks &amp; deadlines</li><li>${icon('check')} Invoices, payments &amp; expenses</li><li>${icon('check')} Documents &amp; encrypted credential vault</li><li>${icon('check')} Sign in from any computer: your data is saved in the cloud</li></ul><p class="auth-foot">${[c.website, c.phone].filter(Boolean).join(' · ')}${c.address ? html`<br>${c.address}` : ''}</p></div>
      <div class="auth-side"><div class="auth-card">${inner}</div><button type="button" class="btn ghost sm theme-mini" data-theme-toggle>${icon(Theme.dark() ? 'sun' : 'moon')}<span>${Theme.dark() ? 'Light' : 'Dark'} mode</span></button></div></div>`;
  },
  /* First screen: company Sign up / Sign in */
  showGate(msg = '') {
    Auth.locked = false;
    if (!Cloud.avail) { $('#app').innerHTML = String(this.authFrame(html`<h2>Server not connected</h2><div class="note">The cloud database is not connected yet. Open this app from your hosted web address (Vercel) after the owner has connected the database. See README for the 3 setup steps.</div>`)); this.bindAuthCommon(); return; }
    $('#app').innerHTML = String(this.authFrame(html`<h2>Welcome</h2><p class="muted">Start your own CRM in minutes, or sign in to your company's CRM from anywhere.</p>
      ${msg ? html`<div class="note ok">${msg}</div>` : ''}
      <div class="gate-btns"><button type="button" class="btn primary block lg" data-gate="signup">Sign up (new company)</button><button type="button" class="btn block lg" data-gate="signin">Sign in (existing company)</button></div>
      <p class="sm muted center">Your data is stored safely in the cloud. After the company sign-in, every employee logs in with their own username and password.</p>`));
    this.bindAuthCommon();
    $('[data-gate=signup]').onclick = () => this.showCompanySignup();
    $('[data-gate=signin]').onclick = () => this.showCompanyLogin();
  },
  showCompanySignup() {
    $('#app').innerHTML = String(this.authFrame(html`<h2>Create your company account</h2><p class="muted">Step 1: the company's own sign-in. Next you will add company details and the first administrator.</p>
      <form id="co-form" novalidate class="grid-form">
        <label class="fld full"><span>Company name<b class="req">*</b></span><input name="name" autocomplete="organization" required autofocus><small class="err" data-err-for="name"></small></label>
        <label class="fld full"><span>Company username<b class="req">*</b></span><input name="id" autocomplete="off" autocapitalize="none" required placeholder="e.g. acme-solutions"><small class="help">3-30 letters, numbers, dot, dash. This is how your company signs in, from any computer.</small><small class="err" data-err-for="id"></small></label>
        <label class="fld full"><span>Company password<b class="req">*</b></span><div class="pw-wrap"><input name="password" type="password" autocomplete="new-password" required data-strength><button type="button" class="icon-btn" data-pw-eye aria-label="Show password">${icon('eye')}</button></div><div class="pw-meter" data-meter><i></i></div><small class="help">8+ characters with upper &amp; lower case letters and a number.</small><small class="err" data-err-for="password"></small></label>
        <label class="fld full"><span>Confirm password<b class="req">*</b></span><input name="confirm" type="password" autocomplete="new-password" required><small class="err" data-err-for="confirm"></small></label>
        <button class="btn primary block lg full" type="submit">Create company</button><button type="button" class="btn ghost block full" data-back>Back</button>
      </form>`));
    this.bindAuthCommon();
    $('[data-back]').onclick = () => this.showGate();
    const f = $('#co-form');
    f.onsubmit = async (e) => {
      e.preventDefault(); const v = Object.fromEntries(new FormData(f)); const errs = {}; const id = String(v.id || '').trim().toLowerCase();
      if (!String(v.name || '').trim()) errs.name = 'Enter your company name';
      if (!/^[a-z0-9._-]{3,30}$/.test(id)) errs.id = 'Use 3-30 letters, numbers, dot, dash or underscore';
      const pe = Auth.policy(v.password); if (pe) errs.password = pe; else if (v.password !== v.confirm) errs.confirm = 'Passwords do not match';
      if (Object.keys(errs).length) { showErrors(f, errs); return; }
      const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Creating…';
      try {
        if (!(await Cloud.idFree(id))) { showErrors(f, { id: 'This company username is already taken. Please choose another.' }); b.disabled = false; b.textContent = 'Create company'; return; }
        await Cloud.signupCompany(id, v.name.trim(), v.password);
        this.showSetup();
      } catch (ex) { showErrors(f, { id: ex.message }); b.disabled = false; b.textContent = 'Create company'; }
    };
  },
  showCompanyLogin(msg = '') {
    const remembered = localStorage.getItem('crm_co_remember') || '';
    $('#app').innerHTML = String(this.authFrame(html`<h2>Company sign in</h2><p class="muted">Enter your company's username and password.</p>
      ${msg ? html`<div class="note ok">${msg}</div>` : ''}
      <form id="col-form" novalidate>
        <label class="fld"><span>Company username</span><input name="id" autocomplete="off" autocapitalize="none" value="${remembered}" required autofocus></label>
        <label class="fld"><span>Company password</span><div class="pw-wrap"><input name="password" type="password" autocomplete="current-password" required><button type="button" class="icon-btn" data-pw-eye aria-label="Show password">${icon('eye')}</button></div></label>
        <p class="err" data-e role="alert"></p>
        <button class="btn primary block lg" type="submit">Continue</button><button type="button" class="btn ghost block" data-back>Back</button>
      </form>`));
    this.bindAuthCommon();
    $('[data-back]').onclick = () => this.showGate();
    const f = $('#col-form');
    f.onsubmit = async (e) => {
      e.preventDefault(); const err = $('[data-e]'); err.textContent = ''; const id = f.id.value.trim().toLowerCase();
      if (!id || !f.password.value) { err.textContent = 'Enter the company username and password.'; return; }
      const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Signing in…';
      try { await Cloud.signIn(id, f.password.value); localStorage.setItem('crm_co_remember', id); needsSetup() ? this.showSetup() : this.showLogin(); }
      catch (ex) { err.textContent = ex.message; f.password.value = ''; b.disabled = false; b.textContent = 'Continue'; f.classList.add('shake'); setTimeout(() => f.classList.remove('shake'), 400); }
    };
  },
  showLogin(tab = 'signin', msg = '') {
    Auth.locked = false;
    const remembered = localStorage.getItem('crm_remember') || '';
    const allowReg = Store.s.settings.allowRegistration;
    const tabs = html`<div class="auth-tabs" role="tablist"><button type="button" role="tab" class="${tab === 'signin' ? 'on' : ''}" data-auth-tab="signin" aria-selected="${tab === 'signin'}">Employee sign in</button>${allowReg ? html`<button type="button" role="tab" class="${tab === 'register' ? 'on' : ''}" data-auth-tab="register" aria-selected="${tab === 'register'}">Request access</button>` : ''}</div>`;
    const signin = html`<h2>${Brand.name() || 'Welcome back'}</h2><p class="muted">Employee sign in: enter your own username and password.</p>
      ${msg ? html`<div class="note ok">${msg}</div>` : ''}
      <form id="login-form" novalidate autocomplete="on">
        <label class="fld"><span>Username or email</span><input name="username" autocomplete="username" value="${remembered}" required autofocus></label>
        <label class="fld"><span>Password</span><div class="pw-wrap"><input name="password" type="password" autocomplete="current-password" required><button type="button" class="icon-btn" data-pw-eye aria-label="Show password">${icon('eye')}</button></div><small class="warn-txt" data-caps hidden>Caps Lock is on</small></label>
        <div class="row-between"><label class="chk"><input type="checkbox" name="remember" ${remembered ? raw('checked') : ''}> <span>Remember username</span></label><a href="#" data-forgot>Forgot password?</a></div>
        <p class="err" data-login-err role="alert"></p>
        <button class="btn primary block lg" type="submit">Sign in</button>
      </form><p class="sm center mt"><a href="#" data-switch-co>Not your company? Switch company</a></p>`;
    const register = html`<h2>Create your account</h2><p class="muted">${Store.s.settings.requireApproval ? 'An administrator will review and approve your account.' : 'Your account will be active immediately.'}</p>
      <form id="reg-form" novalidate class="grid-form">
        <label class="fld full"><span>Full name<b class="req">*</b></span><input name="name" autocomplete="name" required><small class="err" data-err-for="name"></small></label>
        <label class="fld"><span>Username<b class="req">*</b></span><input name="username" autocomplete="username" required><small class="err" data-err-for="username"></small></label>
        <label class="fld"><span>Mobile</span><input name="mobile" inputmode="tel" placeholder="Phone"><small class="err" data-err-for="mobile"></small></label>
        <label class="fld full"><span>Email<b class="req">*</b></span><input name="email" type="email" autocomplete="email" required><small class="err" data-err-for="email"></small></label>
        <label class="fld full"><span>Password<b class="req">*</b></span><div class="pw-wrap"><input name="password" type="password" autocomplete="new-password" required data-strength><button type="button" class="icon-btn" data-pw-eye aria-label="Show password">${icon('eye')}</button></div><div class="pw-meter" data-meter><i></i></div><small class="help">8+ characters with upper &amp; lower case letters and a number.</small><small class="err" data-err-for="password"></small></label>
        <label class="fld full"><span>Confirm password<b class="req">*</b></span><input name="confirm" type="password" autocomplete="new-password" required><small class="err" data-err-for="confirm"></small></label>
        <label class="chk full"><input type="checkbox" name="agree"> <span>I will keep client information confidential.</span></label><small class="err full" data-err-for="agree"></small>
        <button class="btn primary block lg full" type="submit">Create account</button>
      </form>`;
    $('#app').innerHTML = String(this.authFrame(html`${tabs}${tab === 'register' && allowReg ? register : signin}`));
    this.bindAuthCommon();
    $$('[data-auth-tab]').forEach((b) => b.onclick = () => this.showLogin(b.dataset.authTab));
    const lf = $('#login-form');
    if (lf) {
      lf.onsubmit = async (e) => {
        e.preventDefault(); const err = $('[data-login-err]'); err.textContent = '';
        const u = lf.username.value.trim(), p = lf.password.value;
        if (!u || !p) { err.textContent = 'Enter your username and password.'; return; }
        const b = lf.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Signing in…';
        const r = await Auth.login(u, p);
        b.disabled = false; b.textContent = 'Sign in';
        if (r.error) { err.textContent = r.error; lf.password.value = ''; lf.password.focus(); lf.classList.add('shake'); setTimeout(() => lf.classList.remove('shake'), 400); return; }
        if (lf.remember.checked) localStorage.setItem('crm_remember', u); else localStorage.removeItem('crm_remember');
        this.afterPassword(r.user, r.next);
      };
      const sw = $('[data-switch-co]'); if (sw) sw.onclick = (e) => { e.preventDefault(); Actions['cloud:leave'](); };
      $('[data-forgot]').onclick = (e) => { e.preventDefault(); Modal.open({ title: 'Forgot password', size: 'sm', body: html`<p>For security, passwords are stored as one-way hashes and cannot be recovered.</p><p>Please ask your <b>Super Admin / Admin</b> to reset it from <b>Settings › Users › Reset password</b>. You will be asked to choose a new password at your next sign-in.</p>`, foot: html`<button type="button" class="btn primary" data-close>OK</button>` }); };
    }
    const rf = $('#reg-form');
    if (rf) rf.onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(rf)); f.agree = rf.agree.checked; const errs = {};
      if (!f.name.trim()) errs.name = 'Enter your full name';
      if (!f.username.trim()) errs.username = 'Choose a username';
      if (!f.email.trim()) errs.email = 'Email is required'; else if (Valid.email(f.email)) errs.email = Valid.email(f.email);
      if (Valid.mobile(f.mobile)) errs.mobile = Valid.mobile(f.mobile);
      const pe = Auth.policy(f.password); if (pe) errs.password = pe;
      if (f.password !== f.confirm) errs.confirm = 'Passwords do not match';
      if (!f.agree) errs.agree = 'Please confirm to continue';
      if (Object.keys(errs).length) { showErrors(rf, errs); return; }
      const b = rf.querySelector('button[type=submit]'); b.disabled = true;
      const r = await Auth.register(f); b.disabled = false;
      if (r.error) { showErrors(rf, { [r.field || 'username']: r.error }); return; }
      this.showLogin('signin', r.pending ? 'Account created. You can sign in once an administrator approves it.' : 'Account created. You can sign in now.');
    };
  },
  bindAuthCommon() {
    $$('[data-pw-eye]').forEach((b) => b.onclick = () => { const i = b.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; b.setAttribute('aria-label', i.type === 'password' ? 'Show password' : 'Hide password'); b.classList.toggle('on', i.type === 'text'); });
    $$('input[type=password]').forEach((i) => i.addEventListener('keyup', (e) => { const c = $('[data-caps]'); if (c && e.getModifierState) c.hidden = !e.getModifierState('CapsLock'); }));
    $$('[data-strength]').forEach((i) => i.addEventListener('input', () => { const m = i.closest('.fld').querySelector('[data-meter]'); const s = Auth.strength(i.value); m.dataset.s = s; m.title = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][s]; }));
    $$('[data-theme-toggle]').forEach((b) => b.onclick = () => { Theme.toggle(); const t = $('.theme-mini'); if (t) t.innerHTML = String(html`${icon(Theme.dark() ? 'sun' : 'moon')}<span>${Theme.dark() ? 'Light' : 'Dark'} mode</span>`); });
  },
  afterPassword(u, next) {
    if (next === '2fa') return this.show2FA(u);
    if (next === 'setup2fa') return this.showSetup2FA(u, true);
    if (next === 'change') return this.showChangePw(u);
    Auth.start(u); this.enter();
  },
  show2FA(u) {
    $('#app').innerHTML = String(this.authFrame(html`<h2>Two-step verification</h2><p class="muted">Enter the 6-digit code from your authenticator app for <b>${u.username}</b>.</p><form id="tf" novalidate><label class="fld"><span>Authentication code</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" class="otp" required autofocus></label><p class="err" data-e role="alert"></p><button class="btn primary block lg">Verify</button><button type="button" class="btn ghost block" data-back>Back to sign in</button></form>`));
    this.bindAuthCommon();
    const f = $('#tf'); let tries = 0;
    $('[data-back]').onclick = () => this.showLogin();
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (await Crypto.verifyTotp(u.totp.secret, f.code.value)) { this.afterPassword(u, u.mustChange ? 'change' : 'app'); return; }
      tries++; $('[data-e]').textContent = 'Invalid code. Check your phone time and try again.';
      Auth.audit('2fa_failed', 'auth', `Invalid 2FA code for ${u.username}`, { user: u.username });
      if (tries >= 5) this.showLogin('signin');
    };
  },
  showSetup2FA(u, forced) {
    const secret = Crypto.newTotpSecret();
    const issuer = Brand.appName(); const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(u.username)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
    $('#app').innerHTML = String(this.authFrame(html`<h2>Set up two-step verification</h2><p class="muted">${forced ? 'Your administrator requires 2FA for this account. ' : ''}Scan the QR code with Google Authenticator, Microsoft Authenticator or Authy, then enter the code.</p><div class="qr-box">${raw(QR.svg(uri, 4))}</div><p class="sm">Or enter this key manually:<br><code class="secret">${secret.replace(/(.{4})/g, '$1 ')}</code></p><form id="sf" novalidate><label class="fld"><span>6-digit code</span><input name="code" inputmode="numeric" class="otp" maxlength="7" required autofocus></label><p class="err" data-e></p><button class="btn primary block lg">Verify &amp; enable</button><button type="button" class="btn ghost block" data-back>Cancel</button></form>`));
    this.bindAuthCommon();
    $('[data-back]').onclick = () => this.showLogin();
    $('#sf').onsubmit = async (e) => {
      e.preventDefault();
      if (!(await Crypto.verifyTotp(secret, $('#sf').code.value))) { $('[data-e]').textContent = 'Code does not match. Try the next code.'; return; }
      Store.commit(() => { u.totp = { secret, enabled: true, at: new Date().toISOString() }; }, { allowRO: true });
      Auth.audit('2fa_enabled', 'users', `2FA enabled for ${u.username}`, { user: u.username, recordId: u.id });
      this.afterPassword(u, u.mustChange ? 'change' : 'app');
    };
  },
  showChangePw(u) {
    $('#app').innerHTML = String(this.authFrame(html`<h2>Set a new password</h2><p class="muted">${u.isDefault ? 'You are using the default administrator password. ' : ''}For your security, please choose a new password before continuing.</p><form id="cp" novalidate><label class="fld"><span>New password</span><div class="pw-wrap"><input name="p1" type="password" autocomplete="new-password" data-strength required autofocus><button type="button" class="icon-btn" data-pw-eye aria-label="Show password">${icon('eye')}</button></div><div class="pw-meter" data-meter><i></i></div><small class="help">8+ characters with upper &amp; lower case letters and a number.</small></label><label class="fld"><span>Confirm new password</span><input name="p2" type="password" autocomplete="new-password" required></label><p class="err" data-e role="alert"></p><button class="btn primary block lg">Save &amp; continue</button><button type="button" class="btn ghost block" data-back>Cancel</button></form>`));
    this.bindAuthCommon();
    $('[data-back]').onclick = () => this.showLogin();
    $('#cp').onsubmit = async (e) => {
      e.preventDefault(); const f = $('#cp'); const err = $('[data-e]');
      const pe = Auth.policy(f.p1.value); if (pe) { err.textContent = pe; return; }
      if (f.p1.value !== f.p2.value) { err.textContent = 'Passwords do not match.'; return; }
      if (await Auth.checkPassword(u, f.p1.value)) { err.textContent = 'New password must be different from the current one.'; return; }
      await Auth.setPassword(u, f.p1.value); Store.commit(() => { u.mustChange = false; }, { allowRO: true });
      Auth.start(u); Auth.audit('password_change', 'users', `${u.username} changed password`, { recordId: u.id });
      this.enter(); toast('Password updated. Welcome!');
    };
  },
  showLock() {
    const u = Auth.user; if (!u) return this.showLogin();
    Modal.closeAll();
    $('#app').innerHTML = String(html`<div class="lock-wrap"><div class="auth-card lock-card"><div class="lock-logo">${brandLogo()}</div>${avatar(u.name, (DB.member(u.memberId) || {}).photo, 64)}<h2>${u.name}</h2><p class="muted">${icon('lock')} Screen locked. Enter your password to continue.</p><form id="lk" novalidate><div class="pw-wrap"><input name="p" type="password" autocomplete="current-password" aria-label="Password" required autofocus><button type="button" class="icon-btn" data-pw-eye aria-label="Show password">${icon('eye')}</button></div><p class="err" data-e role="alert"></p><button class="btn primary block lg">Unlock</button></form><button type="button" class="btn ghost block" data-out>Sign in as a different user</button></div></div>`);
    this.bindAuthCommon();
    let tries = 0;
    $('[data-out]').onclick = () => { Auth.locked = false; Auth.logout('signed out from lock screen'); };
    $('#lk').onsubmit = async (e) => {
      e.preventDefault();
      if (await Auth.checkPassword(u, $('#lk').p.value)) { Auth.unlocked(); this.enter(); return; }
      tries++; $('[data-e]').textContent = 'Incorrect password.'; $('#lk').p.value = '';
      if (tries >= 5) { Auth.locked = false; Auth.logout('signed out after 5 failed unlock attempts'); }
    };
  },

  /* ---------- Main shell ---------- */
  enter() {
    Theme.loadUser();
    if (Store.s.settings.demoRemovedNotice) { const n = Store.s.settings.demoRemovedNotice; delete Store.s.settings.demoRemovedNotice; Store.saveNow(); setTimeout(() => toast(`Sample data removed (${n} demo clients). Your own records were kept. Add your real clients now; they are saved permanently.`, 'info', { timeout: 9000 }), 600); }
    $('#app').innerHTML = String(html`<div class="shell ${localStorage.getItem('crm_side') === 'min' ? 'side-min' : ''}">
      <aside class="side" aria-label="Main navigation"><div class="side-top"><a href="#/dashboard" class="side-logo" aria-label="Dashboard">${brandLogo()}</a><button type="button" class="icon-btn side-collapse" data-act="side:toggle" aria-label="Collapse sidebar">‹</button></div><nav id="sidenav"></nav><div class="side-user" id="sideuser"></div></aside>
      <div class="side-scrim" data-act="side:close"></div>
      <div class="mainwrap"><header class="top" id="topbar"></header><main id="main" tabindex="-1"></main>
      <footer class="foot">${Brand.footer()}</footer></div>
      <nav class="bnav" id="bnav" aria-label="Quick navigation"></nav></div>`);
    Notify.generate();
    if (!location.hash || location.hash === '#/') location.hash = '#/dashboard';
    Router.cur = { name: '', params: [], query: {} };
    Router.go();
    if (Store.s.users.some((x) => x.status === 'pending') && Auth.can('users', 'edit')) toast('There are registrations waiting for approval in Settings › Users.', 'info');
  },
  renderChrome() {
    if (!Auth.user || !$('#sidenav')) return;
    const ft = $('.foot'); if (ft) ft.innerHTML = String(Brand.footer());
    const sl = $('.side-logo'); if (sl) { const lg = String(brandLogo()); if (sl.dataset.k !== lg.length + ':' + lg.slice(-40)) { sl.innerHTML = lg; sl.dataset.k = lg.length + ':' + lg.slice(-40); } }
    if (document.title !== Brand.appName() && !document.body.classList.contains('printing')) document.title = Brand.appName();
    const nav = Router.nav(); const cur = Router.cur.name;
    const unread = Notify.mine().filter((n) => !n.read).length;
    const overdue = Auth.can('tasks') ? Auth.tasks().filter((t) => DB.isOverdue(t)).length : 0;
    $('#sidenav').innerHTML = String(html`${nav.map((n) => html`<a href="${n.href}" class="nav-it ${cur === n.mod ? 'on' : ''}" title="${n.label}">${icon(n.ic)}<span>${n.label}</span>${n.mod === 'tasks' && overdue ? html`<em class="nbadge">${overdue}</em>` : ''}</a>`)}`);
    const u = Auth.user; const r = Auth.role();
    $('#sideuser').innerHTML = String(html`<a href="#/profile" class="su">${avatar(u.name, (DB.member(u.memberId) || {}).photo, 34)}<span><b>${u.name}</b><small>${r ? r.name : ''}</small></span></a>`);
    const branches = Lists.all('branches');
    $('#topbar').innerHTML = String(html`<button type="button" class="icon-btn only-m" data-act="side:open" aria-label="Open menu">${icon('menu')}</button>
      <button type="button" class="search-btn" data-act="palette" aria-label="Search">${icon('search')}<span>Search clients, tasks, invoices…</span><kbd>Ctrl K</kbd></button>
      <span class="grow"></span>
      ${branches.length > 1 && !Auth.assignedOnly() ? html`<select class="inp branch-sel" data-act-change="branch:set" aria-label="Branch filter"><option value="">All branches</option>${branches.map((b) => html`<option value="${b.id}" ${UIState.branch === b.id ? raw('selected') : ''}>${b.name}</option>`)}</select>` : ''}
      <button type="button" class="icon-btn" data-act="theme:open" aria-label="Themes" title="Themes">${icon('palette')}</button>
      <button type="button" class="icon-btn" data-act="theme" aria-label="Toggle dark mode" title="Dark / Light">${icon(Theme.dark() ? 'sun' : 'moon')}</button>
      <a href="#/notifications" class="icon-btn bell" aria-label="Notifications (${unread} unread)" title="Notifications">${icon('bell')}${unread ? html`<em class="nbadge">${unread > 99 ? '99+' : unread}</em>` : ''}</a>
      <button type="button" class="icon-btn" data-act="lock" aria-label="Lock screen" title="Lock screen">${icon('lock')}</button>
      <div class="umenu"><button type="button" class="ubtn" data-act="umenu" aria-haspopup="true">${avatar(u.name, (DB.member(u.memberId) || {}).photo, 30)}<span class="hide-m">${u.name.split(' ')[0]}</span></button></div>`);
    const bn = [['dashboard', 'Home', 'dashboard', '#/dashboard'], ['clients', 'Clients', 'clients', '#/clients'], ['tasks', 'Tasks', 'tasks', '#/tasks'], ['invoices', 'Billing', 'invoices', '#/invoices']].filter(([m]) => Auth.can(m));
    $('#bnav').innerHTML = String(html`${bn.map(([m, l, ic, h]) => html`<a href="${h}" class="${cur === m ? 'on' : ''}">${icon(ic)}<span>${l}</span></a>`)}<button type="button" data-act="side:open">${icon('more')}<span>More</span></button>`);
  }
};

act('side:toggle', () => { const s = $('.shell'); s.classList.toggle('side-min'); localStorage.setItem('crm_side', s.classList.contains('side-min') ? 'min' : ''); });
act('side:open', () => document.body.classList.add('nav-open'));
act('side:close', () => document.body.classList.remove('nav-open'));
act('palette', () => Palette.open());
act('theme', () => { Theme.toggle(); App.renderChrome(); Router.refresh(); });
act('lock', () => Auth.lock('manual'));
act('branch:set', (a) => { UIState.branch = a.value; Auth._cache = null; Router.refresh(); });
act('umenu', (a) => {
  const old = $('.udrop'); if (old) { old.remove(); return; }
  const d = document.createElement('div'); d.className = 'udrop';
  const u = Auth.user;
  d.innerHTML = String(html`<div class="ud-h"><b>${u.name}</b><small>${u.username} · ${(Auth.role() || {}).name}</small></div><a href="#/profile">${icon('user')} My profile &amp; security</a><a href="#/notifications">${icon('bell')} Notifications</a><button type="button" data-act="theme:open">${icon('palette')} Themes</button><button type="button" data-act="lock">${icon('lock')} Lock screen</button><button type="button" data-act="logout">${icon('logout')} Sign out</button>`);
  document.body.appendChild(d);
  setTimeout(() => document.addEventListener('click', function h(e) { if (!d.contains(e.target)) { d.remove(); document.removeEventListener('click', h); } }), 0);
});
act('logout', async () => { if (await confirmDlg(`Sign out of ${Brand.appName()}?`, { ok: 'Sign out' })) Auth.logout(); });

/* ---------- Keyboard shortcuts: Ctrl+K or / = search, N = new, Esc = close ---------- */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (!Auth.user || Auth.locked)) { Modal.closeTop(); return; }
  if (!Auth.user || Auth.locked) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); Palette.open(); return; }
  if (e.key === 'Escape') { if ($('.udrop')) { $('.udrop').remove(); return; } if (Modal.closeTop()) { e.preventDefault(); return; } document.body.classList.remove('nav-open'); return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey || Modal.stack.length) return;
  if (e.key === '/') { e.preventDefault(); Palette.open(); }
  else if (e.key.toLowerCase() === 'n') { const v = Views[Router.cur.name]; if (v && v.onNew) { e.preventDefault(); v.onNew(); } }
});
