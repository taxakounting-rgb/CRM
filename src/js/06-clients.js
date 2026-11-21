/* ==========================================================================
   06-clients.js — Client management: list (table/cards), filters, bulk actions,
   add/edit with duplicate check, Client 360 profile with tabs, CSV import, print.
   ========================================================================== */
const Clients = {
  fields(c = {}) {
    return [
      { type: 'section', label: 'Client details' },
      { name: 'name', label: 'Client name', required: true, placeholder: 'e.g. John Smith or Acme Ltd' },
      { name: 'father', label: 'Contact person' },
      { name: 'cnic', label: 'ID / Reg. no.', type: 'cnic' },
      { name: 'ntn', label: 'Tax / VAT no.', type: 'ntn' },
      { name: 'mobile', label: 'Mobile', type: 'mobile', required: true },
      { name: 'whatsapp', label: 'WhatsApp', type: 'mobile', help: 'Leave blank to use mobile' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'regDate', label: 'Registration date', type: 'date' },
      { name: 'address', label: 'Address', type: 'textarea', full: true, rows: 2 },
      { type: 'section', label: 'Company & assignment' },
      { name: 'businessName', label: 'Company name' },
      { name: 'businessType', label: 'Client type', type: 'select', list: 'businessTypes' },
      { name: 'status', label: 'Status', type: 'select', list: 'clientStatuses', required: true },
      { name: 'branch', label: 'Branch', type: 'select', list: 'branches' },
      { name: 'assignedTo', label: 'Assigned to', type: 'select', options: memberOpts, required: Auth.assignedOnly() },
      { name: 'tags', label: 'Tags', type: 'multi', list: 'tags', full: true }
    ];
  },
  /* Duplicate check on ID / Reg. no. / Tax No / mobile across all clients (not only visible ones). */
  dupErrors(v, selfId) {
    const errs = {}; const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    [['cnic', 'ID / Reg. no.'], ['ntn', 'Tax / VAT no.'], ['mobile', 'phone']].forEach(([k, lbl]) => {
      if (!v[k]) return;
      const d = Store.s.clients.find((c) => c.id !== selfId && norm(c[k]) && norm(c[k]) === norm(v[k]));
      if (d) errs[k] = `Duplicate ${lbl}: already used by ${d.code} · ${d.name}`;
    });
    return errs;
  },
  open(c) {
    const isNew = !c;
    if (isNew && !License.allow('clients')) return;
    const vals = c ? clone(c) : { status: Lists.idByName('clientStatuses', 'Active') || (Lists.all('clientStatuses')[0] || {}).id, regDate: today(), branch: (Lists.all('branches')[0] || {}).id, assignedTo: Auth.assignedOnly() ? Auth.memberId() : '' };
    formModal({
      title: isNew ? 'New client' : `Edit client ${c.code}`, size: 'lg', fields: this.fields(c), values: vals,
      intro: isNew ? html`<p class="muted sm">Customer code is generated automatically from the first letter of the name (e.g. Ali → A1).</p>` : '',
      onSubmit: (v) => {
        const dup = this.dupErrors(v, c && c.id); if (Object.keys(dup).length) return dup;
        if (Auth.assignedOnly() && v.assignedTo !== Auth.memberId()) return { assignedTo: 'You can only assign clients to yourself.' };
        if (isNew) {
          const rec = Rec.stamp(Object.assign({ id: uid('c'), archived: false }, v), true);
          Store.commit((s) => { rec.code = Store.clientCode(v.name); s.clients.push(rec); Timeline.add(rec.id, 'created', `Client created with code ${rec.code}`); });
          Auth.audit('create', 'clients', `Created client ${rec.code} ${rec.name}`, { recordId: rec.id, new: v });
          toast(`Client ${rec.code} created`);
          if (rec.assignedTo) Notify.toMember(rec.assignedTo, 'assignment', 'New client assigned', `${rec.code} · ${rec.name} has been assigned to you.`, '#/clients/' + rec.code);
        } else {
          const d = Auth.diff(c, v);
          const reassigned = v.assignedTo !== c.assignedTo;
          Store.commit(() => { if (v.status !== c.status) Timeline.add(c.id, 'status', `Status changed to ${Lists.name('clientStatuses', v.status)}`); Object.assign(c, v); Rec.stamp(c); });
          Auth.audit('edit', 'clients', `Edited client ${c.code}`, { recordId: c.id, old: d.old, new: d.new });
          if (reassigned && v.assignedTo) Notify.toMember(v.assignedTo, 'assignment', 'Client assigned to you', `${c.code} · ${c.name}`, '#/clients/' + c.code);
          toast('Client updated');
        }
      }
    });
  },
  async del(c) {
    const linked = Store.s.tasks.filter((t) => t.clientId === c.id).length + Store.s.invoices.filter((i) => i.clientId === c.id).length;
    if (!(await confirmDlg(html`Delete client <b>${c.code} · ${c.name}</b>?${linked ? html`<br><br><span class="warn-txt">This client has ${linked} linked tasks/invoices. They will remain but show as "unknown client". Consider archiving instead.</span>` : ''}`, { danger: true, ok: 'Delete' }))) return;
    Rec.remove('clients', c, `Client ${c.code}`, 'clients');
    if (Router.cur.params[0]) location.hash = '#/clients';
  },
  archive(c, on) {
    Store.commit(() => { c.archived = on; Timeline.add(c.id, 'status', on ? 'Client archived' : 'Client restored from archive'); });
    Auth.audit('edit', 'clients', `${on ? 'Archived' : 'Unarchived'} client ${c.code}`, { recordId: c.id, old: { archived: !on }, new: { archived: on } });
    toast(on ? 'Client archived' : 'Client restored');
  },
  filtered() {
    const f = vs('clients');
    return Auth.clients(true).filter((c) => (f.archived ? c.archived : !c.archived)
      && textMatch(f.q, c.name, c.code, c.cnic, c.ntn, c.mobile, c.email, c.businessName, c.father)
      && (!f.status || c.status === f.status) && (!f.type || c.businessType === f.type) && (!f.branch || c.branch === f.branch)
      && (!f.officer || c.assignedTo === f.officer) && (!f.tag || (c.tags || []).includes(f.tag)) && inRange(c.regDate, f.from, f.to));
  },
  cols() {
    return [
      { key: 'code', label: 'Code', get: (c) => c.code[0] + pad(c.code.slice(1), 6), render: (c) => html`<a href="#/clients/${c.code}" class="code">${c.code}</a>` },
      { key: 'name', label: 'Client', render: (c) => html`<a href="#/clients/${c.code}" class="strong">${c.name}</a>${c.businessName ? html`<br><small class="muted">${c.businessName}</small>` : ''}` },
      { key: 'cnic', label: 'ID / Tax no.', render: (c) => html`${c.cnic || '—'}<br><small class="muted">${c.ntn || ''}</small>` },
      { key: 'mobile', label: 'Mobile' },
      { key: 'businessType', label: 'Type', get: (c) => Lists.name('businessTypes', c.businessType), render: (c) => Lists.name('businessTypes', c.businessType) },
      { key: 'assignedTo', label: 'Assigned to', get: (c) => DB.memberName(c.assignedTo), render: (c) => DB.memberName(c.assignedTo) },
      { key: 'status', label: 'Status', get: (c) => Lists.name('clientStatuses', c.status), render: (c) => html`${listBadge('clientStatuses', c.status)}${c.archived ? badge('Archived', 'grey') : ''}` },
      { key: 'act', label: '', sort: false, cls: 'act', render: (c) => this.rowActions(c) }
    ];
  },
  rowActions(c) {
    return html`<div class="row-acts">${c.mobile ? html`<a class="icon-btn sm" href="tel:${c.mobile.replace(/-/g, '')}" title="Call" aria-label="Call">${icon('phone')}</a>` : ''}${btn('', 'client:wa', { id: c.id, icon: 'wa', cls: 'icon-btn sm wa', title: 'WhatsApp' })}${Auth.can('clients', 'edit') ? btn('', 'client:edit', { id: c.id, icon: 'edit', cls: 'icon-btn sm', title: 'Edit' }) : ''}</div>`;
  },
  card(c) {
    const open = Auth.tasks().filter((t) => t.clientId === c.id && !Lists.isDone(t.status)).length;
    return html`<div class="card ccard"><div class="ccard-h">${avatar(c.name, '', 42)}<div><a href="#/clients/${c.code}" class="strong">${c.name}</a><div class="muted sm"><span class="code">${c.code}</span> · ${Lists.name('businessTypes', c.businessType)}</div></div>${listBadge('clientStatuses', c.status)}</div>
      <div class="ccard-b sm"><div>${icon('phone')} ${c.mobile || '—'}</div><div>${icon('mail')} ${c.email || '—'}</div><div>${icon('user')} ${DB.memberName(c.assignedTo)}</div><div>${icon('tasks')} ${open} open tasks</div></div>
      <div class="ccard-f">${(c.tags || []).map((t) => listBadge('tags', t))}<span class="grow"></span>${this.rowActions(c)}</div></div>`;
  },
  exportRows(rows) {
    const H = ['Code', 'Name', 'Contact Person', 'ID / Reg. no.', 'Tax / VAT no.', 'Mobile', 'WhatsApp', 'Email', 'Address', 'Company Name', 'Client Type', 'Registration Date', 'Status', 'Branch', 'Assigned To', 'Tags'];
    return [H, rows.map((c) => [c.code, c.name, c.father, c.cnic, c.ntn, c.mobile, c.whatsapp, c.email, c.address, c.businessName, Lists.name('businessTypes', c.businessType), c.regDate, Lists.name('clientStatuses', c.status), Lists.name('branches', c.branch), DB.memberName(c.assignedTo), (c.tags || []).map((t) => Lists.name('tags', t)).join('; ')])];
  }
};

Views.clients = {
  onNew() { if (Auth.can('clients', 'create')) Clients.open(); },
  render(params) {
    if (params[0]) return Client360.render(params[0]);
    const f = vs('clients', { view: 'table' }); const rows = Clients.filtered(); const st = tstate('clients');
    const sel = st.sel.size;
    const actions = html`${Auth.can('clients', 'create') ? (License.has('csv_import') ? btn('Import CSV', 'client:import', { icon: 'upload', cls: 'ghost' }) : License.lock('csv_import')) : ''}${Auth.can('clients', 'export') ? btn('Export', 'client:export', { icon: 'download', cls: 'ghost' }) : ''}${Auth.can('clients', 'create') ? btn('New client', 'client:new', { icon: 'plus', cls: 'primary' }) : ''}`;
    return html`${pageHead('Clients', `${rows.length} ${f.archived ? 'archived' : ''} clients${Auth.assignedOnly() ? ' assigned to you' : ''}`, actions)}
      <div class="card filters">${fInput('clients.q', 'Search name, code, ID, phone, email…')}
        ${fSelect('clients.status', 'All statuses', listOpts('clientStatuses'))}${fSelect('clients.type', 'All business types', listOpts('businessTypes'))}
        ${Auth.assignedOnly() ? '' : fSelect('clients.officer', 'All staff', memberOpts())}${fSelect('clients.branch', 'All branches', listOpts('branches'))}${fSelect('clients.tag', 'All tags', listOpts('tags'))}
        ${fDate('clients.from', 'Registered from')}${fDate('clients.to', 'to')}
        <label class="chk"><input type="checkbox" data-vs="clients.archived" ${f.archived ? raw('checked') : ''}> <span>Show archived</span></label>
        <span class="grow"></span><div class="seg">${btn('', 'nav', { cls: 'icon-btn ' + (f.view !== 'cards' ? 'on' : ''), icon: 'list', title: 'Table view', extra: 'data-vs-set="clients.view" data-val="table"' })}${btn('', 'nav', { cls: 'icon-btn ' + (f.view === 'cards' ? 'on' : ''), icon: 'grid', title: 'Card view', extra: 'data-vs-set="clients.view" data-val="cards"' })}</div>
        ${savedFiltersBar('clients')}</div>
      ${sel && f.view !== 'cards' ? html`<div class="bulk card"><b>${sel} selected</b>${Auth.can('clients', 'edit') ? html`${btn('Assign to', 'client:bulk-assign', { cls: 'sm' })}${btn('Change status', 'client:bulk-status', { cls: 'sm' })}${btn('Archive', 'client:bulk-archive', { cls: 'sm' })}` : ''}${Auth.can('clients', 'export') ? btn('Export selected', 'client:bulk-export', { cls: 'sm' }) : ''}${Auth.can('clients', 'delete') ? btn('Delete', 'client:bulk-delete', { cls: 'sm danger' }) : ''}${btn('Clear', 'client:bulk-clear', { cls: 'sm ghost' })}</div>` : ''}
      ${f.view === 'cards' ? (rows.length ? html`<div class="cards">${rows.slice(0, 120).map((c) => Clients.card(c))}</div>${rows.length > 120 ? html`<p class="muted center">Showing first 120 cards. Use filters or table view for more.</p>` : ''}` : emptyState('No clients found', 'Add your first client or change the filters.', Auth.can('clients', 'create') ? btn('New client', 'client:new', { cls: 'primary', icon: 'plus' }) : ''))
        : html`<div class="card p0">${dataTable('clients', { rows, cols: Clients.cols(), selectable: true, empty: emptyState('No clients found', 'Add your first client or change the filters.', Auth.can('clients', 'create') ? btn('New client', 'client:new', { cls: 'primary', icon: 'plus' }) : '') })}</div>`}`;
  }
};

const selClients = () => Array.from(tstate('clients').sel).map((id) => DB.client(id)).filter(Boolean);
act('client:new', () => Clients.open());
act('client:edit', (a) => Clients.open(DB.client(a.dataset.id)));
act('client:del', (a) => Clients.del(DB.client(a.dataset.id)));
act('client:archive', (a) => { const c = DB.client(a.dataset.id); Clients.archive(c, !c.archived); });
act('client:wa', (a) => Contact.compose('whatsapp', DB.client(a.dataset.id)));
act('client:email', (a) => Contact.compose('email', DB.client(a.dataset.id)));
act('client:export', () => { const [H, R] = Clients.exportRows(Clients.filtered()); downloadFile('clients.csv', toCSV(H, R), 'text/csv'); Auth.audit('export', 'clients', `Exported ${R.length} clients (CSV)`); });
act('client:bulk-export', () => { const [H, R] = Clients.exportRows(selClients()); downloadFile('clients-selected.csv', toCSV(H, R), 'text/csv'); Auth.audit('export', 'clients', `Exported ${R.length} selected clients`); });
act('client:bulk-clear', () => { tstate('clients').sel.clear(); Router.refresh(); });
act('client:bulk-assign', () => {
  formModal({ title: 'Assign to', fields: [{ name: 'to', label: 'Assigned to', type: 'select', options: memberOpts, required: true }], submit: 'Assign', onSubmit: (v) => {
    const cs = selClients();
    Store.commit(() => cs.forEach((c) => { c.assignedTo = v.to; Rec.stamp(c); }));
    Auth.audit('edit', 'clients', `Bulk assigned ${cs.length} clients to ${DB.memberName(v.to)}`, { new: { assignedTo: v.to, clients: cs.map((c) => c.code) } });
    Notify.toMember(v.to, 'assignment', 'Clients assigned to you', `${cs.length} clients were assigned to you.`, '#/clients');
    tstate('clients').sel.clear(); toast(`${cs.length} clients assigned`);
  } });
});
act('client:bulk-status', () => {
  formModal({ title: 'Change status', fields: [{ name: 'st', label: 'New status', type: 'select', list: 'clientStatuses', required: true }], submit: 'Update', onSubmit: (v) => {
    const cs = selClients();
    Store.commit(() => cs.forEach((c) => { c.status = v.st; Rec.stamp(c); Timeline.add(c.id, 'status', `Status changed to ${Lists.name('clientStatuses', v.st)}`); }));
    Auth.audit('edit', 'clients', `Bulk status change for ${cs.length} clients → ${Lists.name('clientStatuses', v.st)}`);
    tstate('clients').sel.clear(); toast('Status updated');
  } });
});
act('client:bulk-archive', async () => { const cs = selClients(); if (!(await confirmDlg(`Archive ${cs.length} clients?`))) return; Store.commit(() => cs.forEach((c) => { c.archived = true; })); Auth.audit('edit', 'clients', `Archived ${cs.length} clients`); tstate('clients').sel.clear(); toast('Archived'); });
act('client:bulk-delete', async () => {
  const cs = selClients(); if (!(await confirmDlg(`Delete ${cs.length} clients? You can undo for 5 seconds.`, { danger: true, ok: 'Delete' }))) return;
  const backup = Store.s.clients.slice();
  Store.commit((s) => { const ids = new Set(cs.map((c) => c.id)); s.clients = s.clients.filter((c) => !ids.has(c.id)); });
  Auth.audit('delete', 'clients', `Bulk deleted ${cs.length} clients`, { old: cs.map((c) => c.code) });
  tstate('clients').sel.clear();
  toast(`${cs.length} clients deleted`, 'ok', { undo: () => { Store.commit((s) => { s.clients = backup; }); Auth.audit('restore', 'clients', 'Undo bulk delete'); } });
});

/* ---------- CSV import with column mapping + duplicate preview ---------- */
act('client:import', () => {
  if (!License.need('csv_import')) return;
  const targets = [['name', 'Name *'], ['father', 'Contact Person'], ['cnic', 'ID / Reg. no.'], ['ntn', 'Tax / VAT no.'], ['mobile', 'Mobile'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['address', 'Address'], ['businessName', 'Company Name'], ['businessType', 'Client Type'], ['regDate', 'Registration Date'], ['status', 'Status'], ['branch', 'Branch'], ['assignedTo', 'Assigned To']];
  Modal.open({
    title: 'Import clients from CSV', size: 'lg',
    body: html`<div data-step1><p>Choose a CSV file. The first row must contain column headers. You can map the columns in the next step.</p><input type="file" accept=".csv,text/csv" data-file><p class="help">Tip: export the client list first to get a ready-made template.</p>${btn('Download template', 'client:import-tpl', { cls: 'sm ghost', icon: 'download' })}</div><div data-step2 hidden></div>`,
    foot: html`<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" data-go disabled>Import</button>`,
    onMount: (el, m) => {
      let rows = [], head = [], map = {};
      const norm = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');
      const preview = () => {
        const recs = rows.map((r) => { const o = {}; Object.entries(map).forEach(([k, i]) => { if (i !== '') o[k] = (r[+i] || '').trim(); }); return o; });
        const seen = new Set();
        const checked = recs.map((o) => {
          if (o.cnic) o.cnic = Masks.cnic(o.cnic); if (o.mobile) o.mobile = Masks.mobile(o.mobile); if (o.whatsapp) o.whatsapp = Masks.mobile(o.whatsapp); if (o.ntn) o.ntn = Masks.ntn(o.ntn);
          let issue = !o.name ? 'Missing name' : '';
          const dup = Clients.dupErrors(o); if (!issue && Object.keys(dup).length) issue = Object.values(dup)[0];
          const k = [o.cnic, o.mobile].filter(Boolean).join('|'); if (!issue && k && seen.has(k)) issue = 'Duplicate inside file'; if (k) seen.add(k);
          if (!issue) { const v = Valid.cnic(o.cnic) || Valid.mobile(o.mobile) || Valid.email(o.email); if (v) issue = 'Warning: ' + v; }
          return { o, issue };
        });
        el._recs = checked;
        const ok = checked.filter((x) => !x.issue || x.issue.startsWith('Warning')).length;
        el.querySelector('[data-prev]').innerHTML = String(html`<p><b>${ok}</b> of ${checked.length} rows will be imported. Rows with duplicates or missing names are skipped.</p><div class="tbl-wrap" style="max-height:260px"><table class="tbl"><thead><tr><th>#</th><th>Name</th><th>ID / Reg. no.</th><th>Mobile</th><th>Check</th></tr></thead><tbody>${checked.slice(0, 200).map((x, i) => html`<tr class="${x.issue && !x.issue.startsWith('Warning') ? 'row-bad' : ''}"><td>${i + 1}</td><td>${x.o.name || ''}</td><td>${x.o.cnic || ''}</td><td>${x.o.mobile || ''}</td><td>${x.issue ? badge(x.issue, x.issue.startsWith('Warning') ? 'amber' : 'red') : badge('OK', 'green')}</td></tr>`)}</tbody></table></div>`);
        el.querySelector('[data-go]').disabled = !ok;
      };
      el.querySelector('[data-file]').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const all = parseCSV(await f.text()); if (all.length < 2) { toast('The file has no data rows', 'warn'); return; }
        head = all[0]; rows = all.slice(1);
        targets.forEach(([k, l]) => { const i = head.findIndex((h) => norm(h) === norm(k) || norm(h) === norm(l) || (k === 'name' && norm(h) === 'clientname') || (k === 'father' && norm(h).startsWith('father')) || (k === 'assignedTo' && norm(h).includes('officer'))); map[k] = i >= 0 ? String(i) : ''; });
        const s2 = el.querySelector('[data-step2]'); s2.hidden = false;
        s2.innerHTML = String(html`<h4>Map columns (${rows.length} rows found)</h4><div class="map-grid">${targets.map(([k, l]) => html`<label class="fld"><span>${l}</span><select data-map="${k}"><option value="">— skip —</option>${head.map((h, i) => html`<option value="${i}" ${map[k] === String(i) ? raw('selected') : ''}>${h}</option>`)}</select></label>`)}</div><div data-prev></div>`);
        $$('[data-map]', s2).forEach((s) => s.onchange = () => { map[s.dataset.map] = s.value; preview(); });
        preview();
      };
      el.querySelector('[data-go]').onclick = () => {
        let good = (el._recs || []).filter((x) => !x.issue || x.issue.startsWith('Warning'));
        const lim = License.limit('clients'); if (lim) { const room = Math.max(0, lim - License.usage().clients); if (good.length > room) { toast(`Your plan allows ${lim} clients. Only ${room} more can be imported.`, 'warn', { timeout: 6000 }); good = good.slice(0, room); } if (!good.length) return; }
        const defStatus = Lists.idByName('clientStatuses', 'Active') || (Lists.all('clientStatuses')[0] || {}).id;
        Store.commit((s) => good.forEach(({ o }) => {
          const rec = Rec.stamp({ id: uid('c'), archived: false, father: o.father || '', cnic: o.cnic || '', ntn: o.ntn || '', mobile: o.mobile || '', whatsapp: o.whatsapp || '', email: o.email || '', address: o.address || '', businessName: o.businessName || '', name: o.name,
            businessType: Lists.idByName('businessTypes', o.businessType), regDate: o.regDate ? isoDate(o.regDate) || today() : today(), status: Lists.idByName('clientStatuses', o.status) || defStatus,
            branch: Lists.idByName('branches', o.branch) || (Lists.all('branches')[0] || {}).id, assignedTo: Auth.assignedOnly() ? Auth.memberId() : ((Store.s.team.find((t) => t.name.toLowerCase() === String(o.assignedTo || '').toLowerCase()) || {}).id || ''), tags: [] }, true);
          rec.code = Store.clientCode(rec.name); s.clients.push(rec); Timeline.add(rec.id, 'created', `Imported from CSV with code ${rec.code}`);
        }));
        Auth.audit('import', 'clients', `Imported ${good.length} clients from CSV`);
        toast(`${good.length} clients imported`); m.close();
      };
    }
  });
});
act('client:import-tpl', () => downloadFile('client-import-template.csv', toCSV(['Name', 'Contact Person', 'ID / Reg. no.', 'Tax / VAT no.', 'Mobile', 'WhatsApp', 'Email', 'Address', 'Company Name', 'Client Type', 'Registration Date', 'Status', 'Branch', 'Assigned To'], [['John Smith', 'John Smith', 'ID-123456', 'TAX-7890', '+1 555 010 1234', '', 'john@example.com', '12 Main Street', 'Smith Trading', 'Small Business', today(), 'Active', 'Head Office', '']]), 'text/csv'));

/* ---------- Client 360 profile ---------- */
const Client360 = {
  render(code) {
    const c = DB.clientByCode(code);
    if (!c || !Auth.canSeeClient(c.id)) return emptyState('Client not found', 'This client does not exist or is not assigned to you.', btn('Back to clients', 'nav', { extra: 'data-href="#/clients"', cls: 'primary' }));
    const f = vs('c360', { tab: 'overview' }); if (f.code !== code) { f.code = code; f.tab = f.tab || 'overview'; }
    const tasks = Store.s.tasks.filter((t) => t.clientId === c.id);
    const svc = Store.s.services.filter((s) => s.clientId === c.id);
    const creds = Store.s.creds.filter((x) => x.clientId === c.id);
    const docs = Store.s.documents.filter((d) => d.clientId === c.id);
    const invs = Store.s.invoices.filter((i) => i.clientId === c.id);
    const notes = Store.s.notes.filter((n) => n.clientId === c.id);
    const tl = Timeline.of(c.id);
    const tabs = [['overview', 'Overview'], ['services', 'Services', svc.length], ['tasks', 'Tasks', tasks.length]];
    if (Auth.can('vault')) tabs.push(['creds', 'Credentials', creds.length]);
    if (Auth.can('documents')) tabs.push(['docs', 'Documents', docs.length]);
    if (Auth.can('invoices')) tabs.push(['invoices', 'Invoices & Payments', invs.length]);
    tabs.push(['notes', 'Notes', notes.length], ['timeline', 'Timeline', tl.length]);
    const bal = sum(invs, (i) => DB.invStatus(i) === 'Draft' || DB.invStatus(i) === 'Cancelled' ? 0 : DB.invBalance(i));
    let body = '';
    try { body = this['tab_' + f.tab] ? this['tab_' + f.tab](c, { tasks, svc, creds, docs, invs, notes, tl }) : ''; } catch (e) { console.warn(e); body = emptyState('Could not load tab', e.message); }
    return html`<div class="crumbs"><a href="#/clients">Clients</a> › ${c.code}</div>
      <div class="card c360-h"><div class="c360-id">${avatar(c.name, '', 64)}<div><h1>${c.name} <span class="code big">${c.code}</span></h1><p class="muted">${c.businessName || ''}${c.businessName ? ' · ' : ''}${Lists.name('businessTypes', c.businessType)} · ${Lists.name('branches', c.branch)}</p><div class="chips">${listBadge('clientStatuses', c.status)}${c.archived ? badge('Archived', 'grey') : ''}${(c.tags || []).map((t) => listBadge('tags', t))}</div></div></div>
        <div class="c360-stats"><div><b>${tasks.filter((t) => !Lists.isDone(t.status)).length}</b><small>Open tasks</small></div><div><b>${svc.length}</b><small>Services</small></div>${Auth.can('invoices') ? html`<div><b>${moneyShort(bal)}</b><small>Balance due</small></div>` : ''}<div><b>${DB.memberName(c.assignedTo)}</b><small>Officer</small></div></div>
        <div class="c360-acts">${c.mobile ? html`<a class="btn ghost" href="tel:${c.mobile.replace(/-/g, '')}">${icon('phone')}<span>Call</span></a>` : ''}${btn('WhatsApp', 'client:wa', { id: c.id, icon: 'wa', cls: 'wa' })}${btn('Email', 'client:email', { id: c.id, icon: 'mail', cls: 'ghost' })}${btn('Print', 'client:print', { id: c.id, icon: 'print', cls: 'ghost' })}${btn('Follow-up', 'fu:new', { id: c.id, icon: 'calendar', cls: 'ghost' })}${Auth.can('clients', 'edit') ? html`${btn('Edit', 'client:edit', { id: c.id, icon: 'edit', cls: 'ghost' })}${btn(c.archived ? 'Unarchive' : 'Archive', 'client:archive', { id: c.id, cls: 'ghost' })}` : ''}${Auth.can('clients', 'delete') ? btn('', 'client:del', { id: c.id, icon: 'trash', cls: 'icon-btn danger-txt', title: 'Delete client' }) : ''}</div></div>
      ${tabsBar('c360', tabs, f.tab)}<div class="tab-body">${body}</div>`;
  },
  tab_overview(c, d) {
    const fus = Store.s.followups.filter((x) => x.clientId === c.id && !x.done).sort((a, b) => (a.date > b.date ? 1 : -1));
    const activity = Store.s.audit.filter((a) => a.recordId === c.id).slice(0, 8);
    return html`<div class="grid2"><div class="card"><h3>Client details</h3>${kv([['Customer code', html`<span class="code">${c.code}</span>`], ['Contact Person', c.father], ['ID / Reg. no.', c.cnic], ['Tax / VAT no.', c.ntn], ['Mobile', c.mobile], ['WhatsApp', c.whatsapp || c.mobile], ['Email', c.email ? html`<a href="mailto:${c.email}">${c.email}</a>` : ''], ['Address', c.address], ['Company name', c.businessName], ['Client type', Lists.name('businessTypes', c.businessType)], ['Registration date', fmtDate(c.regDate)], ['Branch', Lists.name('branches', c.branch)], ['Assigned to', DB.memberName(c.assignedTo)], ['Created', `${fmtDateTime(c.createdAt)} by ${c.createdBy || ''}`]])}</div>
      <div><div class="card"><div class="card-h"><h3>Follow-ups</h3>${btn('Add', 'fu:new', { id: c.id, cls: 'sm ghost', icon: 'plus' })}</div>${fus.length ? html`<ul class="list">${fus.map((x) => Followups.item(x))}</ul>` : html`<p class="muted">No pending follow-ups.</p>`}</div>
      <div class="card"><h3>Upcoming tasks</h3>${d.tasks.filter((t) => !Lists.isDone(t.status)).sort((a, b) => (a.due > b.due ? 1 : -1)).slice(0, 5).map((t) => Tasks.miniRow(t))}${d.tasks.some((t) => !Lists.isDone(t.status)) ? '' : html`<p class="muted">No open tasks.</p>`}</div>
      <div class="card"><h3>Record activity</h3>${activity.length ? html`<ul class="list sm">${activity.map((a) => html`<li><b>${a.user}</b> ${a.action} — ${a.summary}<br><small class="muted">${fmtDateTime(a.at)}</small></li>`)}</ul>` : html`<p class="muted">No activity yet.</p>`}</div></div></div>`;
  },
  tab_services(c, d) {
    return html`<div class="card"><div class="card-h"><h3>Services</h3>${Auth.can('services', 'create') ? btn('Add service', 'svc:new', { cls: 'sm primary', icon: 'plus', extra: `data-client="${esc(c.id)}"` }) : ''}</div>${Services.table(d.svc, 'c360svc')}</div>`;
  },
  tab_tasks(c, d) {
    return html`<div class="card"><div class="card-h"><h3>Tasks</h3>${Auth.can('tasks', 'create') ? btn('New task', 'task:new', { cls: 'sm primary', icon: 'plus', extra: `data-client="${esc(c.id)}"` }) : ''}</div>${Tasks.table(d.tasks, 'c360tasks')}</div>`;
  },
  tab_creds(c, d) {
    return html`<div class="card"><div class="card-h"><h3>Portal credentials</h3>${Auth.can('vault', 'create') ? btn('Add credential', 'vault:new', { cls: 'sm primary', icon: 'plus', extra: `data-client="${esc(c.id)}"` }) : ''}</div>${Vault.table(d.creds, 'c360creds')}</div>`;
  },
  tab_docs(c, d) {
    return html`<div class="card"><div class="card-h"><h3>Documents</h3>${Auth.can('documents', 'create') ? btn('Upload', 'doc:upload', { cls: 'sm primary', icon: 'upload', extra: `data-client="${esc(c.id)}"` }) : ''}</div>${Docs.table(d.docs, 'c360docs')}</div>`;
  },
  tab_invoices(c, d) {
    const pays = Store.s.payments.filter((p) => d.invs.some((i) => i.id === p.invoiceId));
    return html`<div class="card"><div class="card-h"><h3>Invoices</h3>${btn('Statement', 'inv:statement', { cls: 'sm ghost', icon: 'print', id: c.id })}${Auth.can('invoices', 'create') ? btn('New invoice', 'inv:new', { cls: 'sm primary', icon: 'plus', extra: `data-client="${esc(c.id)}"` }) : ''}</div>${Invoices.table(d.invs, 'c360inv')}</div>
      <div class="card"><h3>Payments received</h3>${Invoices.payTable(pays, 'c360pay')}</div>`;
  },
  tab_notes(c, d) {
    const users = Store.s.users.filter((u) => u.status === 'active');
    return html`<div class="card"><h3>Internal notes</h3><form class="note-form" data-note-form="${c.id}"><textarea class="inp" rows="3" name="text" placeholder="Write a note… type @username to mention a colleague" aria-label="Note"></textarea><div class="row-between"><div class="chips sm">Mention: ${users.map((u) => html`<button type="button" class="chip-b" data-mention="${u.username}">@${u.username}</button>`)}</div><button class="btn primary sm" type="submit">Add note</button></div></form>
      <ul class="notes">${d.notes.slice().sort((a, b) => (a.at < b.at ? 1 : -1)).map((n) => html`<li>${avatar(n.by, '', 30)}<div><b>${n.by}</b> <small class="muted">${fmtDateTime(n.at)}</small><p>${raw(esc(n.text).replace(/@([a-z0-9._-]+)/gi, '<span class="mention">@$1</span>'))}</p></div>${n.userId === Auth.user.id || Auth.can('clients', 'delete') ? btn('', 'note:del', { id: n.id, icon: 'trash', cls: 'icon-btn sm', title: 'Delete note' }) : ''}</li>`)}</ul>${d.notes.length ? '' : html`<p class="muted">No notes yet.</p>`}</div>`;
  },
  tab_timeline(c, d) {
    return html`<div class="card"><h3>Timeline</h3>${d.tl.length ? html`<ol class="timeline">${d.tl.map((t) => html`<li class="tl-${t.type}"><span class="tl-ic">${icon(Timeline.ICON[t.type] || 'check')}</span><div><b>${t.text}</b><br><small class="muted">${fmtDateTime(t.at)} · ${t.by}</small></div></li>`)}</ol>` : html`<p class="muted">No events yet.</p>`}</div>`;
  },
  mount(root) {
    const f = root.querySelector('[data-note-form]'); if (!f) return;
    $$('[data-mention]', f).forEach((b) => b.onclick = () => { const t = f.text; t.value += (t.value && !t.value.endsWith(' ') ? ' ' : '') + '@' + b.dataset.mention + ' '; t.focus(); });
    f.onsubmit = (e) => {
      e.preventDefault(); const text = f.text.value.trim(); if (!text) return;
      const clientId = f.dataset.noteForm; const c = DB.client(clientId);
      const mentions = Array.from(new Set((text.match(/@([a-z0-9._-]+)/gi) || []).map((m) => m.slice(1).toLowerCase())));
      Store.commit((s) => {
        s.notes.push({ id: uid('n'), clientId, text, by: Auth.user.name, userId: Auth.user.id, at: new Date().toISOString(), mentions });
        Timeline.add(clientId, 'note', 'Note added: ' + text.slice(0, 80));
        mentions.forEach((m) => { const u = Store.s.users.find((x) => x.username.toLowerCase() === m); if (u && u.id !== Auth.user.id) Notify.push(u.id, 'mention', `${Auth.user.name} mentioned you`, `On ${c.code} · ${c.name}: ${text.slice(0, 120)}`, '#/clients/' + c.code); });
      });
      Auth.audit('create', 'clients', `Note added on ${c.code}`, { recordId: clientId });
      toast(mentions.length ? `Note added · ${mentions.length} mentioned` : 'Note added');
    };
  }
};
Views.clients.mount = (root, params) => { if (params[0]) Client360.mount(root); };
act('note:del', (a) => { const n = Store.s.notes.find((x) => x.id === a.dataset.id); if (n) Rec.remove('notes', n, 'Note', 'clients'); });
act('client:print', (a) => {
  const c = DB.client(a.dataset.id);
  const tasks = Store.s.tasks.filter((t) => t.clientId === c.id); const svc = Store.s.services.filter((s) => s.clientId === c.id);
  printHTML(`Client ${c.code}`, html`${printHeader('Client Profile', `${c.code} · ${c.name} · printed ${fmtDateTime(new Date())}`)}
    ${kv([['Customer code', c.code], ['Name', c.name], ['Contact Person', c.father], ['ID / Reg. no.', c.cnic], ['Tax / VAT no.', c.ntn], ['Mobile', c.mobile], ['Email', c.email], ['Address', c.address], ['Business', c.businessName], ['Client type', Lists.name('businessTypes', c.businessType)], ['Status', Lists.name('clientStatuses', c.status)], ['Assigned to', DB.memberName(c.assignedTo)], ['Registration date', fmtDate(c.regDate)]])}
    <h3>Services</h3><table class="ptbl"><tr><th>Service</th><th>Period</th><th>Status</th><th>Fee</th></tr>${svc.map((s) => html`<tr><td>${Lists.name('services', s.service)}</td><td>${s.period}</td><td>${s.status}</td><td>${money(s.fee)}</td></tr>`)}</table>
    <h3>Tasks</h3><table class="ptbl"><tr><th>ID</th><th>Title</th><th>Due</th><th>Status</th></tr>${tasks.map((t) => html`<tr><td>${t.code}</td><td>${t.title}</td><td>${fmtDate(t.due)}</td><td>${Lists.name('taskStatuses', t.status)}</td></tr>`)}</table>`);
});

/* ---------- Follow-up reminders per client ---------- */
const Followups = {
  item(x) {
    const c = DB.client(x.clientId); const d = x.snoozedTo || x.date; const late = d < today();
    return html`<li class="fu ${late ? 'late' : ''}"><div><b>${fmtDate(d)}</b> ${late ? badge('Overdue', 'red') : d === today() ? badge('Today', 'amber') : ''} ${c ? html`<a href="#/clients/${c.code}">${c.code} · ${c.name}</a>` : ''}<br><span>${x.note}</span></div><div class="row-acts">${btn('Done', 'fu:done', { id: x.id, cls: 'sm ghost', icon: 'check' })}${btn('Snooze', 'fu:snooze', { id: x.id, cls: 'sm ghost' })}</div></li>`;
  },
  mine() { const ids = Auth.clientIds(); return Store.s.followups.filter((f) => !f.done && ids.has(f.clientId)); }
};
act('fu:new', (a) => {
  const c = DB.client(a.dataset.id);
  formModal({ title: `Follow-up · ${c.code} ${c.name}`, fields: [{ name: 'date', label: 'Date', type: 'date', required: true }, { name: 'note', label: 'Note', type: 'textarea', required: true, full: true }], values: { date: addDays(today(), 3) }, onSubmit: (v) => {
    Store.commit((s) => { s.followups.push({ id: uid('fu'), clientId: c.id, date: v.date, note: v.note, done: false, userId: Auth.user.id, at: new Date().toISOString() }); Timeline.add(c.id, 'followup', `Follow-up scheduled for ${fmtDate(v.date)}: ${v.note}`); });
    Auth.audit('create', 'clients', `Follow-up added for ${c.code}`, { recordId: c.id }); toast('Follow-up scheduled');
  } });
});
act('fu:done', (a) => { const x = Store.s.followups.find((f) => f.id === a.dataset.id); Store.commit(() => { x.done = true; x.doneAt = new Date().toISOString(); Timeline.add(x.clientId, 'followup', 'Follow-up completed: ' + x.note); }); toast('Follow-up marked done'); });
act('fu:snooze', (a) => {
  const x = Store.s.followups.find((f) => f.id === a.dataset.id);
  formModal({ title: 'Snooze follow-up', fields: [{ name: 'to', label: 'Remind me on', type: 'date', required: true }], values: { to: addDays(today(), 1) }, submit: 'Snooze', onSubmit: (v) => { Store.commit(() => { x.snoozedTo = v.to; }); toast('Snoozed to ' + fmtDate(v.to)); } });
});
