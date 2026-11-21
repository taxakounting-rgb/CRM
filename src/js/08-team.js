/* ==========================================================================
   08-team.js — Team members: profile, photo, workload meter, monthly
   performance score, link to login user (or create one).
   ========================================================================== */
const Team = {
  openTasks(m) { return Store.s.tasks.filter((t) => t.assignedTo === m.id && !Lists.isDone(t.status)); },
  workload(m) { const cap = Number(Store.s.settings.capacity) || 15; const n = this.openTasks(m).length; return { n, cap, pct: Math.min(100, n / cap * 100) }; },
  /* Performance for a month: share of tasks due that month completed (on-time = 1, late = 0.5). */
  score(m, mk = monthKey(today())) {
    const due = Store.s.tasks.filter((t) => t.assignedTo === m.id && monthKey(t.due) === mk);
    const done = Store.s.tasks.filter((t) => t.assignedTo === m.id && Lists.isDone(t.status) && monthKey(t.completedAt) === mk);
    const onTime = done.filter((t) => !t.due || t.completedAt <= t.due).length; const late = done.length - onTime;
    const base = Math.max(due.length, done.length, 1);
    return { score: (due.length || done.length) ? Math.min(100, Math.round((onTime + late * 0.5) / base * 100)) : null, done: done.length, onTime, late, due: due.length };
  },
  user(m) { return Store.s.users.find((u) => u.memberId === m.id); },
  open(m) {
    const isNew = !m;
    const userOpts = () => Store.s.users.filter((u) => !u.memberId || (m && u.memberId === m.id)).map((u) => ({ value: u.id, label: `${u.username} (${u.name})` }));
    formModal({
      title: isNew ? 'New team member' : `Edit ${m.code}`, size: 'lg',
      fields: [
        { name: 'name', label: 'Full name', required: true }, { name: 'designation', label: 'Designation', type: 'select', list: 'designations' },
        { name: 'department', label: 'Department', type: 'select', list: 'departments' }, { name: 'email', label: 'Email', type: 'email' },
        { name: 'mobile', label: 'Mobile', type: 'mobile' }, { name: 'joinDate', label: 'Joining date', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', list: 'staffStatuses', required: true }, { name: 'branch', label: 'Branch', type: 'select', list: 'branches' },
        { name: 'userId', label: 'Linked login user', type: 'select', options: userOpts, help: 'Links tasks & assigned clients to this login', placeholder: '— Not linked —' },
        { name: 'photo', label: 'Photo', type: 'image' }
      ],
      values: m ? Object.assign(clone(m), { userId: (this.user(m) || {}).id || '' }) : { status: (Lists.all('staffStatuses')[0] || {}).id, joinDate: today(), branch: (Lists.all('branches')[0] || {}).id },
      onSubmit: (v) => {
        const userId = v.userId; delete v.userId;
        let rec = m;
        Store.commit((s) => {
          if (isNew) { rec = Rec.stamp(Object.assign({ id: uid('m') }, v), true); rec.code = Store.next('emp'); s.team.push(rec); }
          else { Object.assign(m, v); Rec.stamp(m); }
          s.users.forEach((u) => { if (u.memberId === rec.id && u.id !== userId) u.memberId = ''; });
          const u = s.users.find((x) => x.id === userId); if (u) u.memberId = rec.id;
        });
        Auth.audit(isNew ? 'create' : 'edit', 'team', `${isNew ? 'Created' : 'Edited'} team member ${rec.code} ${rec.name}`, { recordId: rec.id });
        toast(isNew ? `${rec.code} added` : 'Team member updated');
      }
    });
  }
};

Views.team = {
  onNew() { if (Auth.can('team', 'create')) Team.open(); },
  render(params) {
    if (params[0]) return this.detail(params[0]);
    const f = vs('team', { view: 'cards' }); const mk = monthKey(today());
    const rows = Auth.team().filter((m) => textMatch(f.q, m.name, m.code, m.email, m.mobile) && (!f.dept || m.department === f.dept) && (!f.status || m.status === f.status));
    const cols = [
      { key: 'code', label: 'EMP-ID', render: (m) => html`<a class="code" href="#/team/${m.code}">${m.code}</a>` },
      { key: 'name', label: 'Name', render: (m) => html`<span class="flex-c">${avatar(m.name, m.photo, 28)} <a href="#/team/${m.code}">${m.name}</a></span>` },
      { key: 'designation', label: 'Designation', get: (m) => Lists.name('designations', m.designation), render: (m) => Lists.name('designations', m.designation) },
      { key: 'department', label: 'Department', get: (m) => Lists.name('departments', m.department), render: (m) => Lists.name('departments', m.department) },
      { key: 'mobile', label: 'Mobile' },
      { key: 'wl', label: 'Workload', get: (m) => Team.workload(m).n, render: (m) => { const w = Team.workload(m); return html`${progress(w.pct, w.pct > 85 ? 'red' : w.pct > 60 ? 'amber' : '')}<small class="muted">${w.n} open / ${w.cap}</small>`; } },
      { key: 'sc', label: 'Score (month)', get: (m) => Team.score(m, mk).score ?? -1, render: (m) => { const s = Team.score(m, mk); return s.score === null ? html`<span class="muted">—</span>` : html`<b>${s.score}</b><small class="muted">/100</small>`; } },
      { key: 'status', label: 'Status', get: (m) => Lists.name('staffStatuses', m.status), render: (m) => listBadge('staffStatuses', m.status) },
      { key: 'login', label: 'Login', sort: false, render: (m) => { const u = Team.user(m); return u ? html`<code>${u.username}</code>` : html`<span class="muted">—</span>`; } },
      { key: 'a', label: '', sort: false, cls: 'act', render: (m) => html`<div class="row-acts">${Auth.can('team', 'edit') ? btn('', 'team:edit', { id: m.id, icon: 'edit', cls: 'icon-btn sm', title: 'Edit' }) : ''}${Auth.can('team', 'delete') ? btn('', 'team:del', { id: m.id, icon: 'trash', cls: 'icon-btn sm', title: 'Delete' }) : ''}</div>` }
    ];
    const card = (m) => { const w = Team.workload(m); const s = Team.score(m, mk); return html`<div class="card tcard"><div class="tcard-h">${avatar(m.name, m.photo, 56)}<div><a class="strong" href="#/team/${m.code}">${m.name}</a><div class="muted sm">${m.code} · ${Lists.name('designations', m.designation)}</div><div class="muted sm">${Lists.name('departments', m.department)}</div></div>${listBadge('staffStatuses', m.status)}</div>
      <div class="sm"><div class="row-between"><span>Workload</span><span>${w.n} open / ${w.cap}</span></div>${progress(w.pct, w.pct > 85 ? 'red' : w.pct > 60 ? 'amber' : '')}</div>
      <div class="tcard-s"><div><b>${s.score ?? '—'}</b><small>Score</small></div><div><b>${s.done}</b><small>Done this month</small></div><div><b>${s.late}</b><small>Late</small></div></div>
      <div class="row-acts">${m.mobile ? html`<a class="icon-btn sm" href="tel:${m.mobile.replace(/-/g, '')}" title="Call" aria-label="Call">${icon('phone')}</a>` : ''}${m.email ? html`<a class="icon-btn sm" href="mailto:${m.email}" title="Email" aria-label="Email">${icon('mail')}</a>` : ''}<span class="grow"></span>${Auth.can('team', 'edit') ? btn('Edit', 'team:edit', { id: m.id, cls: 'sm ghost' }) : ''}</div></div>`; };
    return html`${pageHead('Team', `${rows.length} members`, Auth.can('team', 'create') ? btn('New member', 'team:new', { cls: 'primary', icon: 'plus' }) : '')}
      <div class="card filters">${fInput('team.q', 'Search name, EMP-ID, email…')}${fSelect('team.dept', 'All departments', listOpts('departments'))}${fSelect('team.status', 'All statuses', listOpts('staffStatuses'))}<span class="grow"></span><div class="seg">${btn('', 'nav', { cls: 'icon-btn ' + (f.view === 'table' ? 'on' : ''), icon: 'list', title: 'Table', extra: 'data-vs-set="team.view" data-val="table"' })}${btn('', 'nav', { cls: 'icon-btn ' + (f.view !== 'table' ? 'on' : ''), icon: 'grid', title: 'Cards', extra: 'data-vs-set="team.view" data-val="cards"' })}</div></div>
      ${f.view === 'table' ? html`<div class="card p0">${dataTable('team', { rows, cols })}</div>` : (rows.length ? html`<div class="cards">${rows.map(card)}</div>` : emptyState('No team members', 'Add your staff to assign clients and tasks.'))}`;
  },
  detail(code) {
    const m = Store.s.team.find((x) => x.code === code); if (!m) return emptyState('Team member not found');
    const tasks = Auth.tasks().filter((t) => t.assignedTo === m.id); const u = Team.user(m);
    const months = Array.from({ length: 6 }, (_, i) => monthKey(addMonths(today().slice(0, 8) + '01', -5 + i)));
    const clients = Auth.clients().filter((c) => c.assignedTo === m.id);
    return html`<div class="crumbs"><a href="#/team">Team</a> › ${m.code}</div>
      <div class="card c360-h"><div class="c360-id">${avatar(m.name, m.photo, 72)}<div><h1>${m.name} <span class="code big">${m.code}</span></h1><p class="muted">${Lists.name('designations', m.designation)} · ${Lists.name('departments', m.department)} · ${Lists.name('branches', m.branch)}</p>${listBadge('staffStatuses', m.status)}</div></div>
      <div class="c360-acts">${Auth.can('team', 'edit') ? btn('Edit', 'team:edit', { id: m.id, icon: 'edit', cls: 'ghost' }) : ''}${!u && Auth.can('users', 'create') ? btn('Create login', 'team:mkuser', { id: m.id, icon: 'key', cls: 'ghost' }) : ''}</div></div>
      <div class="grid2"><div class="card"><h3>Profile</h3>${kv([['Email', m.email], ['Mobile', m.mobile], ['Joining date', fmtDate(m.joinDate)], ['Login user', u ? `${u.username} (${(Auth.role(u) || {}).name})` : 'Not linked'], ['Assigned clients', clients.length], ['Open tasks', Team.openTasks(m).length]])}</div>
      <div class="card"><h3>Performance score — last 6 months</h3>${Charts.bars(months.map((k) => ({ label: monthLabel(k), value: Team.score(m, k).score || 0, tip: `${monthLabel(k)}: ${Team.score(m, k).score ?? 'no tasks'} (${Team.score(m, k).done} done)` })), { h: 200, fmt: (v) => Math.round(v) })}</div></div>
      <div class="card"><h3>Tasks</h3>${Tasks.table(tasks, 'memtasks')}</div>`;
  }
};
const memOf = (a) => DB.member(a.dataset.id);
act('team:new', () => Team.open());
act('team:edit', (a) => Team.open(memOf(a)));
act('team:del', async (a) => {
  const m = memOf(a); const n = Team.openTasks(m).length;
  if (!(await confirmDlg(html`Delete <b>${m.name}</b>?${n ? html`<br><span class="warn-txt">${n} open tasks are assigned to this member.</span>` : ''}`, { danger: true, ok: 'Delete' }))) return;
  Rec.remove('team', m, `Team member ${m.code}`, 'team');
});
act('team:mkuser', (a) => Settings.userForm(null, memOf(a)));
