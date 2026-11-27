/* ==========================================================================
   17-settings.js — Settings & Admin: company profile, Master Lists, roles &
   permission matrix, users (approve registrations, reset password, lock,
   force 2FA), branches, numbering, templates, preferences, backup/restore,
   snapshots, audit log viewer, my profile & security.
   ========================================================================== */
const LIST_META = {
  services: { color: false, fee: true }, businessTypes: {}, designations: {}, departments: {}, taskStatuses: { color: true, done: true }, priorities: { color: true },
  docCategories: { color: true }, portals: { url: true }, branches: {}, clientStatuses: { color: true }, paymentMethods: {}, expenseCategories: {}, tags: { color: true },
  serviceStatuses: { color: true }, staffStatuses: { color: true }, authorities: { color: true }
};
const LIST_USAGE = {
  services: [['tasks', 'service'], ['services', 'service'], ['compliance', 'service']], businessTypes: [['clients', 'businessType']], designations: [['team', 'designation']], departments: [['team', 'department']],
  taskStatuses: [['tasks', 'status']], priorities: [['tasks', 'priority']], docCategories: [['documents', 'category']], portals: [['creds', 'portal']], branches: [['clients', 'branch'], ['team', 'branch'], ['expenses', 'branch']],
  clientStatuses: [['clients', 'status']], paymentMethods: [['payments', 'method'], ['expenses', 'method']], expenseCategories: [['expenses', 'category']], tags: [['clients', 'tags']], serviceStatuses: [['services', 'status']], staffStatuses: [['team', 'status']], authorities: [['compliance', 'authority']]
};
const Settings = {
  addListItem(k, name) {
    name = String(name || '').trim(); if (!name) return null;
    if (!Auth.can('settings', 'edit')) { toast('You do not have permission to change Master Lists', 'err'); return null; }
    if (k === 'branches' && !License.allow('branches')) return null;
    if (Lists.all(k).some((x) => x.name.toLowerCase() === name.toLowerCase())) { toast('That value already exists', 'warn'); return Lists.all(k).find((x) => x.name.toLowerCase() === name.toLowerCase()); }
    const item = { id: uid(k.slice(0, 3) + '_'), name }; if (LIST_META[k] && LIST_META[k].color) item.color = SERIES[Lists.all(k).length % 8];
    Store.commit((s) => { (s.lists[k] = s.lists[k] || []).push(item); });
    Auth.audit('create', 'settings', `Master list "${Lists.defs[k]}": added "${name}"`);
    toast(`"${name}" added to ${Lists.defs[k]}`);
    return item;
  },
  usage(k, id) { return sum(LIST_USAGE[k] || [], ([coll, f]) => Store.s[coll].filter((r) => (Array.isArray(r[f]) ? r[f].includes(id) : r[f] === id)).length); },
  replaceUsage(k, id, to) { (LIST_USAGE[k] || []).forEach(([coll, f]) => Store.s[coll].forEach((r) => { if (Array.isArray(r[f])) r[f] = to ? r[f].map((x) => (x === id ? to : x)).filter((x, i, a) => a.indexOf(x) === i) : r[f].filter((x) => x !== id); else if (r[f] === id) r[f] = to || ''; })); },
  userForm(u, member, over = {}) {
    const isNew = !u; const meIsSuper = (Auth.role() || {}).all;
    if (isNew && !License.allow('users')) return;
    const roleOpts = () => Store.s.roles.filter((r) => meIsSuper || !r.all).map((r) => ({ value: r.id, label: r.name }));
    if (u && (Auth.role(u) || {}).all && !meIsSuper) { toast('Only a Super Admin can edit a Super Admin account', 'err'); return; }
    const temp = 'Tak@' + Math.random().toString(36).slice(2, 7) + Math.floor(Math.random() * 90 + 10);
    const fields = [
      { name: 'name', label: 'Full name', required: true }, { name: 'username', label: 'Username', required: true, validate: (v) => !/^[a-z0-9._-]{3,30}$/i.test(v) ? '3-30 letters, numbers, . _ -' : (Store.s.users.some((x) => x.username.toLowerCase() === v.toLowerCase() && x !== u) ? 'Username already taken' : '') },
      { name: 'email', label: 'Email', type: 'email' }, { name: 'mobile', label: 'Mobile', type: 'mobile' },
      { name: 'roleId', label: 'Role', type: 'select', options: roleOpts, required: true },
      { name: 'memberId', label: 'Linked team member', type: 'select', options: () => Store.s.team.filter((m) => !Store.s.users.some((x) => x.memberId === m.id && x !== u)).map((m) => ({ value: m.id, label: `${m.code} · ${m.name}` })), placeholder: '— Not linked —', help: 'Required for Tax Officers (assigned-clients scope)' },
      { name: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'locked', label: 'Locked' }, { value: 'pending', label: 'Pending approval' }], required: true },
      { name: 'force2fa', label: 'Require two-step verification (2FA)', type: 'checkbox' }
    ];
    if (isNew) fields.push({ name: 'password', label: 'Temporary password', required: true, help: 'User must change it at first sign-in', validate: (v) => Auth.policy(v) });
    formModal({
      title: isNew ? 'New user' : `Edit user ${u.username}`, size: 'lg', fields,
      values: u ? Object.assign(clone(u), over) : { status: 'active', password: temp, memberId: member ? member.id : '', name: member ? member.name : '', email: member ? member.email : '', mobile: member ? member.mobile : '', username: member ? member.name.split(' ')[0].toLowerCase() : '', roleId: (Store.s.roles.find((r) => r.name === 'Tax Officer') || {}).id },
      onSubmit: async (v) => {
        const role = Store.s.roles.find((r) => r.id === v.roleId);
        if (role && role.scope === 'assigned' && !v.memberId) return { memberId: 'A role limited to assigned clients needs a linked team member' };
        if (u && u.id === Auth.user.id && v.status !== 'active') return { status: 'You cannot lock your own account' };
        if (u && (Auth.role(u) || {}).all && !(role || {}).all && Store.s.users.filter((x) => (Auth.role(x) || {}).all && x.status === 'active').length <= 1) return { roleId: 'At least one active Super Admin is required' };
        if (isNew) {
          const nu = { id: uid('u'), username: v.username.toLowerCase(), name: v.name, email: v.email, mobile: v.mobile, roleId: v.roleId, memberId: v.memberId, status: v.status, force2fa: v.force2fa, mustChange: true, createdAt: new Date().toISOString() };
          await Auth.setPassword(nu, v.password);
          Store.commit((s) => s.users.push(nu));
          Auth.audit('create', 'users', `Created user ${nu.username} (${role.name})`, { recordId: nu.id, new: { username: nu.username, role: role.name } });
          Modal.open({ title: 'User created', size: 'sm', body: html`<p>Share these sign-in details with <b>${nu.name}</b> securely:</p>${kv([['Username', html`<code>${nu.username}</code>`], ['Temporary password', html`<code>${v.password}</code>`]])}<p class="muted sm">They will be asked to set a new password at first sign-in.</p>`, foot: html`<button type="button" class="btn primary" data-close>Done</button>` });
        } else {
          const oldRole = u.roleId; const wasPending = u.status === 'pending';
          const d = Auth.diff({ name: u.name, username: u.username, email: u.email, mobile: u.mobile, roleId: u.roleId, memberId: u.memberId, status: u.status, force2fa: u.force2fa }, v);
          Store.commit(() => { Object.assign(u, { name: v.name, username: v.username.toLowerCase(), email: v.email, mobile: v.mobile, roleId: v.roleId, memberId: v.memberId, status: v.status, force2fa: v.force2fa }); });
          if (oldRole !== v.roleId) Auth.audit('role_change', 'users', `Role of ${u.username}: ${(Store.s.roles.find((r) => r.id === oldRole) || {}).name} → ${role.name}`, { recordId: u.id, old: { role: (Store.s.roles.find((r) => r.id === oldRole) || {}).name }, new: { role: role.name } });
          Auth.audit('edit', 'users', `Edited user ${u.username}`, { recordId: u.id, old: d.old, new: d.new });
          if (wasPending && v.status === 'active') Notify.push(u.id, 'registration', 'Your account was approved', `Welcome to ${Brand.appName()}. Your role: ${role.name}.`, '#/dashboard');
          if (u.id === Auth.user.id) App.renderChrome();
        }
        toast('User saved');
      }
    });
  }
};

/* ---------- Backup, restore, snapshots ---------- */
const Backup = {
  async snapshot(tag) {
    try {
      const key = tag ? `${today()}_${tag}_${Date.now()}` : today();
      await IDB.put('snapshots', key, { at: new Date().toISOString(), state: JSON.parse(JSON.stringify(Store.s)) });
      const keys = (await IDB.keys('snapshots')).sort();
      while (keys.length > 7) await IDB.del('snapshots', keys.shift());
    } catch (e) { console.warn('Snapshot failed', e); }
  },
  async autoSnapshot() { try { const keys = await IDB.keys('snapshots'); if (!keys.includes(today()) && Store.s.clients) await this.snapshot(); } catch (e) { /* ignore */ } },
  async restoreSnapshot(key) {
    const snap = await IDB.get('snapshots', key); if (!snap) return;
    if (!(await confirmDlg(html`Restore the snapshot from <b>${fmtDateTime(snap.at)}</b>? Current data will be replaced (a safety snapshot is taken first).`, { danger: true, ok: 'Restore snapshot' }))) return;
    await this.snapshot('before-snapshot-restore');
    const me = Auth.user.username;
    const lic = Store.s.license; Store.s = Object.assign(Store.blank(), snap.state); Store.s.license = lic;
    Auth.user = Store.s.users.find((u) => u.username === me && u.status === 'active') || null;
    Auth.audit('import', 'settings', `Snapshot ${key} restored`, { user: me }); Store.saveNow();
    if (!Auth.user) { Auth.logout('snapshot restored'); return; }
    Bus.emit('change', {}); toast('Snapshot restored');
  },
  async wipe() {
    const v = await promptDlg('Reset to empty', 'Type RESET to delete all clients, tasks, invoices, documents and other records. Users, roles, settings and Master Lists are kept.', { ok: 'Delete all records' });
    if (v !== 'RESET') { if (v !== null) toast('Not reset — you must type RESET', 'warn'); return; }
    await this.snapshot('before-reset');
    Store.commit((s) => { ['clients', 'team', 'tasks', 'services', 'invoices', 'payments', 'expenses', 'documents', 'creds', 'notes', 'timeline', 'followups', 'notifications', 'savedFilters'].forEach((k) => { s[k] = []; }); s.filings = {}; s.counters = Object.assign(s.counters, { client: {}, task: 0, emp: 0, inv: 0, doc: 0, pay: 0, exp: 0, rcpt: 0 }); s.users.forEach((u) => { u.memberId = ''; }); });
    try { await IDB.clear('blobs'); } catch (e) { /* ignore */ }
    Auth.audit('delete', 'settings', 'All business records reset to empty');
    toast('All records deleted. A snapshot was saved in case you need to undo.');
  }
};

/* ---------- Settings view ---------- */
Views.settings = {
  allow: () => Auth.can('settings') || Auth.can('users'),
  render(params) {
    const tabs = [];
    if (Auth.can('settings')) tabs.push(['company', 'Company'], ['lists', 'Master Lists'], ['branches', 'Branches'], ['numbering', 'Numbering'], ['templates', 'Templates'], ['tc', 'T&C Templates'], ['prefs', 'Preferences'], ['backup', 'Cloud & Data']);
    if (Auth.can('users')) tabs.splice(2, 0, ['users', 'Users'], ['roles', 'Roles & Permissions']);
    const f = vs('settings'); const tab = params[0] && tabs.some((t) => t[0] === params[0]) ? params[0] : (f.tab && tabs.some((t) => t[0] === f.tab) ? f.tab : tabs[0][0]);
    if (params[0]) f.tab = tab;
    const pend = Store.s.users.filter((u) => u.status === 'pending').length;
    const body = this['t_' + tab]();
    return html`${pageHead('Settings & Administration', '')}<div class="tabs" role="tablist">${tabs.map(([id, l]) => html`<a role="tab" class="tab ${id === tab ? 'on' : ''}" href="#/settings/${id}">${l}${id === 'users' && pend ? html` <span class="cnt warn">${pend}</span>` : ''}</a>`)}</div><div class="tab-body">${body}</div>`;
  },
  ro() { return !Auth.can('settings', 'edit'); },
  t_company() {
    const c = Store.s.settings.company || {}; const ro = this.ro(); const cur = (Store.s.settings.currency || {}).code || 'USD';
    return html`<div class="grid2"><div class="card"><h3>Company profile</h3><form data-company class="grid-form">${[['name', 'Company name'], ['industry', 'Industry / business type'], ['phone', 'Phone'], ['email', 'Email'], ['website', 'Website'], ['country', 'Country'], ['ntn', 'Tax / VAT / Registration no.'], ['dialCode', 'Phone country code (for WhatsApp, e.g. 44)']].map(([k, l]) => fieldHTML({ name: k, label: l }, c[k]))}${fieldHTML({ name: 'address', label: 'Address', type: 'textarea', full: true, rows: 2 }, c.address)}${fieldHTML({ name: 'invoiceFooter', label: 'Invoice footer', type: 'textarea', full: true, rows: 2 }, c.invoiceFooter)}${fieldHTML({ name: 'terms', label: 'Invoice terms & conditions', type: 'textarea', full: true, rows: 3 }, c.terms)}${fieldHTML({ name: 'bank', label: 'Bank / payment details on invoice', type: 'textarea', full: true, rows: 2 }, c.bank)}
      <label class="fld"><span>Currency</span><select name="currency">${CURRENCIES.map(([code, sym, n]) => html`<option value="${code}" ${code === cur ? raw('selected') : ''}>${code} (${sym.trim()}) · ${n}</option>`)}</select></label>
      ${ro ? '' : html`<div class="full"><button class="btn primary" type="submit">Save company profile</button></div>`}</form></div>
      <div><div class="card"><h3>Logo</h3><div class="logo-prev">${brandLogo()}</div><p class="muted sm">Upload your company logo to show it in the header, sign-in screen, invoices and reports. Until then a generated badge with your company name is used.</p>${ro ? '' : html`<input type="file" accept="image/*" data-logo aria-label="Upload logo"> ${c.logo ? btn('Remove my logo', 'set:logoreset', { cls: 'sm ghost' }) : ''}`}</div>
      ${this.whiteLabel(ro)}</div></div>`;
  },
  whiteLabel(ro) {
    const w = Store.s.settings.whiteLabel || {};
    return html`<div class="card"><div class="card-h"><h3>Custom brand colours</h3></div><p class="muted sm">Optional: set your own application name and brand colours. They appear as the "Company brand" theme.</p>
      <form data-wl class="grid-form">${fieldHTML({ name: 'appName', label: 'Application name', placeholder: Brand.appName() }, w.appName)}${fieldHTML({ name: 'color', label: 'Brand colour', type: 'color' }, w.color || '#1d64c8')}${fieldHTML({ name: 'side', label: 'Sidebar colour', type: 'color' }, w.side || '#0b1f3a')}
      ${ro ? '' : html`<div class="full"><button class="btn primary">Save brand colours</button></div>`}</form></div>`;
  },
  t_lists() {
    const f = vs('settings'); const k = f.list && Lists.defs[f.list] ? f.list : 'services'; const meta = LIST_META[k] || {}; const ro = this.ro();
    const items = Lists.all(k);
    return html`<div class="lists-layout"><div class="card rep-nav"><h4>Master Lists</h4>${Object.entries(Lists.defs).map(([id, l]) => html`<button type="button" class="rep-it ${id === k ? 'on' : ''}" data-vs-set="settings.list" data-val="${id}">${l} <span class="cnt">${Lists.all(id).length}</span></button>`)}</div>
      <div class="card"><div class="card-h"><h3>${Lists.defs[k]}</h3><small class="muted">Changes apply to every form immediately. Drag ☰ or use arrows to reorder.</small></div>
      <ul class="ml" data-ml="${k}">${items.map((x, i) => html`<li data-id="${x.id}" draggable="${!ro}"><span class="drag" aria-hidden="true">☰</span>
        <input class="inp" value="${x.name}" data-ml-name="${x.id}" aria-label="Name" ${ro ? raw('disabled') : ''}>
        ${meta.color ? html`<input type="color" value="${x.color || '#888888'}" data-ml-color="${x.id}" aria-label="Colour" ${ro ? raw('disabled') : ''}>` : ''}
        ${meta.done ? html`<label class="chk sm" title="Tasks in this status count as completed"><input type="radio" name="done" data-ml-done="${x.id}" ${x.done ? raw('checked') : ''} ${ro ? raw('disabled') : ''}> <span>Completed</span></label>` : ''}
        ${meta.fee ? html`<input class="inp sm num" type="number" min="0" value="${x.fee || ''}" placeholder="Default fee" data-ml-fee="${x.id}" aria-label="Default fee" ${ro ? raw('disabled') : ''}>` : ''}
        ${meta.url ? html`<input class="inp sm" value="${x.url || ''}" placeholder="https://login URL" data-ml-url="${x.id}" aria-label="Login URL" ${ro ? raw('disabled') : ''}>` : ''}
        <small class="muted">${Settings.usage(k, x.id)} used</small>
        ${ro ? '' : html`${btn('↑', 'ml:move', { id: x.id, cls: 'icon-btn sm', title: 'Move up', extra: `data-d="-1" data-k="${k}" ${i === 0 ? 'disabled' : ''}` })}${btn('↓', 'ml:move', { id: x.id, cls: 'icon-btn sm', title: 'Move down', extra: `data-d="1" data-k="${k}" ${i === items.length - 1 ? 'disabled' : ''}` })}${btn('', 'ml:del', { id: x.id, icon: 'trash', cls: 'icon-btn sm', title: 'Delete', extra: `data-k="${k}"` })}`}</li>`)}</ul>
      ${ro ? '' : html`<form class="inline-form" data-ml-add="${k}"><input class="inp" name="v" placeholder="Add a new value to ${Lists.defs[k]}…" aria-label="New value"><button class="btn primary sm">${icon('plus')}<span>Add</span></button></form>`}</div></div>`;
  },
  t_branches() { vs('settings').list = 'branches'; return html`<p class="muted">Branches are used for branch-wise data filtering (top bar &amp; dashboard). Clients, team members and expenses can be linked to a branch.</p>${this.t_lists()}`; },
  t_users() {
    const f = vs('settings');
    const rows = Store.s.users.filter((u) => textMatch(f.uq, u.username, u.name, u.email) && (!f.ust || u.status === f.ust));
    const pend = Store.s.users.filter((u) => u.status === 'pending'); const st = Store.s.settings; const canE = Auth.can('users', 'edit');
    return html`${pend.length && canE ? html`<div class="card note-card"><h3>Registration requests (${pend.length})</h3><ul class="list">${pend.map((u) => html`<li class="row-between"><span><b>${u.name}</b> · <code>${u.username}</code> · ${u.email} ${u.mobile ? '· ' + u.mobile : ''}<br><small class="muted">Registered ${fmtDateTime(u.createdAt)}</small></span><span class="row-acts">${btn('Approve…', 'usr:approve', { id: u.id, cls: 'sm primary' })}${btn('Reject', 'usr:reject', { id: u.id, cls: 'sm ghost' })}</span></li>`)}</ul></div>` : ''}
      <div class="card filters">${fInput('settings.uq', 'Search users…')}${fSelect('settings.ust', 'All statuses', [['active', 'Active'], ['pending', 'Pending'], ['locked', 'Locked'], ['rejected', 'Rejected']].map(([value, label]) => ({ value, label })))}<span class="grow"></span>${Auth.can('users', 'create') ? btn('New user', 'usr:new', { cls: 'primary', icon: 'plus' }) : ''}</div>
      <div class="card p0">${dataTable('users', { rows, cols: [
        { key: 'username', label: 'User', render: (u) => html`<span class="flex-c">${avatar(u.name, '', 30)}<span><b>${u.name}</b><br><code>${u.username}</code></span></span>` },
        { key: 'email', label: 'Email / mobile', render: (u) => html`${u.email || ''}<br><small class="muted">${u.mobile || ''}</small>` },
        { key: 'role', label: 'Role', get: (u) => (Auth.role(u) || {}).name, render: (u) => html`<b>${(Auth.role(u) || {}).name || '—'}</b>` },
        { key: 'member', label: 'Team member', get: (u) => DB.memberName(u.memberId), render: (u) => u.memberId ? DB.memberName(u.memberId) : html`<span class="muted">—</span>` },
        { key: 'status', label: 'Status', render: (u) => html`${badge(u.status, statusTone(u.status))}${u.lockUntil > Date.now() ? badge('temp. locked', 'red') : ''}${u.mustChange ? html`<br><small class="muted">must change password</small>` : ''}` },
        { key: '2fa', label: '2FA', get: (u) => (u.totp && u.totp.enabled ? 1 : 0), render: (u) => u.totp && u.totp.enabled ? badge('On', 'green') : (u.force2fa ? badge('Required', 'amber') : html`<span class="muted">Off</span>`) },
        { key: 'lastLogin', label: 'Last sign-in', render: (u) => u.lastLogin ? timeAgo(u.lastLogin) : html`<span class="muted">never</span>` },
        { key: 'a', label: '', sort: false, cls: 'act', render: (u) => canE ? html`<div class="row-acts">${btn('', 'usr:edit', { id: u.id, icon: 'edit', cls: 'icon-btn sm', title: 'Edit' })}${btn('', 'usr:reset', { id: u.id, icon: 'key', cls: 'icon-btn sm', title: 'Reset password' })}${u.id !== Auth.user.id ? btn('', 'usr:lock', { id: u.id, icon: 'lock', cls: 'icon-btn sm', title: u.status === 'locked' ? 'Unlock' : 'Lock' }) : ''}${u.totp && u.totp.enabled ? btn('2FA', 'usr:reset2fa', { id: u.id, cls: 'sm ghost', title: 'Reset 2FA' }) : ''}${Auth.can('users', 'delete') && u.id !== Auth.user.id ? btn('', 'usr:del', { id: u.id, icon: 'trash', cls: 'icon-btn sm', title: 'Delete' }) : ''}</div>` : '' }
      ] })}</div>
      <div class="card"><h3>Self-registration</h3><form data-regset class="grid-form">${fieldHTML({ name: 'allowRegistration', label: 'Allow people to create an account from the sign-in page', type: 'checkbox', full: true }, st.allowRegistration)}${fieldHTML({ name: 'requireApproval', label: 'New accounts need administrator approval', type: 'checkbox', full: true }, st.requireApproval)}${fieldHTML({ name: 'registrationRole', label: 'Default role for new registrations', type: 'select', options: Store.s.roles.filter((r) => !r.all).map((r) => ({ value: r.id, label: r.name })) }, st.registrationRole)}${canE ? html`<div class="full"><button class="btn primary sm">Save</button></div>` : ''}</form></div>`;
  },
  t_roles() {
    const f = vs('settings'); const r = Store.s.roles.find((x) => x.id === f.role) || Store.s.roles[0];
    const canE = Auth.can('users', 'edit') && (Auth.role() || {}).all && License.has('custom_roles'); const locked = r.all || !canE;
    return html`<div class="lists-layout"><div class="card rep-nav"><h4>Roles</h4>${Store.s.roles.map((x) => html`<button type="button" class="rep-it ${x.id === r.id ? 'on' : ''}" data-vs-set="settings.role" data-val="${x.id}">${x.name} <span class="cnt">${Store.s.users.filter((u) => u.roleId === x.id).length}</span></button>`)}${Auth.can('users', 'create') ? btn('New role', 'role:new', { cls: 'sm ghost block', icon: 'plus' }) : ''}</div>
      <div class="card"><div class="card-h"><h3>${r.name}${r.system ? html` <small class="muted">built-in</small>` : ''}</h3><span class="row-acts">${!r.all && canE ? btn('Rename', 'role:rename', { id: r.id, cls: 'sm ghost' }) : ''}${!r.system && Auth.can('users', 'delete') ? btn('Delete role', 'role:del', { id: r.id, cls: 'sm ghost danger-txt' }) : ''}</span></div>
      ${r.all ? html`<div class="note ok">Super Admin always has every permission. This role cannot be restricted, so you can never lock yourself out.</div>` : ''}
      ${!License.has('custom_roles') ? html`<div class="note">${icon('lock')} Editing roles and permissions needs the Enterprise plan. ${License.lock('custom_roles')}</div>` : !canE ? html`<div class="note">Only a Super Admin can change the permission matrix.</div>` : ''}
      <label class="fld"><span>Data scope</span><select class="inp" data-act-change="role:scope" data-id="${r.id}" ${locked ? raw('disabled') : ''}><option value="all" ${r.scope !== 'assigned' ? raw('selected') : ''}>All clients (branch filter applies)</option><option value="assigned" ${r.scope === 'assigned' ? raw('selected') : ''}>Only clients assigned to the user's team member</option></select></label>
      <div class="tbl-wrap"><table class="tbl matrix perm"><thead><tr><th>Module</th>${ACTIONS.map((a) => html`<th class="center">${a}</th>`)}</tr></thead><tbody>${MODULES.map(([m, l]) => html`<tr><td>${l}</td>${ACTIONS.map((a) => html`<td class="center"><input type="checkbox" aria-label="${l} ${a}" data-act="role:perm" data-id="${r.id}" data-m="${m}" data-a="${a}" ${r.all || (r.perms[m] && r.perms[m][a]) ? raw('checked') : ''} ${locked ? raw('disabled') : ''}></td>`)}</tr>`)}</tbody></table></div></div></div>`;
  },
  t_numbering() {
    const p = Store.s.settings.prefixes || {}; const c = Store.s.counters; const ro = this.ro();
    const rows = [['task', 'Tasks', 4], ['emp', 'Team members', 3], ['inv', 'Invoices', 4], ['doc', 'Documents', 4], ['rcpt', 'Payment receipts', 4], ['exp', 'Expenses', 4]];
    return html`<div class="card"><h3>Numbering &amp; prefixes</h3><p class="muted">Client codes use the first letter of the name plus the next number for that letter (Ali → A1, Ahmad → A2, Bilal → B1).</p><form data-numbering><table class="tbl"><thead><tr><th>Record</th><th>Prefix</th><th>Last number used</th><th>Next ID preview</th></tr></thead><tbody>${rows.map(([k, l, w]) => html`<tr><td>${l}</td><td><input class="inp sm" name="p_${k}" value="${p[k] ?? ''}" ${ro ? raw('disabled') : ''} aria-label="${l} prefix"></td><td><input class="inp sm num" type="number" min="0" name="c_${k}" value="${c[k] || 0}" ${ro ? raw('disabled') : ''} aria-label="${l} counter"></td><td><code>${(p[k] ?? '') + pad((c[k] || 0) + 1, w)}</code></td></tr>`)}</tbody></table>${ro ? '' : html`<button class="btn primary">Save numbering</button>`}</form>
      <h4 class="mt">Client code counters</h4><p class="sm">${Object.entries(c.client || {}).sort().map(([L, n]) => html`<code>${L}${n}</code> `)}</p></div>`;
  },
  t_templates() {
    const tpls = Store.s.settings.taskTemplates || []; const msg = Store.s.settings.templates || []; const ro0 = this.ro();
    let ro = ro0 || !License.has('msg_templates'); const lockMsg = !License.has('msg_templates') ? License.lock('msg_templates') : '';
    return html`<div class="grid2"><div class="card"><div class="card-h"><h3>WhatsApp &amp; email templates</h3>${ro ? lockMsg : btn('Add', 'tpl:new', { cls: 'sm primary', icon: 'plus' })}</div><p class="muted sm">Placeholders: {client} {code} {task} {due} {officer} {company} {phone}</p><ul class="list">${msg.map((t, i) => html`<li class="row-between"><span>${badge(t.channel === 'whatsapp' ? 'WhatsApp' : 'Email', t.channel === 'whatsapp' ? 'green' : 'blue')} <b>${t.name}</b><br><small class="muted">${String(t.body).slice(0, 90)}…</small></span>${ro ? '' : html`<span class="row-acts">${btn('', 'tpl:edit', { id: i, icon: 'edit', cls: 'icon-btn sm', title: 'Edit' })}${btn('', 'tpl:del', { id: i, icon: 'trash', cls: 'icon-btn sm', title: 'Delete' })}</span>`}</li>`)}</ul></div>
      ${(ro = ro0 || !License.has('recurring'), '')}<div class="card"><div class="card-h"><h3>Task templates per service</h3>${ro ? (License.has('recurring') ? '' : License.lock('recurring')) : btn('Add', 'ttpl:new', { cls: 'sm primary', icon: 'plus' })}</div><p class="muted sm">When a task is created for a service, its checklist is added automatically.</p><ul class="list">${tpls.map((t, i) => html`<li class="row-between"><span><b>${Lists.name('services', t.service)}</b> — ${t.title}<br><small class="muted">${t.checklist.length} checklist items · ${t.days || 0} days to complete</small></span>${ro ? '' : html`<span class="row-acts">${btn('', 'ttpl:edit', { id: i, icon: 'edit', cls: 'icon-btn sm', title: 'Edit' })}${btn('', 'ttpl:del', { id: i, icon: 'trash', cls: 'icon-btn sm', title: 'Delete' })}</span>`}</li>`)}</ul></div></div>`;
  },
  t_tc() {
    const ro = this.ro();
    const tcs = Store.s.settings.tcTemplates || [];
    return html`<div class="card">
      <div class="card-h"><h3>Terms & Conditions Templates</h3>${ro ? '' : btn('Add Template', 'tc:new', { cls: 'sm primary', icon: 'plus' })}</div>
      <p class="muted sm">Create multiple T&C templates and choose the right one when creating an invoice. Mark one as default to auto-select it.</p>
      ${tcs.length ? html`<ul class="list">${tcs.map((t, i) => html`<li class="row-between">
        <span>
          <b>${t.name}</b>${t.isDefault ? html` ${badge('Default', 'green')}` : ''}
          <br><small class="muted">${(t.text || '').slice(0, 80)}${(t.text || '').length > 80 ? '…' : ''}</small>
        </span>
        ${ro ? '' : html`<span class="row-acts">
          ${!t.isDefault ? btn('Set Default', 'tc:default', { id: i, cls: 'sm ghost' }) : ''}
          ${btn('', 'tc:edit', { id: i, icon: 'edit', cls: 'icon-btn sm', title: 'Edit' })}
          ${btn('', 'tc:del', { id: i, icon: 'trash', cls: 'icon-btn sm', title: 'Delete' })}
        </span>`}
      </li>`)}` : html`<p class="muted">No templates yet. Add your first T&C template.</p>`}
      </ul></div>`;
  },
  t_prefs() {
    const s = Store.s.settings; const ro = this.ro();
    return html`<div class="card"><h3>Preferences</h3><form data-prefs class="grid-form">${fieldHTML({ name: 'inactivityMin', label: 'Auto-lock after inactivity (minutes)', type: 'number', min: 1, max: 240 }, s.inactivityMin)}${fieldHTML({ name: 'capacity', label: 'Workload capacity (open tasks per person)', type: 'number', min: 1 }, s.capacity)}${fieldHTML({ name: 'filingDueDay', label: 'Monthly tracker due day (of following month)', type: 'number', min: 1, max: 28 }, s.filingDueDay)}${fieldHTML({ name: 'defaultTaxPct', label: 'Default invoice tax %', type: 'number', min: 0, step: '0.01' }, s.defaultTaxPct)}${fieldHTML({ name: 'invoiceDueDays', label: 'Invoice due in (days)', type: 'number', min: 0 }, s.invoiceDueDays)}${fieldHTML({ name: 'maxUploadMB', label: 'Upload size warning (MB)', type: 'number', min: 1 }, s.maxUploadMB)}
      ${ro ? '' : html`<div class="full"><button class="btn primary">Save preferences</button></div>`}</form></div>
      <div class="card"><h3>Themes</h3><div data-theme-gallery>${ThemeUI.gallery(true)}</div></div>`;
  },
  t_backup() {
    const ro = this.ro();
    return html`${Cloud.card()}<div class="grid2">
      <div class="card"><h3>Daily snapshots</h3><p class="muted sm">A safety copy of your data is kept automatically once a day on this computer (last 7). Your real data is in the cloud.</p><div data-snaps>${skeleton(3)}</div>${ro ? '' : btn('Take snapshot now', 'bk:snap', { cls: 'sm ghost' })}</div>
      <div class="card"><h3>Reset records</h3><p>Delete all clients, tasks, invoices and other records to start fresh. Your company profile, users and Master Lists are kept.</p>${ro ? '' : html`<div class="row-acts">${btn('Reset to empty', 'bk:wipe', { cls: 'danger' })}</div>`}</div>
      <div class="card"><h3>Company sign-in</h3><p>Company username: <b>${Cloud.company() || '—'}</b></p><p class="muted sm">Use "Switch company" on the employee sign-in screen to leave this company on a shared computer.</p>${btn('Sign out of company', 'cloud:leave', { cls: 'sm ghost' })}</div></div>`;
  },

  async mountSnaps(root) {
    const box = root.querySelector('[data-snaps]'); if (!box) return;
    try { const keys = (await IDB.keys('snapshots')).sort().reverse(); const items = []; for (const k of keys) { const s = await IDB.get('snapshots', k); items.push({ k, at: s.at, n: (s.state.clients || []).length }); }
      box.innerHTML = items.length ? String(html`<ul class="list">${items.map((i) => html`<li class="row-between"><span><b>${fmtDateTime(i.at)}</b><br><small class="muted">${i.k.includes('_') ? i.k.split('_')[1] : 'daily'} · ${i.n} clients</small></span>${this.ro() ? '' : btn('Restore', 'bk:restore', { id: i.k, cls: 'sm ghost' })}</li>`)}</ul>`) : '<p class="muted">No snapshots yet.</p>';
    } catch (e) { box.textContent = 'Snapshots unavailable: ' + e.message; }
  },
  mount(root) {
    this.mountSnaps(root);
    const co = root.querySelector('[data-company]');
    if (co) co.onsubmit = (e) => { e.preventDefault(); if (this.ro()) return; const v = Object.fromEntries(new FormData(co)); const cc = CURRENCIES.find((x) => x[0] === v.currency) || CURRENCIES[0]; delete v.currency; const old = clone(Store.s.settings.company); Store.commit((s) => { s.settings.company = Object.assign({}, s.settings.company, v); s.settings.currency = { code: cc[0], symbol: cc[1] }; }); setFavicon(); document.title = Brand.appName(); App.renderChrome(); Auth.audit('edit', 'settings', 'Company profile updated', Auth.diff(old, Store.s.settings.company)); toast('Company profile saved'); };
    const wl = root.querySelector('[data-wl]');
    if (wl) wl.onsubmit = (e) => { e.preventDefault(); const v = { appName: wl.appName.value.trim(), color: wl.color.value, side: wl.side.value }; Store.commit((s) => { s.settings.whiteLabel = v; }); Auth.audit('edit', 'settings', 'Brand colours updated', { new: v }); Theme.setSkin('brand'); document.title = Brand.appName(); toast('Brand colours saved. The Company brand theme is now active.'); };
    const lg = root.querySelector('[data-logo]');
    if (lg) lg.onchange = async () => { const f = lg.files[0]; if (!f) return; const url = await resizeImage(f, 600); Store.commit((s) => { s.settings.company = Object.assign({}, s.settings.company, { logo: url, logoColor: undefined }); }); Auth.audit('edit', 'settings', 'Logo updated'); setFavicon(); toast('Logo updated'); };
    const ml = root.querySelector('[data-ml]');
    if (ml && !this.ro()) {
      const k = ml.dataset.ml;
      const upd = (id, fn, label) => { const it = Lists.get(k, id); if (!it) return; Store.commit(() => fn(it)); if (label) Auth.audit('edit', 'settings', `Master list "${Lists.defs[k]}": ${label}`); };
      $$('[data-ml-name]', ml).forEach((i) => i.addEventListener('change', () => { const it = Lists.get(k, i.dataset.mlName); const v = i.value.trim(); if (!v) { i.value = it.name; return; } const old = it.name; upd(it.id, (x) => { x.name = v; }, `renamed "${old}" → "${v}"`); toast('Renamed — all records show the new name'); }));
      $$('[data-ml-color]', ml).forEach((i) => i.addEventListener('change', () => upd(i.dataset.mlColor, (x) => { x.color = i.value; }, 'colour changed')));
      $$('[data-ml-fee]', ml).forEach((i) => i.addEventListener('change', () => upd(i.dataset.mlFee, (x) => { x.fee = Number(i.value) || 0; }, 'default fee changed')));
      $$('[data-ml-url]', ml).forEach((i) => i.addEventListener('change', () => { if (Valid.url(i.value)) { toast(Valid.url(i.value), 'warn'); return; } upd(i.dataset.mlUrl, (x) => { x.url = i.value.trim(); }, 'login URL changed'); }));
      $$('[data-ml-done]', ml).forEach((i) => i.addEventListener('change', () => { Store.commit(() => Lists.all(k).forEach((x) => { x.done = x.id === i.dataset.mlDone; })); Auth.audit('edit', 'settings', `Completed status set to "${Lists.name(k, i.dataset.mlDone)}"`); }));
      let drag = null;
      $$('li[draggable=true]', ml).forEach((li) => { li.addEventListener('dragstart', () => { drag = li.dataset.id; li.classList.add('dragging'); }); li.addEventListener('dragend', () => li.classList.remove('dragging')); li.addEventListener('dragover', (e) => e.preventDefault()); li.addEventListener('drop', (e) => { e.preventDefault(); if (!drag || drag === li.dataset.id) return; Store.commit((s) => { const arr = s.lists[k]; const from = arr.findIndex((x) => x.id === drag); const [it] = arr.splice(from, 1); arr.splice(arr.findIndex((x) => x.id === li.dataset.id), 0, it); }); Auth.audit('edit', 'settings', `Master list "${Lists.defs[k]}" reordered`); }); });
      const add = root.querySelector('[data-ml-add]'); add.onsubmit = (e) => { e.preventDefault(); if (Settings.addListItem(k, add.v.value)) add.v.value = ''; };
    }
    const rs = root.querySelector('[data-regset]');
    if (rs) rs.onsubmit = (e) => { e.preventDefault(); if (!Auth.can('users', 'edit')) return; Store.commit((s) => { s.settings.allowRegistration = rs.allowRegistration.checked; s.settings.requireApproval = rs.requireApproval.checked; s.settings.registrationRole = rs.registrationRole.value; }); Auth.audit('edit', 'users', `Registration settings: allow=${rs.allowRegistration.checked}, approval=${rs.requireApproval.checked}`); toast('Saved'); };
    const nb = root.querySelector('[data-numbering]');
    if (nb) nb.onsubmit = (e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(nb)); Store.commit((s) => { ['task', 'emp', 'inv', 'doc', 'rcpt', 'exp'].forEach((k) => { s.settings.prefixes[k] = fd['p_' + k]; s.counters[k] = Math.max(0, parseInt(fd['c_' + k], 10) || 0); }); }); Auth.audit('edit', 'settings', 'Numbering prefixes/counters updated'); toast('Numbering saved'); };
    const pf = root.querySelector('[data-prefs]');
    if (pf) { pf.onsubmit = (e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(pf)); Store.commit((s) => { Object.entries(fd).forEach(([k, v]) => { s.settings[k] = Number(v); }); }); Auth.audit('edit', 'settings', 'Preferences updated', { new: fd }); toast('Preferences saved'); }; }
  }
};

/* ---------- Settings actions ---------- */
act('set:logoreset', async () => { if (!(await confirmDlg('Remove the company logo? A generated badge will be shown instead.', { ok: 'Remove logo' }))) return; Store.commit((s) => { delete s.settings.company.logo; delete s.settings.company.logoColor; }); Auth.audit('edit', 'settings', 'Company logo removed'); setFavicon(); toast('Logo removed'); });
act('ml:move', (a) => { const k = a.dataset.k; Store.commit((s) => { const arr = s.lists[k]; const i = arr.findIndex((x) => x.id === a.dataset.id); const j = i + Number(a.dataset.d); if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; }); });
act('ml:del', async (a) => {
  const k = a.dataset.k; const it = Lists.get(k, a.dataset.id); const n = Settings.usage(k, it.id);
  if (k === 'taskStatuses' && it.done) { toast('This is the "Completed" status. Mark another status as Completed first.', 'warn'); return; }
  if (Lists.all(k).length <= 1 && ['taskStatuses', 'priorities', 'clientStatuses', 'serviceStatuses', 'staffStatuses'].includes(k)) { toast('This list needs at least one value', 'warn'); return; }
  if (!n) { if (await confirmDlg(`Delete "${it.name}" from ${Lists.defs[k]}?`, { danger: true, ok: 'Delete' })) { const idx = Lists.all(k).indexOf(it); Store.commit((s) => s.lists[k].splice(idx, 1)); Auth.audit('delete', 'settings', `Master list "${Lists.defs[k]}": deleted "${it.name}"`); toast(`"${it.name}" deleted`, 'ok', { undo: () => Store.commit((s) => s.lists[k].splice(idx, 0, it)) }); } return; }
  formModal({ title: `Delete "${it.name}"`, size: 'sm', submit: 'Replace & delete', intro: html`<p class="warn-txt">"${it.name}" is used by ${n} record(s). Choose a value to move them to.</p>`,
    fields: [{ name: 'to', label: 'Replace with', type: 'select', options: Lists.all(k).filter((x) => x.id !== it.id).map((x) => ({ value: x.id, label: x.name })), placeholder: k === 'tags' ? '— Just remove the tag —' : '— Leave empty —' }],
    onSubmit: (v) => { Store.commit((s) => { Settings.replaceUsage(k, it.id, v.to); s.lists[k] = s.lists[k].filter((x) => x.id !== it.id); }); Auth.audit('delete', 'settings', `Master list "${Lists.defs[k]}": deleted "${it.name}" (${n} records moved to "${v.to ? Lists.name(k, v.to) : 'empty'}")`); toast('Deleted'); } });
});
act('role:new', () => {
  if (!License.need('custom_roles')) return;
  formModal({ title: 'New role', size: 'sm', fields: [{ name: 'name', label: 'Role name', required: true, validate: (v) => Store.s.roles.some((r) => r.name.toLowerCase() === v.toLowerCase()) ? 'A role with this name exists' : '' }, { name: 'from', label: 'Copy permissions from', type: 'select', options: Store.s.roles.filter((r) => !r.all).map((r) => ({ value: r.id, label: r.name })) }], onSubmit: (v) => {
    const src = Store.s.roles.find((r) => r.id === v.from); const r = { id: uid('r'), name: v.name, perms: src ? clone(src.perms) : {}, scope: src ? src.scope : 'all' };
    Store.commit((s) => s.roles.push(r)); vs('settings').role = r.id; Auth.audit('role_change', 'users', `Created role ${v.name}`, { recordId: r.id }); toast('Role created');
  } });
});
act('role:rename', async (a) => { const r = Store.s.roles.find((x) => x.id === a.dataset.id); const n = await promptDlg('Rename role', 'Role name', { value: r.name }); if (!n) return; const old = r.name; Store.commit(() => { r.name = n.trim(); }); Auth.audit('role_change', 'users', `Role renamed ${old} → ${n}`, { recordId: r.id, old: { name: old }, new: { name: n } }); });
act('role:del', async (a) => { const r = Store.s.roles.find((x) => x.id === a.dataset.id); if (Store.s.users.some((u) => u.roleId === r.id)) { toast('Move users to another role before deleting this one', 'warn'); return; } if (!(await confirmDlg(`Delete role "${r.name}"?`, { danger: true, ok: 'Delete' }))) return; Store.commit((s) => { s.roles = s.roles.filter((x) => x !== r); }); vs('settings').role = ''; Auth.audit('role_change', 'users', `Deleted role ${r.name}`, { recordId: r.id }); });
act('role:scope', (a) => { const r = Store.s.roles.find((x) => x.id === a.dataset.id); const old = r.scope; Store.commit(() => { r.scope = a.value; }); Auth.audit('role_change', 'users', `Role ${r.name} data scope: ${old || 'all'} → ${a.value}`, { recordId: r.id, old: { scope: old }, new: { scope: a.value } }); toast('Scope updated'); });
act('role:perm', (a) => { const r = Store.s.roles.find((x) => x.id === a.dataset.id); const m = a.dataset.m, ac = a.dataset.a; Store.commit(() => { r.perms[m] = r.perms[m] || {}; r.perms[m][ac] = a.checked; if (ac === 'view' && !a.checked) ACTIONS.forEach((x) => { r.perms[m][x] = false; }); if (ac !== 'view' && a.checked) r.perms[m].view = true; }); Auth.audit('role_change', 'users', `${r.name}: ${m}.${ac} ${a.checked ? 'granted' : 'revoked'}`, { recordId: r.id, old: { [m + '.' + ac]: !a.checked }, new: { [m + '.' + ac]: a.checked } }); });
const usrOf = (a) => Store.s.users.find((u) => u.id === a.dataset.id);
act('usr:new', () => Settings.userForm());
act('usr:edit', (a) => Settings.userForm(usrOf(a)));
act('usr:approve', (a) => Settings.userForm(usrOf(a), null, { status: 'active' }));
act('usr:reject', async (a) => { const u = usrOf(a); if (!(await confirmDlg(`Reject the registration of ${u.name} (${u.username})?`, { ok: 'Reject', danger: true }))) return; Store.commit(() => { u.status = 'rejected'; }); Auth.audit('edit', 'users', `Rejected registration ${u.username}`, { recordId: u.id }); toast('Registration rejected'); });
act('usr:reset', async (a) => {
  const u = usrOf(a); if ((Auth.role(u) || {}).all && !(Auth.role() || {}).all) { toast('Only a Super Admin can reset a Super Admin password', 'err'); return; }
  const temp = 'Tak@' + Math.random().toString(36).slice(2, 7) + Math.floor(Math.random() * 90 + 10);
  if (!(await confirmDlg(html`Reset the password for <b>${u.username}</b>? A temporary password will be generated and the user must change it at next sign-in.`, { ok: 'Reset password' }))) return;
  await Auth.setPassword(u, temp); Store.commit(() => { u.mustChange = true; u.failed = 0; u.lockUntil = 0; });
  Auth.audit('password_reset', 'users', `Password reset for ${u.username}`, { recordId: u.id });
  Modal.open({ title: 'Temporary password', size: 'sm', body: html`<p>Give this temporary password to <b>${u.name}</b>:</p><p class="center"><code class="secret">${temp}</code></p>`, foot: html`<button type="button" class="btn primary" data-close>Done</button>` });
});
act('usr:lock', (a) => { const u = usrOf(a); const to = u.status === 'locked' ? 'active' : 'locked'; if (to === 'locked' && (Auth.role(u) || {}).all && Store.s.users.filter((x) => (Auth.role(x) || {}).all && x.status === 'active').length <= 1) { toast('Cannot lock the last Super Admin', 'err'); return; } Store.commit(() => { u.status = to; u.lockUntil = 0; u.failed = 0; }); Auth.audit('edit', 'users', `${to === 'locked' ? 'Locked' : 'Unlocked'} user ${u.username}`, { recordId: u.id, old: { status: to === 'locked' ? 'active' : 'locked' }, new: { status: to } }); toast(`User ${to}`); });
act('usr:reset2fa', async (a) => { const u = usrOf(a); if (!(await confirmDlg(`Turn off 2FA for ${u.username}? They will need to set it up again if 2FA is required.`, { ok: 'Reset 2FA' }))) return; Store.commit(() => { u.totp = null; }); Auth.audit('edit', 'users', `2FA reset for ${u.username}`, { recordId: u.id }); });
act('usr:del', async (a) => { const u = usrOf(a); if ((Auth.role(u) || {}).all && Store.s.users.filter((x) => (Auth.role(x) || {}).all).length <= 1) { toast('Cannot delete the last Super Admin', 'err'); return; } if (await confirmDlg(`Delete user ${u.username}? Their audit history is kept.`, { danger: true, ok: 'Delete' })) Rec.remove('users', u, `User ${u.username}`, 'users'); });
const tplForm = (t, i) => formModal({ title: t ? 'Edit template' : 'New message template', size: 'md', fields: [{ name: 'name', label: 'Name', required: true }, { name: 'channel', label: 'Channel', type: 'select', options: [{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'Email' }], required: true }, { name: 'subject', label: 'Email subject', full: true }, { name: 'body', label: 'Message', type: 'textarea', rows: 6, full: true, required: true, help: 'Use {client} {code} {task} {due} {officer} {company} {phone}' }], values: t || { channel: 'whatsapp' }, onSubmit: (v) => { Store.commit((s) => { s.settings.templates = s.settings.templates || []; if (t) s.settings.templates[i] = v; else s.settings.templates.push(v); }); Auth.audit('edit', 'settings', `Message template "${v.name}" saved`); toast('Template saved'); } });
act('tpl:new', () => tplForm());
act('tpl:edit', (a) => tplForm(clone(Store.s.settings.templates[+a.dataset.id]), +a.dataset.id));
act('tpl:del', async (a) => { if (await confirmDlg('Delete this template?', { danger: true, ok: 'Delete' })) Store.commit((s) => s.settings.templates.splice(+a.dataset.id, 1)); });
const ttplForm = (t, i) => formModal({ title: t ? 'Edit task template' : 'New task template', size: 'md', fields: [{ name: 'service', label: 'Service', type: 'select', list: 'services', required: true }, { name: 'title', label: 'Default task title', required: true }, { name: 'days', label: 'Days to complete (sets due date)', type: 'number', min: 0 }, { name: 'checklist', label: 'Checklist (one item per line)', type: 'textarea', rows: 8, full: true, required: true }], values: t ? Object.assign(clone(t), { checklist: t.checklist.join('\n') }) : { days: 7 }, onSubmit: (v) => { v.checklist = v.checklist.split('\n').map((x) => x.trim()).filter(Boolean); Store.commit((s) => { s.settings.taskTemplates = s.settings.taskTemplates || []; if (t) s.settings.taskTemplates[i] = v; else s.settings.taskTemplates.push(v); }); Auth.audit('edit', 'settings', `Task template for ${Lists.name('services', v.service)} saved`); toast('Task template saved'); } });
act('ttpl:new', () => ttplForm());
act('ttpl:edit', (a) => ttplForm(Store.s.settings.taskTemplates[+a.dataset.id], +a.dataset.id));
act('ttpl:del', async (a) => { if (await confirmDlg('Delete this task template?', { danger: true, ok: 'Delete' })) Store.commit((s) => s.settings.taskTemplates.splice(+a.dataset.id, 1)); });
act('bk:snap', async () => { await Backup.snapshot('manual'); toast('Snapshot saved'); Router.refresh(); });
act('bk:restore', (a) => Backup.restoreSnapshot(a.dataset.id));
act('bk:wipe', () => Backup.wipe());

/* ---------- Audit log viewer ---------- */
Views.audit = {
  render() {
    const f = vs('audit');
    const rows = Store.s.audit.filter((a) => textMatch(f.q, a.summary, a.user, a.recordId) && (!f.user || a.user === f.user) && (!f.action || a.action === f.action) && (!f.module || a.module === f.module) && inRange(String(a.at).slice(0, 10), f.from, f.to));
    const users = Array.from(new Set(Store.s.audit.map((a) => a.user))).sort(); const acts = Array.from(new Set(Store.s.audit.map((a) => a.action))).sort(); const mods = Array.from(new Set(Store.s.audit.map((a) => a.module))).sort();
    const short = (o) => (o && typeof o === 'object' ? Object.entries(o).slice(0, 6).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : v}`).join(' · ') : (o ?? ''));
    return html`${pageHead('Audit Log', `${Store.s.audit.length} entries (latest 5,000 kept)`, Auth.can('audit', 'export') ? btn('Export CSV', 'audit:export', { cls: 'ghost', icon: 'download' }) : '')}
      <div class="card filters">${fInput('audit.q', 'Search…')}${fSelect('audit.user', 'All users', users.map((u) => ({ value: u, label: u })))}${fSelect('audit.action', 'All actions', acts.map((u) => ({ value: u, label: u })))}${fSelect('audit.module', 'All modules', mods.map((u) => ({ value: u, label: u })))}${fDate('audit.from', 'From')}${fDate('audit.to', 'To')}${savedFiltersBar('audit')}</div>
      <div class="card p0">${dataTable('audit', { rows, cols: [
        { key: 'at', label: 'When', render: (a) => html`${fmtDateTime(a.at)}<br><small class="muted">${timeAgo(a.at)}</small>` }, { key: 'user', label: 'Who', render: (a) => html`<b>${a.user}</b>` },
        { key: 'action', label: 'Action', render: (a) => badge(a.action, /delete|failed|reveal|copy/.test(a.action) ? 'red' : /create|login$/.test(a.action) ? 'green' : /export|import/.test(a.action) ? 'blue' : 'grey') }, { key: 'module', label: 'Module' },
        { key: 'summary', label: 'What', render: (a) => html`${a.summary}${a.old || a.new ? html`<details class="diff"><summary>old vs new</summary><div><b>Old:</b> ${short(a.old)}</div><div><b>New:</b> ${short(a.new)}</div></details>` : ''}` }
      ] })}</div>`;
  }
};
act('audit:export', () => {
  const f = vs('audit'); const rows = Store.s.audit.filter((a) => textMatch(f.q, a.summary, a.user) && (!f.user || a.user === f.user) && (!f.action || a.action === f.action) && (!f.module || a.module === f.module) && inRange(String(a.at).slice(0, 10), f.from, f.to));
  downloadFile('audit-log.csv', toCSV(['When', 'User', 'Action', 'Module', 'Summary', 'Record', 'Old', 'New'], rows.map((a) => [a.at, a.user, a.action, a.module, a.summary, a.recordId, a.old ? JSON.stringify(a.old) : '', a.new ? JSON.stringify(a.new) : ''])), 'text/csv');
  Auth.audit('export', 'audit', `Audit log exported (${rows.length} rows)`);
});

/* ---------- My profile & security ---------- */
Views.profile = {
  perm: 'any',
  render() {
    const u = Auth.user; const m = DB.member(u.memberId); const r = Auth.role();
    const mine = Store.s.audit.filter((a) => a.userId === u.id).slice(0, 10);
    return html`${pageHead('My profile & security', '')}<div class="grid2"><div class="card"><div class="flex-c">${avatar(u.name, (m || {}).photo, 64)}<div><h2>${u.name}</h2><p class="muted">${u.username} · ${r ? r.name : ''}${r && r.scope === 'assigned' ? ' · assigned clients only' : ''}</p></div></div>
      ${kv([['Email', u.email], ['Mobile', u.mobile], ['Team member', m ? `${m.code} · ${m.name}` : 'Not linked'], ['Last sign-in', fmtDateTime(u.lastLogin)], ['Password changed', fmtDateTime(u.pwChangedAt)], ['Two-step verification', u.totp && u.totp.enabled ? badge('Enabled', 'green') : badge('Off', 'grey')]])}
      <div class="row-acts mt">${btn('Themes', 'theme:open', { cls: 'ghost', icon: 'palette' })}${btn('Edit my details', 'me:edit', { cls: 'ghost', icon: 'edit' })}${btn('Change password', 'me:pw', { cls: 'primary', icon: 'key' })}${u.totp && u.totp.enabled ? (u.force2fa ? '' : btn('Turn off 2FA', 'me:2faoff', { cls: 'ghost' })) : btn('Set up 2FA', 'me:2fa', { cls: 'ghost', icon: 'lock' })}</div></div>
      <div class="card"><h3>My recent activity</h3><ul class="list sm">${mine.map((a) => html`<li><b>${a.action}</b> — ${a.summary}<br><small class="muted">${fmtDateTime(a.at)}</small></li>`)}</ul></div></div>`;
  }
};
act('me:edit', () => { const u = Auth.user; formModal({ title: 'My details', size: 'md', fields: [{ name: 'name', label: 'Full name', required: true }, { name: 'email', label: 'Email', type: 'email' }, { name: 'mobile', label: 'Mobile', type: 'mobile' }], values: clone(u), onSubmit: (v) => { Store.commit(() => Object.assign(u, v)); Auth.audit('edit', 'users', `${u.username} updated own profile`, { recordId: u.id }); toast('Saved'); } }); });
act('me:pw', () => {
  const u = Auth.user;
  formModal({ title: 'Change password', size: 'sm', fields: [{ name: 'cur', label: 'Current password', type: 'password', required: true, autocomplete: 'current-password' }, { name: 'p1', label: 'New password', type: 'password', required: true, autocomplete: 'new-password', validate: (v) => Auth.policy(v) }, { name: 'p2', label: 'Confirm new password', type: 'password', required: true, validate: (v, a) => v !== a.p1 ? 'Passwords do not match' : '' }], onSubmit: async (v) => {
    if (!(await Auth.checkPassword(u, v.cur))) return { cur: 'Current password is incorrect' };
    if (v.cur === v.p1) return { p1: 'Choose a different password' };
    await Auth.setPassword(u, v.p1); Store.commit(() => { u.mustChange = false; }, { allowRO: true }); Auth.audit('password_change', 'users', `${u.username} changed password`, { recordId: u.id }); toast('Password changed');
  } });
});
act('me:2fa', () => {
  const u = Auth.user; const secret = Crypto.newTotpSecret(); const uri = `otpauth://totp/${encodeURIComponent(Brand.appName())}:${encodeURIComponent(u.username)}?secret=${secret}&issuer=${encodeURIComponent(Brand.appName())}`;
  formModal({ title: 'Set up two-step verification', size: 'sm', submit: 'Verify & enable', intro: html`<p class="sm">Scan with Google Authenticator / Microsoft Authenticator / Authy:</p><div class="qr-box">${raw(QR.svg(uri, 4))}</div><p class="sm center">Manual key: <code class="secret">${secret.replace(/(.{4})/g, '$1 ')}</code></p>`, fields: [{ name: 'code', label: '6-digit code from the app', required: true }], onSubmit: async (v) => {
    if (!(await Crypto.verifyTotp(secret, v.code))) return { code: 'Code does not match. Try the next one.' };
    Store.commit(() => { u.totp = { secret, enabled: true, at: new Date().toISOString() }; }, { allowRO: true }); Auth.audit('2fa_enabled', 'users', `${u.username} enabled 2FA`, { recordId: u.id }); toast('Two-step verification enabled');
  } });
});
act('me:2faoff', async () => { const u = Auth.user; const p = await promptDlg('Turn off 2FA', 'Enter your password to confirm', { type: 'password', validate: async (v) => (await Auth.checkPassword(u, v)) ? '' : 'Incorrect password' }); if (p === null) return; Store.commit(() => { u.totp = null; }, { allowRO: true }); Auth.audit('2fa_disabled', 'users', `${u.username} disabled 2FA`, { recordId: u.id }); toast('2FA turned off'); });

/* ---- T&C Template actions ---- */
function tcForm(val, idx) {
  formModal({
    title: idx === undefined ? 'New T&C Template' : 'Edit T&C Template',
    size: 'md', submit: idx === undefined ? 'Add Template' : 'Save',
    fields: [
      { name: 'name', label: 'Template Name (e.g. "Standard", "Consulting", "Retainer")', required: true, full: true },
      { name: 'text', label: 'Terms & Conditions Text', type: 'textarea', full: true, rows: 8, required: true },
      { name: 'isDefault', label: 'Set as default for new invoices', type: 'checkbox' }
    ],
    values: val || { name: '', text: '', isDefault: false },
    onSubmit: (v) => {
      Store.commit(s => {
        const tcs = s.settings.tcTemplates = s.settings.tcTemplates || [];
        if (v.isDefault) tcs.forEach(t => t.isDefault = false);
        if (idx === undefined) { tcs.push({ id: uid('tc'), ...v }); }
        else { Object.assign(tcs[idx], v); }
      });
      Auth.audit('edit', 'settings', `T&C template "${v.name}" ${idx === undefined ? 'created' : 'updated'}`);
      toast('Saved');
    }
  });
}
act('tc:new', () => tcForm());
act('tc:edit', (a) => { const tcs = Store.s.settings.tcTemplates || []; tcForm(clone(tcs[+a.dataset.id]), +a.dataset.id); });
act('tc:del', async (a) => {
  const tcs = Store.s.settings.tcTemplates || [];
  const t = tcs[+a.dataset.id];
  if (!(await confirmDlg(`Delete T&C template "${t.name}"?`, { danger: true, ok: 'Delete' }))) return;
  Store.commit(s => { s.settings.tcTemplates.splice(+a.dataset.id, 1); });
  Auth.audit('delete', 'settings', `T&C template "${t.name}" deleted`);
  toast('Deleted');
});
act('tc:default', (a) => {
  Store.commit(s => {
    const tcs = s.settings.tcTemplates || [];
    tcs.forEach((t, i) => t.isDefault = i === +a.dataset.id);
  });
  toast('Default updated');
});
