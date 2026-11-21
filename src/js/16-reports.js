/* ==========================================================================
   16-reports.js — Reports with filters, preview, column chooser (report
   builder with saved templates) and export to CSV / Excel (.xls) / PDF (print).
   All rows come from role-scoped data.
   ========================================================================== */
const Reports = {
  defs() {
    const f = vs('rep'); const rng = (d) => inRange(d, f.from, f.to);
    const bal = (cid) => sum(Auth.byClient(Store.s.invoices).filter((i) => i.clientId === cid && !['Draft', 'Cancelled'].includes(DB.invStatus(i))), (i) => DB.invBalance(i));
    const C = (key, label, get, num) => ({ key, label, get, num });
    return {
      clients: { name: 'Client List', filters: ['date', 'officer', 'cstatus'], dateLabel: 'Registered',
        cols: [C('code', 'Code', (c) => c.code), C('name', 'Name', (c) => c.name), C('father', 'Contact Person', (c) => c.father), C('cnic', 'ID / Reg. no.', (c) => c.cnic), C('ntn', 'Tax / VAT no.', (c) => c.ntn), C('mobile', 'Mobile', (c) => c.mobile), C('email', 'Email', (c) => c.email), C('business', 'Business', (c) => c.businessName), C('type', 'Business Type', (c) => Lists.name('businessTypes', c.businessType)), C('status', 'Status', (c) => Lists.name('clientStatuses', c.status)), C('branch', 'Branch', (c) => Lists.name('branches', c.branch)), C('officer', 'Assigned To', (c) => DB.memberName(c.assignedTo)), C('reg', 'Registered', (c) => c.regDate), C('open', 'Open Tasks', (c) => Store.s.tasks.filter((t) => t.clientId === c.id && !Lists.isDone(t.status)).length, 1), ...(Auth.can('invoices') ? [C('bal', 'Balance Due', (c) => bal(c.id), 'm')] : [])],
        rows: () => Auth.clients().filter((c) => rng(c.regDate) && (!f.officer || c.assignedTo === f.officer) && (!f.cstatus || c.status === f.cstatus)) },
      services: { name: 'Active Services', filters: ['date', 'service', 'sstatus'], dateLabel: 'Due/filed',
        cols: [C('code', 'Code', (s) => (DB.client(s.clientId) || {}).code), C('client', 'Client', (s) => (DB.client(s.clientId) || {}).name), C('service', 'Service', (s) => Lists.name('services', s.service)), C('period', 'Period', (s) => s.period), C('fee', 'Fee', (s) => Number(s.fee) || 0, 'm'), C('status', 'Status', (s) => Lists.name('serviceStatuses', s.status)), C('due', 'Due', (s) => s.dueDate), C('filed', 'Completed', (s) => s.filedDate), C('ack', 'Reference', (s) => s.ackNo)],
        rows: () => Auth.byClient(Store.s.services).filter((s) => rng(s.filedDate || s.dueDate || String(s.createdAt).slice(0, 10)) && (!f.service || s.service === f.service) && (!f.sstatus || s.status === f.sstatus)) },
      tasks: { name: 'Task Performance', filters: ['date', 'officer', 'tstatus', 'service'], dateLabel: 'Due',
        cols: [C('code', 'Task ID', (t) => t.code), C('ccode', 'Customer Code', (t) => (DB.client(t.clientId) || {}).code), C('client', 'Client', (t) => (DB.client(t.clientId) || {}).name), C('service', 'Service', (t) => Lists.name('services', t.service)), C('title', 'Title', (t) => t.title), C('to', 'Assigned To', (t) => DB.memberName(t.assignedTo)), C('prio', 'Priority', (t) => Lists.name('priorities', t.priority)), C('start', 'Start', (t) => t.start), C('due', 'Due', (t) => t.due), C('done', 'Completed', (t) => t.completedAt), C('status', 'Status', (t) => Lists.name('taskStatuses', t.status)), C('late', 'Days Late', (t) => { const end = t.completedAt || (Lists.isDone(t.status) ? t.due : today()); const d = t.due ? daysBetween(t.due, end) : 0; return d > 0 ? d : 0; }, 1), C('ontime', 'On Time', (t) => Lists.isDone(t.status) ? (t.completedAt <= t.due ? 'Yes' : 'No') : (DB.isOverdue(t) ? 'Overdue' : 'Open')), C('hours', 'Hours Logged', (t) => Math.round(sum(t.timeLog || [], (l) => l.min) / 6) / 10, 1)],
        rows: () => Auth.tasks().filter((t) => rng(t.due) && (!f.officer || t.assignedTo === f.officer) && (!f.tstatus || t.status === f.tstatus) && (!f.service || t.service === f.service)) },
      productivity: { name: 'Employee Productivity', filters: ['date'], dateLabel: 'Due/completed',
        cols: [C('code', 'EMP-ID', (r) => r.m.code), C('name', 'Name', (r) => r.m.name), C('desig', 'Designation', (r) => Lists.name('designations', r.m.designation)), C('assigned', 'Assigned (due in period)', (r) => r.assigned, 1), C('completed', 'Completed', (r) => r.completed, 1), C('ontime', 'On Time', (r) => r.onTime, 1), C('late', 'Late', (r) => r.completed - r.onTime, 1), C('open', 'Open Now', (r) => r.open, 1), C('overdue', 'Overdue Now', (r) => r.overdue, 1), C('hours', 'Hours Logged', (r) => r.hours, 1), C('rate', 'On-time %', (r) => (r.completed ? Math.round(r.onTime / r.completed * 100) : 0), 1)],
        rows: () => { const ts = Auth.tasks(); return Auth.team().filter((m) => !Auth.assignedOnly() || m.id === Auth.memberId()).map((m) => { const mine = ts.filter((t) => t.assignedTo === m.id); const comp = mine.filter((t) => Lists.isDone(t.status) && rng(t.completedAt)); return { id: m.id, m, assigned: mine.filter((t) => rng(t.due)).length, completed: comp.length, onTime: comp.filter((t) => !t.due || t.completedAt <= t.due).length, open: mine.filter((t) => !Lists.isDone(t.status)).length, overdue: mine.filter((t) => DB.isOverdue(t)).length, hours: Math.round(sum(mine, (t) => sum((t.timeLog || []).filter((l) => rng(String(l.start).slice(0, 10))), (l) => l.min)) / 6) / 10 }; }); } },
      revenue: { name: 'Revenue Summary', filters: ['date'], dateLabel: 'Period', perm: 'invoices',
        cols: [C('month', 'Month', (r) => monthLabel(r.id)), C('invoiced', 'Invoiced', (r) => r.inv, 'm'), C('count', 'Invoices', (r) => r.n, 1), C('received', 'Received', (r) => r.rec, 'm'), ...(Auth.assignedOnly() || !License.has('expenses') ? [] : [C('expenses', 'Expenses', (r) => r.exp, 'm'), C('net', 'Net Profit', (r) => r.rec - r.exp, 'm')])],
        rows: () => { const invs = Auth.byClient(Store.s.invoices).filter((i) => !['Draft', 'Cancelled'].includes(i.status)); const pays = Auth.byClient(Store.s.payments); const exps = Expenses.list(); const from = f.from || addMonths(today().slice(0, 8) + '01', -11); const to = f.to || today(); const out = []; for (let m = monthKey(from); m <= monthKey(to) && out.length < 36; m = monthKey(addMonths(m + '-01', 1))) { const mi = invs.filter((i) => monthKey(i.date) === m); out.push({ id: m, inv: sum(mi, (i) => DB.invTotal(i).total), n: mi.length, rec: sum(pays.filter((p) => monthKey(p.date) === m), (p) => p.amount), exp: sum(exps.filter((e) => monthKey(e.date) === m), (e) => e.amount) }); } return out; } },
      filing: { name: 'Monthly Tracker', filters: ['service', 'year'],
        cols: [C('code', 'Code', (r) => r.c.code), C('client', 'Client', (r) => r.c.name), ...MONTHS.map((mn, i) => C('m' + i, mn, (r) => { const v = r.cells[i]; return v ? FILING[v][0] : ''; })), C('filed', 'Done', (r) => r.cells.filter((v) => v === 'F').length, 1), C('overdue', 'Overdue', (r) => r.cells.filter((v) => v === 'O').length, 1)],
        rows: () => { const svc = f.service || (Lists.all('services')[0] || {}).id; const y = Number(f.year) || new Date().getFullYear(); return Auth.clients().filter((c) => Store.s.services.some((s) => s.clientId === c.id && s.service === svc)).map((c) => ({ id: c.id, c, cells: MONTHS.map((_, i) => Services.cell(c, svc, `${y}-${pad(i + 1, 2)}`)) })); } },
      aging: { name: 'Receivables Aging', filters: [], perm: 'invoices',
        cols: [C('code', 'Code', (r) => (DB.client(r.clientId) || {}).code), C('client', 'Client', (r) => (DB.client(r.clientId) || {}).name), C('mobile', 'Mobile', (r) => (DB.client(r.clientId) || {}).mobile), C('cur', 'Not Due', (r) => r.cur, 'm'), C('a', '0-30 Days', (r) => r.a, 'm'), C('b', '31-60 Days', (r) => r.b, 'm'), C('c', '60+ Days', (r) => r.c, 'm'), C('total', 'Total Outstanding', (r) => r.total, 'm')],
        rows: () => Invoices.aging(Auth.byClient(Store.s.invoices)) },
      compliance: { name: 'Deadline Status', filters: [],
        cols: [C('name', 'Deadline', (r) => r.x.name), C('auth', 'Category', (r) => Lists.name('authorities', r.x.authority)), C('freq', 'Frequency', (r) => r.x.frequency), C('next', 'Next Due', (r) => r.d), C('days', 'Days Left', (r) => (r.d ? daysBetween(today(), r.d) : ''), 1), C('tasks', 'Tasks Generated', (r) => r.ts.length, 1), C('cdone', 'Completed', (r) => r.ts.filter((t) => Lists.isDone(t.status)).length, 1), C('pending', 'Pending', (r) => r.ts.filter((t) => !Lists.isDone(t.status)).length, 1), C('over', 'Overdue', (r) => r.ts.filter((t) => DB.isOverdue(t)).length, 1)],
        rows: () => { const ts = Auth.tasks(); return Store.s.compliance.filter((x) => x.active !== false).map((x) => { const d = Compliance.nextDue(x); const last = ts.filter((t) => t.complianceId === x.id).sort((a, b) => (a.due < b.due ? 1 : -1)); const lastDue = last.length ? last[0].due : ''; return { id: x.id, x, d, ts: last.filter((t) => t.due === lastDue) }; }); } }
    };
  },
  BASIC: ['clients', 'services', 'tasks'],
  allowed(id) { return License.has('reports_all') || this.BASIC.includes(id); },
  current() {
    const f = vs('rep', { rid: 'clients', from: '', to: '' }); const defs = this.defs(); let d = defs[f.rid]; if (!d || (d.perm && !Auth.can(d.perm)) || !Reports.allowed(f.rid)) { f.rid = 'clients'; d = defs.clients; }
    const chosen = (f.cols && f.cols[f.rid]) || d.cols.map((c) => c.key);
    const cols = d.cols.filter((c) => chosen.includes(c.key));
    return { f, d, cols, rows: d.rows() };
  },
  matrix() { const { d, cols, rows } = this.current(); return { title: d.name, H: cols.map((c) => c.label), R: rows.map((r) => cols.map((c) => { const v = c.get(r); return v === undefined || v === null ? '' : v; })), cols }; },
  subtitle() { const f = vs('rep'); const parts = []; if (f.from || f.to) parts.push(`Period: ${f.from ? fmtDate(f.from) : '…'} – ${f.to ? fmtDate(f.to) : '…'}`); if (UIState.branch) parts.push('Branch: ' + Lists.name('branches', UIState.branch)); if (Auth.assignedOnly()) parts.push('Assigned clients of ' + Auth.user.name); parts.push('Generated ' + fmtDateTime(new Date()) + ' by ' + Auth.user.name); return parts.join(' · '); }
};

Views.reports = {
  render() {
    const { f, d, cols, rows } = Reports.current(); const defs = Reports.defs();
    const tpls = Store.s.reportTemplates.filter((t) => t.userId === Auth.user.id || t.shared);
    const fl = { date: html`${fDate('rep.from', (d.dateLabel || 'Date') + ' from')}${fDate('rep.to', 'to')}`, officer: Auth.assignedOnly() ? '' : fSelect('rep.officer', 'All officers', memberOpts()), cstatus: fSelect('rep.cstatus', 'All statuses', listOpts('clientStatuses')), tstatus: fSelect('rep.tstatus', 'All statuses', listOpts('taskStatuses')), sstatus: fSelect('rep.sstatus', 'All statuses', listOpts('serviceStatuses')), service: fSelect('rep.service', 'All services', listOpts('services')), year: html`<select class="inp" data-vs="rep.year" aria-label="Year">${[0, 1, 2].map((i) => { const y = new Date().getFullYear() - i; return html`<option ${String(y) === String(f.year || new Date().getFullYear()) ? raw('selected') : ''}>${y}</option>`; })}</select>` };
    const tcols = cols.map((c) => ({ key: c.key, label: c.label, cls: c.num ? 'num' : '', get: c.get, render: (r) => { const v = c.get(r); return c.num === 'm' ? money(v) : (/^(reg|due|filed|start|done|next)$/.test(c.key) ? fmtDate(v) : (v ?? '')); } }));
    const numTotals = cols.filter((c) => c.num && !/days|%/i.test(c.label)).map((c) => [c.label, sum(rows, (r) => c.get(r)), c.num === 'm']);
    const canExp = Auth.can('reports', 'export');
    return html`${pageHead('Reports', Reports.subtitle(), canExp ? html`${btn('CSV', 'rep:csv', { cls: 'ghost', icon: 'download' })}${License.has('export_pro') ? html`${btn('Excel', 'rep:xls', { cls: 'ghost', icon: 'download' })}${btn('PDF / Print', 'rep:pdf', { cls: 'primary', icon: 'print' })}` : html`<span class="muted sm">Excel / PDF</span>${License.lock('export_pro')}`}` : '')}
      <div class="rep-layout"><div class="card rep-nav"><h4>Reports</h4>${Object.entries(defs).filter(([, x]) => !x.perm || Auth.can(x.perm)).map(([id, x]) => Reports.allowed(id) ? html`<button type="button" class="rep-it ${f.rid === id && !f.tpl ? 'on' : ''}" data-act="rep:pick" data-id="${id}">${x.name}</button>` : html`<button type="button" class="rep-it locked" data-act="lic:upgrade" data-f="reports_all">${x.name} ${icon('lock')}</button>`)}
        <h4 class="mt">Saved templates</h4>${tpls.length ? tpls.map((t) => html`<div class="rep-it-row"><button type="button" class="rep-it ${f.tpl === t.id ? 'on' : ''}" data-act="rep:tpl" data-id="${t.id}">${t.name}</button>${t.userId === Auth.user.id ? btn('', 'rep:tpldel', { id: t.id, icon: 'close', cls: 'icon-btn sm', title: 'Delete template' }) : ''}</div>`) : html`<p class="muted sm">Choose columns and save a template.</p>`}</div>
      <div><div class="card filters"><b>${d.name}</b>${d.filters.map((k) => fl[k])}<span class="grow"></span>${btn('Columns', 'rep:cols', { cls: 'ghost sm', icon: 'filter' })}${License.has('export_pro') ? btn('Save as template', 'rep:save', { cls: 'ghost sm' }) : ''}</div>
      ${numTotals.length && rows.length ? html`<div class="rep-tot">${numTotals.slice(0, 6).map(([l, v, isM]) => html`<span><small>Total ${l}</small><b>${isM ? money(v) : Math.round(v * 10) / 10}</b></span>`)}</div>` : ''}
      <div class="card p0">${dataTable('rep_' + f.rid, { rows, cols: tcols, empty: emptyState('No data for this report', 'Adjust the filters.') })}</div></div></div>`;
  }
};
act('rep:pick', (a) => { const f = vs('rep'); f.rid = a.dataset.id; f.tpl = ''; Router.refresh(); });
act('rep:cols', () => {
  const { f, d, cols } = Reports.current(); const on = new Set(cols.map((c) => c.key));
  Modal.open({ title: 'Choose columns', size: 'sm', body: html`<div class="col-pick">${d.cols.map((c) => html`<label class="chk"><input type="checkbox" value="${c.key}" ${on.has(c.key) ? raw('checked') : ''}> <span>${c.label}</span></label>`)}</div>`, foot: html`<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" data-ok>Apply</button>`, onMount: (el, m) => { el.querySelector('[data-ok]').onclick = () => { const k = $$('input:checked', el).map((i) => i.value); if (!k.length) { toast('Choose at least one column', 'warn'); return; } f.cols = f.cols || {}; f.cols[f.rid] = k; m.close(); Router.refresh(); }; } });
});
act('rep:save', async () => { if (!License.need('export_pro')) return;
  const { f, cols } = Reports.current(); const name = await promptDlg('Save report template', 'Template name'); if (!name) return;
  const state = clone(f); delete state.cols; delete state.tpl;
  Store.commit((s) => s.reportTemplates.push({ id: uid('rt'), name, rid: f.rid, cols: cols.map((c) => c.key), state, userId: Auth.user.id, shared: false }), { allowRO: true });
  toast('Template saved');
});
act('rep:tpl', (a) => { const t = Store.s.reportTemplates.find((x) => x.id === a.dataset.id); const f = vs('rep'); Object.assign(f, clone(t.state)); f.rid = t.rid; f.tpl = t.id; f.cols = f.cols || {}; f.cols[t.rid] = t.cols; Router.refresh(); });
act('rep:tpldel', (a) => Store.commit((s) => { s.reportTemplates = s.reportTemplates.filter((x) => x.id !== a.dataset.id); }));
act('rep:csv', () => { const m = Reports.matrix(); downloadFile(m.title.replace(/\W+/g, '_') + '.csv', toCSV(m.H, m.R), 'text/csv'); Auth.audit('export', 'reports', `Exported ${m.title} (CSV, ${m.R.length} rows)`); });
act('rep:xls', () => { if (!License.need('export_pro')) return; const m = Reports.matrix(); downloadFile(m.title.replace(/\W+/g, '_') + '.xls', toXLS(m.title + ' — ' + Reports.subtitle(), m.H, m.R), 'application/vnd.ms-excel'); Auth.audit('export', 'reports', `Exported ${m.title} (Excel, ${m.R.length} rows)`); });
act('rep:pdf', () => { if (!License.need('export_pro')) return;
  const m = Reports.matrix();
  printHTML(m.title, html`${printHeader(m.title, Reports.subtitle())}<table class="ptbl ${m.H.length > 9 ? 'small' : ''}"><thead><tr>${m.H.map((h) => html`<th>${h}</th>`)}</tr></thead><tbody>${m.R.map((r) => html`<tr>${r.map((v, i) => html`<td class="${m.cols[i].num ? 'num' : ''}">${m.cols[i].num === 'm' ? money(v) : v}</td>`)}</tr>`)}</tbody></table><p class="p-sub">${m.R.length} rows</p>`);
  Auth.audit('export', 'reports', `Printed ${m.title} (${m.R.length} rows)`);
});
