/* ==========================================================================
   15-dashboard.js — Role-aware live dashboard: KPI cards, SVG charts
   (revenue by month, tasks by status, productivity, services), widgets.
   Every number is computed from scoped data (assigned-only roles = own clients).
   ========================================================================== */
Views.dashboard = {
  render() {
    const f = vs('dash', { from: addMonths(today().slice(0, 8) + '01', -5), to: today() });
    const clients = Auth.clients(); const tasks = Auth.tasks();
    const done = Lists.doneStatus(); const inRng = (d) => inRange(d, f.from, f.to);
    const active = Lists.idByName('clientStatuses', 'Active');
    const k = {
      total: clients.length, active: clients.filter((c) => c.status === active).length,
      pending: tasks.filter((t) => !Lists.isDone(t.status)).length, completed: tasks.filter((t) => Lists.isDone(t.status) && inRng(t.completedAt)).length,
      overdue: tasks.filter((t) => DB.isOverdue(t)).length
    };
    const canMoney = Auth.can('invoices');
    const pays = canMoney ? Auth.byClient(Store.s.payments) : []; const invs = canMoney ? Auth.byClient(Store.s.invoices) : [];
    const revMonth = sum(pays.filter((p) => monthKey(p.date) === monthKey(today())), (p) => p.amount);
    const outstanding = sum(invs.filter((i) => !['Draft', 'Cancelled'].includes(DB.invStatus(i))), (i) => DB.invBalance(i));
    // months in range (max 24)
    const months = []; for (let m = monthKey(f.from || addMonths(today(), -11)); m <= monthKey(f.to || today()) && months.length < 24; m = monthKey(addMonths(m + '-01', 1))) months.push(m);
    const statusData = Lists.all('taskStatuses').map((s) => ({ label: s.name, value: tasks.filter((t) => t.status === s.id).length, color: s.color || '#888' }));
    const prod = Auth.team().map((m) => ({ label: m.name, value: tasks.filter((t) => t.assignedTo === m.id && t.status === done && inRng(t.completedAt)).length, sub: `${Team.openTasks(m).length} open` })).filter((d) => d.value || !Auth.assignedOnly()).sort((a, b) => b.value - a.value).slice(0, 8);
    const svcRecs = Auth.byClient(Store.s.services);
    const svcData = Lists.all('services').map((s) => ({ label: s.name, value: svcRecs.filter((r) => r.service === s.id).length })).filter((d) => d.value).sort((a, b) => b.value - a.value);
    const svcTop = svcData.slice(0, 7); if (svcData.length > 7) svcTop.push({ label: 'Other', value: sum(svcData.slice(7), (d) => d.value) });
    svcTop.forEach((d, i) => { d.color = d.label === 'Other' ? '#9a9a9a' : SERIES[i]; });
    // widgets
    const t0 = today(); const in14 = addDays(t0, 14);
    const upcoming = tasks.filter((t) => !Lists.isDone(t.status) && t.due >= t0 && t.due <= in14).sort((a, b) => (a.due > b.due ? 1 : -1));
    const compUp = Store.s.compliance.filter((x) => x.active !== false).map((x) => ({ x, d: Compliance.nextDue(x) })).filter((o) => o.d && o.d <= in14);
    const fuToday = Followups.mine().filter((x) => (x.snoozedTo || x.date) <= t0);
    const ids = Auth.clientIds(); const all = !Auth.assignedOnly() && !UIState.branch;
    const recent = Store.s.timeline.filter((e) => all || ids.has(e.clientId)).slice(0, 10);
    const myTasks = Auth.memberId() ? tasks.filter((t) => t.assignedTo === Auth.memberId() && !Lists.isDone(t.status)).sort((a, b) => (a.due > b.due ? 1 : -1)) : [];
    const kpi = (label, val, ic, href, tone = '', sub = '') => html`<a class="kpi ${tone}" href="${href}"><span class="kpi-ic">${icon(ic)}</span><small>${label}</small><b>${val}</b>${sub ? html`<em>${sub}</em>` : ''}</a>`;
    const hour = new Date().getHours();
    return html`<div class="page-head"><div><h1>Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${Auth.user.name.split(' ')[0]}</h1><p class="muted">${fmtDate(t0)} · ${Auth.assignedOnly() ? 'Showing your assigned clients' : UIState.branch ? 'Branch: ' + Lists.name('branches', UIState.branch) : 'All branches'}</p></div>
      <div class="page-actions dash-f">${License.has('dashboard_custom') ? btn('Customise', 'dash:custom', { cls: 'ghost', icon: 'grid' }) : License.lock('dashboard_custom')}${fDate('dash.from', 'From')}${fDate('dash.to', 'To')}</div></div>
      ${this.layout({
        kpis: [['kpi_total', kpi('Total clients', k.total, 'clients', '#/clients')], ['kpi_active', kpi('Active clients', k.active, 'check', '#/clients')], ['kpi_pending', kpi('Pending tasks', k.pending, 'tasks', '#/tasks')], ['kpi_completed', kpi('Completed tasks', k.completed, 'check', '#/tasks', '', 'in selected period')], ['kpi_overdue', kpi('Overdue tasks', k.overdue, 'calendar', '#/tasks', k.overdue ? 'warn' : '')], Auth.can('projects') && ['kpi_projects', kpi('Active projects', (Store.s.projects||[]).filter(p=>p.status==='Active').length, 'projects', '#/projects', '', `${(Store.s.projects||[]).length} total`)], canMoney && ['kpi_revenue', kpi('Revenue this month', moneyShort(revMonth), 'invoices', '#/invoices', '', money(revMonth))], canMoney && ['kpi_receivables', kpi('Outstanding receivables', moneyShort(outstanding), 'invoices', '#/invoices', outstanding ? 'amber' : '', money(outstanding))]],
        cards: [
          canMoney && ['w_revenue', html`<div class="card span2"><div class="card-h"><h3>Revenue received by month</h3><small class="muted">${monthLabel(months[0] || monthKey(t0))} – ${monthLabel(months[months.length - 1] || monthKey(t0))}</small></div>${Charts.bars(months.map((m) => { const v = sum(pays.filter((p) => monthKey(p.date) === m), (p) => p.amount); return { label: monthLabel(m), value: v, tip: `${monthLabel(m)}: ${money(v)}` }; }), { fmt: moneyShort })}</div>`],
          ['w_status', html`<div class="card"><h3>Tasks by status</h3>${Charts.donut(statusData, { center: tasks.length, sub: 'tasks' })}</div>`],
          ['w_productivity', html`<div class="card"><h3>Employee productivity</h3><p class="muted sm">Tasks completed in period</p>${Charts.hbars(prod)}</div>`],
          ['w_services', html`<div class="card"><h3>Services distribution</h3>${Charts.donut(svcTop, { center: svcRecs.length, sub: 'services' })}</div>`],
          ['w_deadlines', html`<div class="card"><div class="card-h"><h3>Upcoming deadlines</h3><small class="muted">next 14 days</small></div>${upcoming.length || compUp.length ? html`<div class="w-list">${compUp.map((o) => html`<div class="mini-row"><div class="mr-main"><b>⚑ ${o.x.name}</b><small class="muted">${Lists.name('authorities', o.x.authority)} · ${Compliance.periodFor(o.x, o.d)}</small></div><div class="mr-side">${badge(fmtDate(o.d), daysBetween(t0, o.d) <= 3 ? 'red' : 'blue')}</div></div>`)}${upcoming.slice(0, 8).map((t) => Tasks.miniRow(t))}</div>` : html`<p class="muted">Nothing due in the next 14 days.</p>`}</div>`],
          ['w_followups', html`<div class="card"><div class="card-h"><h3>Follow-ups due</h3><a href="#/notifications" data-vs-set="notif.tab" data-val="followups" class="sm">All</a></div>${fuToday.length ? html`<ul class="list">${fuToday.slice(0, 6).map((x) => Followups.item(x))}</ul>` : html`<p class="muted">No follow-ups due today.</p>`}</div>`],
          Auth.memberId() && ['w_mytasks', html`<div class="card"><div class="card-h"><h3>My tasks</h3><span class="cnt">${myTasks.length}</span></div>${myTasks.length ? html`<div class="w-list">${myTasks.slice(0, 8).map((t) => Tasks.miniRow(t))}</div>` : html`<p class="muted">No open tasks assigned to you.</p>`}</div>`],
          ['w_activity', html`<div class="card"><h3>Recent activity</h3>${recent.length ? html`<ul class="list sm">${recent.map((e) => { const c = DB.client(e.clientId) || {}; return html`<li><b>${e.text}</b><br><small class="muted">${c.code ? html`<a href="#/clients/${c.code}">${c.code} ${c.name}</a> · ` : ''}${timeAgo(e.at)} · ${e.by}</small></li>`; })}</ul>` : html`<p class="muted">No activity yet.</p>`}</div>`]
        ]
      })}`;
  },
  /* Apply the user's (or firm default) dashboard layout: hidden items + order */
  layout({ kpis, cards }) {
    const cfg = DashCfg.get(); const hide = new Set(cfg.hidden || []);
    const ord = (arr) => arr.filter(Boolean).filter(([k]) => !hide.has(k)).sort((a, b) => { const o = cfg.order || []; const ia = o.indexOf(a[0]), ib = o.indexOf(b[0]); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
    const K = ord(kpis), C = ord(cards);
    return html`${K.length ? html`<div class="kpis">${K.map((x) => x[1])}</div>` : ''}${C.length ? html`<div class="grid-dash">${C.map((x) => x[1])}</div>` : ''}${!K.length && !C.length ? emptyState('Your dashboard is empty', 'Click Customise to show widgets again.') : ''}`;
  }
};

/* ---------- Dashboard customisation (per user, with a firm default) ---------- */
const DASH_ITEMS = [
  ['kpi_total', 'Total clients', 'KPI card'], ['kpi_active', 'Active clients', 'KPI card'], ['kpi_pending', 'Pending tasks', 'KPI card'], ['kpi_completed', 'Completed tasks', 'KPI card'], ['kpi_overdue', 'Overdue tasks', 'KPI card'], ['kpi_revenue', 'Revenue this month', 'KPI card'], ['kpi_receivables', 'Outstanding receivables', 'KPI card'],
  ['w_revenue', 'Revenue received by month', 'Chart'], ['w_status', 'Tasks by status', 'Chart'], ['w_productivity', 'Employee productivity', 'Chart'], ['w_services', 'Services distribution', 'Chart'],
  ['w_deadlines', 'Upcoming deadlines', 'Widget'], ['w_followups', 'Follow-ups due', 'Widget'], ['w_mytasks', 'My tasks', 'Widget'], ['w_activity', 'Recent activity', 'Widget']
];
const DashCfg = {
  get() { if (!License.has('dashboard_custom')) return {}; const u = Auth.user; return (u && u.prefs && u.prefs.dash) || Store.s.settings.dashDefault || {}; },
  open() {
    if (!License.need('dashboard_custom')) return;
    const cfg = clone(this.get()); const hidden = new Set(cfg.hidden || []);
    let order = (cfg.order && cfg.order.length ? cfg.order.concat(DASH_ITEMS.map((d) => d[0]).filter((k) => !cfg.order.includes(k))) : DASH_ITEMS.map((d) => d[0]));
    const draw = (el) => { el.querySelector('[data-dl]').innerHTML = String(html`${order.map((k, i) => { const d = DASH_ITEMS.find((x) => x[0] === k); return html`<li><label class="chk"><input type="checkbox" data-k="${k}" ${hidden.has(k) ? '' : raw('checked')}> <span><b>${d[1]}</b> <small class="muted">${d[2]}</small></span></label><span class="row-acts"><button type="button" class="icon-btn sm" data-up="${i}" ${i === 0 ? raw('disabled') : ''} aria-label="Move up">↑</button><button type="button" class="icon-btn sm" data-down="${i}" ${i === order.length - 1 ? raw('disabled') : ''} aria-label="Move down">↓</button></span></li>`; })}`); };
    const isAdmin = Auth.can('settings', 'edit');
    Modal.open({
      title: 'Customise dashboard', size: 'md',
      body: html`<p class="muted sm">Tick the cards and widgets you want to see and use the arrows to change their order. KPI cards always stay in the top row.</p><ul class="ml dash-list" data-dl></ul>`,
      foot: html`${btn('Reset', '', { cls: 'ghost', extra: 'data-reset' })}<span class="grow"></span>${isAdmin ? btn('Save as default for everyone', '', { cls: 'ghost', extra: 'data-all' }) : ''}${btn('Save for me', '', { cls: 'primary', extra: 'data-me' })}`,
      onMount: (el, m) => {
        draw(el);
        el.querySelector('[data-dl]').addEventListener('click', (e) => { const u = e.target.closest('[data-up]'), d = e.target.closest('[data-down]'); if (u) { const i = +u.dataset.up; [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw(el); } if (d) { const i = +d.dataset.down; [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw(el); } });
        el.querySelector('[data-dl]').addEventListener('change', (e) => { const k = e.target.dataset.k; if (k) { if (e.target.checked) hidden.delete(k); else hidden.add(k); } });
        const val = () => ({ hidden: Array.from(hidden), order: order.slice() });
        el.querySelector('[data-me]').onclick = () => { const u = Auth.user; Store.commit(() => { u.prefs = Object.assign({}, u.prefs, { dash: val() }); }, { allowRO: true }); toast('Dashboard saved'); m.close(); };
        const all = el.querySelector('[data-all]'); if (all) all.onclick = () => { const u = Auth.user; Store.commit((s) => { s.settings.dashDefault = val(); if (u.prefs) delete u.prefs.dash; }); Auth.audit('edit', 'settings', 'Default dashboard layout updated'); toast('Default dashboard saved for everyone'); m.close(); };
        el.querySelector('[data-reset]').onclick = () => { const u = Auth.user; Store.commit(() => { if (u.prefs) delete u.prefs.dash; }, { allowRO: true }); toast('Dashboard reset'); m.close(); };
      }
    });
  }
};
act('dash:custom', () => DashCfg.open());
