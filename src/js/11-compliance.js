/* ==========================================================================
   11-compliance.js — Recurring deadlines calendar (monthly / quarterly / annual) with task generation.
   Editable deadlines; "Generate tasks for all active clients" for a deadline.
   ========================================================================== */
const FREQ = [{ value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'annual', label: 'Annual' }];
const Compliance = {
  /* Due date of item inside a given month (YYYY-MM) or '' */
  dueIn(x, mk) {
    const m = +mk.slice(5); const last = new Date(+mk.slice(0, 4), m, 0).getDate(); const d = `${mk}-${pad(Math.min(Number(x.day) || 1, last), 2)}`;
    if (x.frequency === 'monthly') return d;
    const months = (x.months || []).map(Number);
    return months.includes(m) ? d : '';
  },
  nextDue(x, from = today()) {
    for (let i = 0; i < 24; i++) { const mk = monthKey(addMonths(from.slice(0, 8) + '01', i)); const d = this.dueIn(x, mk); if (d && d >= from) return d; }
    return '';
  },
  /* Period label the deadline relates to (previous month / quarter / year) */
  periodFor(x, due) {
    if (x.frequency === 'monthly') return monthLabel(monthKey(addMonths(due.slice(0, 8) + '01', -1)));
    if (x.frequency === 'quarterly') { const p = addMonths(due.slice(0, 8) + '01', -1); return `Quarter ending ${monthLabel(monthKey(p))}`; }
    return 'Tax Year ' + (due.slice(5, 7) >= '07' ? due.slice(0, 4) : String(+due.slice(0, 4) - 1));
  },
  open(x) {
    formModal({
      title: x ? 'Edit deadline' : 'New compliance deadline', size: 'md',
      fields: [
        { name: 'name', label: 'Deadline name', required: true, full: true },
        { name: 'authority', label: 'Category', type: 'select', list: 'authorities', required: true },
        { name: 'service', label: 'Linked service (for tasks)', type: 'select', list: 'services' },
        { name: 'frequency', label: 'Frequency', type: 'select', options: FREQ, required: true },
        { name: 'day', label: 'Due day of month', type: 'number', min: 1, max: 31, required: true },
        { name: 'months', label: 'Due months (quarterly / annual)', type: 'multi', options: MONTHS.map((m, i) => ({ value: String(i + 1), label: m })), full: true, help: 'Ignored for monthly deadlines' },
        { name: 'description', label: 'Notes', type: 'textarea', full: true, rows: 2 },
        { name: 'active', label: 'Active', type: 'checkbox' }
      ],
      values: x ? Object.assign(clone(x), { months: (x.months || []).map(String) }) : { frequency: 'monthly', day: 15, active: true, months: [] },
      onSubmit: (v) => {
        if (v.frequency !== 'monthly' && !v.months.length) return { months: 'Select at least one month' };
        v.months = v.months.map(Number);
        if (x) { const d = Auth.diff(x, v); Store.commit(() => Object.assign(x, v)); Auth.audit('edit', 'compliance', `Edited deadline ${v.name}`, { recordId: x.id, old: d.old, new: d.new }); }
        else { const rec = Object.assign({ id: uid('cp') }, v); Store.commit((s) => s.compliance.push(rec)); Auth.audit('create', 'compliance', `Added deadline ${v.name}`, { recordId: rec.id }); }
        toast('Deadline saved');
      }
    });
  },
  generate(x) {
    const nd = this.nextDue(x);
    formModal({
      title: 'Generate tasks', size: 'md', submit: 'Generate tasks',
      intro: html`<p>Creates one task per <b>active client</b> for <b>${x.name}</b>, assigned to each client's officer. Clients that already have this task for the same due date are skipped.</p>`,
      fields: [
        { name: 'due', label: 'Due date', type: 'date', required: true },
        { name: 'period', label: 'Period label', required: true },
        { name: 'onlySvc', label: `Only clients who have the "${Lists.name('services', x.service)}" service`, type: 'checkbox', full: true },
        { name: 'priority', label: 'Priority', type: 'select', list: 'priorities', required: true }
      ],
      values: { due: nd, period: this.periodFor(x, nd), onlySvc: !!x.service, priority: Lists.idByName('priorities', 'High') || (Lists.all('priorities')[0] || {}).id },
      onSubmit: async (v) => {
        const active = Lists.idByName('clientStatuses', 'Active');
        let list = Auth.clients().filter((c) => !active || c.status === active);
        if (v.onlySvc && x.service) list = list.filter((c) => Store.s.services.some((s) => s.clientId === c.id && s.service === x.service));
        const exists = (c) => Store.s.tasks.some((t) => t.clientId === c.id && t.complianceId === x.id && t.due === v.due);
        const todo = list.filter((c) => !exists(c));
        if (!todo.length) { toast('No new tasks to create — all eligible clients already have this task.', 'info'); return; }
        if (!(await confirmDlg(`Create ${todo.length} tasks (${list.length - todo.length} skipped as duplicates)?`, { ok: 'Create' }))) return false;
        const tp = Tasks.tpl(x.service); const byMember = {};
        Store.commit((s) => todo.forEach((c) => {
          const t = Rec.stamp({ id: uid('t'), clientId: c.id, service: x.service, title: `${x.name} — ${v.period}`, description: x.description || '', assignedTo: c.assignedTo || '', priority: v.priority, start: today(), due: v.due, status: Lists.firstStatus(), complianceId: x.id, subtasks: tp ? tp.checklist.map((i) => ({ id: uid('s'), text: i, done: false })) : [], comments: [], timeLog: [] }, true);
          t.code = Store.next('task'); s.tasks.push(t); if (c.assignedTo) byMember[c.assignedTo] = (byMember[c.assignedTo] || 0) + 1;
        }));
        Object.entries(byMember).forEach(([m, n]) => Notify.toMember(m, 'assignment', 'New compliance tasks', `${n} "${x.name}" tasks due ${fmtDate(v.due)} were assigned to you.`, '#/tasks'));
        Auth.audit('create', 'compliance', `Generated ${todo.length} tasks for ${x.name} (due ${v.due})`, { recordId: x.id });
        toast(`${todo.length} tasks created`);
      }
    });
  }
};

Views.compliance = {
  onNew() { if (Auth.can('compliance', 'create')) Compliance.open(); },
  render() {
    const f = vs('compliance', { tab: 'list' });
    const items = Store.s.compliance.filter((x) => textMatch(f.q, x.name, x.description, Lists.name('authorities', x.authority)) && (!f.auth || x.authority === f.auth));
    const upcoming = [];
    Store.s.compliance.filter((x) => x.active !== false).forEach((x) => { for (let i = 0; i < 3; i++) { const mk = monthKey(addMonths(today().slice(0, 8) + '01', i)); const d = this.dueOf(x, mk); if (d && d >= today() && daysBetween(today(), d) <= 60) upcoming.push({ x, d }); } });
    upcoming.sort((a, b) => (a.d > b.d ? 1 : -1));
    const year = Number(f.year) || new Date().getFullYear();
    const canGen = Auth.can('tasks', 'create') && Auth.can('compliance', 'edit');
    return html`${pageHead('Deadlines Calendar', 'Recurring deadlines (monthly, quarterly or annual) for your clients. Generate the tasks for a deadline with one click.', Auth.can('compliance', 'create') ? btn('Add deadline', 'cp:new', { cls: 'primary', icon: 'plus' }) : '')}
      ${tabsBar('compliance', [['list', 'Deadlines'], ['year', 'Year view']], f.tab)}
      ${f.tab === 'year' ? html`<div class="card filters"><select class="inp" data-vs="compliance.year" aria-label="Year">${[year - 1, year, year + 1].map((y) => html`<option ${y === year ? raw('selected') : ''}>${y}</option>`)}</select></div><div class="year-grid">${MONTHS.map((mn, i) => { const mk = `${year}-${pad(i + 1, 2)}`; const its = Store.s.compliance.filter((x) => x.active !== false).map((x) => ({ x, d: this.dueOf(x, mk) })).filter((o) => o.d).sort((a, b) => (a.d > b.d ? 1 : -1)); return html`<div class="card ym ${mk === monthKey(today()) ? 'cur' : ''}"><h4>${mn} ${year}</h4><ul>${its.map((o) => html`<li class="${o.d < today() ? 'past' : ''}"><b>${+o.d.slice(8)}</b> ${o.x.name} <small class="muted">${Lists.name('authorities', o.x.authority)}</small></li>`)}</ul></div>`; })}</div>`
      : html`<div class="grid-31"><div><div class="card filters">${fInput('compliance.q', 'Search deadlines…')}${fSelect('compliance.auth', 'All categories', listOpts('authorities'))}</div>
        <div class="card p0">${dataTable('compliance', { rows: items, empty: emptyState('No deadlines', 'Add your recurring deadlines, such as contract renewals, reports or payments.'), cols: [
          { key: 'name', label: 'Deadline', render: (x) => html`<b>${x.name}</b>${x.description ? html`<br><small class="muted">${x.description}</small>` : ''}` },
          { key: 'authority', label: 'Category', get: (x) => Lists.name('authorities', x.authority), render: (x) => listBadge('authorities', x.authority) },
          { key: 'frequency', label: 'Frequency', render: (x) => html`${x.frequency}<br><small class="muted">day ${x.day}${x.frequency !== 'monthly' ? ' of ' + (x.months || []).map((m) => MONTHS[m - 1]).join(', ') : ''}</small>` },
          { key: 'next', label: 'Next due', get: (x) => Compliance.nextDue(x), render: (x) => { const d = Compliance.nextDue(x); const n = d ? daysBetween(today(), d) : null; return html`${fmtDate(d)}${n !== null ? html`<br>${badge(n === 0 ? 'Today' : `in ${n} days`, n <= 3 ? 'red' : n <= 7 ? 'amber' : 'blue')}` : ''}`; } },
          { key: 'active', label: 'Active', render: (x) => x.active !== false ? badge('Active', 'green') : badge('Off', 'grey') },
          { key: 'a', label: '', sort: false, cls: 'act', render: (x) => html`<div class="row-acts">${canGen ? btn('Generate tasks', 'cp:gen', { id: x.id, cls: 'sm primary' }) : ''}${Auth.can('compliance', 'edit') ? btn('', 'cp:edit', { id: x.id, icon: 'edit', cls: 'icon-btn sm', title: 'Edit' }) : ''}${Auth.can('compliance', 'delete') ? btn('', 'cp:del', { id: x.id, icon: 'trash', cls: 'icon-btn sm', title: 'Delete' }) : ''}</div>` }
        ] })}</div></div>
        <div class="card"><h3>Next 60 days</h3>${upcoming.length ? html`<ul class="list">${upcoming.map((o) => html`<li class="row-between"><span><b>${o.x.name}</b><br><small class="muted">${Lists.name('authorities', o.x.authority)} · ${Compliance.periodFor(o.x, o.d)}</small></span><span class="right">${fmtDate(o.d)}<br>${badge(`${daysBetween(today(), o.d)}d`, daysBetween(today(), o.d) <= 7 ? 'red' : 'blue')}</span></li>`)}</ul>` : html`<p class="muted">Nothing due in the next 60 days.</p>`}</div></div>`}`;
  },
  dueOf(x, mk) { return Compliance.dueIn(x, mk); }
};
const cpOf = (a) => Store.s.compliance.find((x) => x.id === a.dataset.id);
act('cp:new', () => Compliance.open());
act('cp:edit', (a) => Compliance.open(cpOf(a)));
act('cp:gen', (a) => Compliance.generate(cpOf(a)));
act('cp:del', async (a) => { const x = cpOf(a); if (await confirmDlg(`Delete deadline "${x.name}"?`, { danger: true, ok: 'Delete' })) Rec.remove('compliance', x, 'Deadline', 'compliance'); });
