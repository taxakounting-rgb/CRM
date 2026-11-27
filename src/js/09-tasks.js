/* ==========================================================================
   09-tasks.js — Task management: table, Kanban (drag & drop), calendar,
   detail page (checklist, comments, attachments, time log/timer), recurring
   tasks, templates per service, bulk status update, reassign notifications.
   ========================================================================== */
const RECUR = [{ value: '', label: 'Does not repeat' }, { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'yearly', label: 'Yearly' }];
const Tasks = {
  tpl(service) { return License.has('recurring') ? (Store.s.settings.taskTemplates || []).find((t) => t.service === service) : null; },
  fields() {
    return [
      { name: 'title', label: 'Title', required: true, full: true },
      { name: 'clientId', label: 'Client', type: 'select', options: clientOpts, required: true },
      { name: 'service', label: 'Service type', type: 'select', list: 'services', help: 'A template checklist is added automatically if one exists' },
      { name: 'assignedTo', label: 'Assigned to', type: 'select', options: memberOpts, required: true },
      { name: 'priority', label: 'Priority', type: 'select', list: 'priorities', required: true },
      { name: 'start', label: 'Start date', type: 'date' },
      { name: 'due', label: 'Due date', type: 'date', required: true, validate: (v, a) => (a.start && v && v < a.start ? 'Due date is before start date' : '') },
      { name: 'status', label: 'Status', type: 'select', list: 'taskStatuses', required: true },
      License.has('recurring') ? { name: 'recurrence', label: 'Repeat', type: 'select', options: RECUR, placeholder: 'Does not repeat' } : { type: 'html', name: '', html: html`<span class="muted sm">Recurring tasks: ${License.lock('recurring')}</span>` },
      { name: 'projectId', label: 'Project (optional)', type: 'select', options: () => [{ value: '', label: '— None —' }, ...(Store.s.projects || []).filter(p => !this._clientId || p.clientId === this._clientId).map(p => ({ value: p.id, label: p.code + ' · ' + p.name }))] },
      { name: 'description', label: 'Description', type: 'textarea', full: true }
    ];
  },
  open(t, preset = {}) {
    const isNew = !t;
    const vals = t ? clone(t) : Object.assign({ status: Lists.firstStatus(), priority: Lists.idByName('priorities', 'Medium') || (Lists.all('priorities')[0] || {}).id, start: today(), due: addDays(today(), 7), assignedTo: Auth.memberId() || '' }, preset);
    if (vals.clientId && !preset.assignedTo && isNew) { const c = DB.client(vals.clientId); if (c && c.assignedTo) vals.assignedTo = c.assignedTo; }
    const m = formModal({
      title: isNew ? 'New task' : `Edit ${t.code}`, size: 'lg', fields: this.fields(), values: vals,
      onSubmit: (v) => {
        if (!Auth.canSeeClient(v.clientId)) return { clientId: 'Choose one of your clients' };
        if (isNew) {
          const tp = this.tpl(v.service);
          const rec = Rec.stamp(Object.assign({ id: uid('t'), subtasks: tp ? tp.checklist.map((x) => ({ id: uid('s'), text: x, done: false })) : [], comments: [], timeLog: [] }, v), true);
          Store.commit((s) => { rec.code = Store.next('task'); if (Lists.isDone(rec.status)) rec.completedAt = today(); s.tasks.push(rec); });
          Auth.audit('create', 'tasks', `Created task ${rec.code} ${rec.title}`, { recordId: rec.id, new: v });
          this.notifyAssignee(rec, 'New task assigned');
          toast(`${rec.code} created${tp ? ' with template checklist' : ''}`);
        } else {
          const d = Auth.diff(t, v); const reassigned = v.assignedTo !== t.assignedTo; const statusChanged = v.status !== t.status;
          const newStatus = v.status; v.status = t.status;
          Store.commit(() => { Object.assign(t, v); Rec.stamp(t); });
          if (statusChanged) this.setStatus(t, newStatus, true);
          Auth.audit('edit', 'tasks', `Edited task ${t.code}`, { recordId: t.id, old: d.old, new: d.new });
          if (reassigned) this.notifyAssignee(t, 'Task reassigned to you');
          toast('Task updated');
        }
      }
    });
    // template preview: fill title from template when service chosen and title empty
    const form = m.el.querySelector('form');
    form.elements.service.addEventListener('change', () => { const tp = this.tpl(form.elements.service.value); if (tp && !form.elements.title.value) form.elements.title.value = tp.title || Lists.name('services', form.elements.service.value); if (tp && tp.days && isNew) form.elements.due.value = addDays(form.elements.start.value || today(), tp.days); });
    form.elements.clientId.addEventListener('change', () => { const c = DB.client(form.elements.clientId.value); if (c && c.assignedTo && isNew) form.elements.assignedTo.value = c.assignedTo; });
  },
  notifyAssignee(t, title) {
    const c = DB.client(t.clientId) || {};
    if (t.assignedTo) Notify.toMember(t.assignedTo, 'assignment', title, `${t.code} · ${t.title} (${c.code || ''} ${c.name || ''}) — due ${fmtDate(t.due)}`, '#/tasks/' + t.code);
  },
  /* Central status change: completion date, timeline, recurring next task. */
  setStatus(t, status, silent) {
    if (!status || t.status === status && !silent) return;
    const was = t.status; const done = Lists.isDone(status);
    Store.commit(() => {
      t.status = status; Rec.stamp(t);
      if (done && !t.completedAt) t.completedAt = today();
      if (!done) t.completedAt = '';
      if (done && !Lists.isDone(was)) { Timeline.add(t.clientId, 'task', `Task completed: ${t.code} ${t.title}`); this.spawnNext(t); }
    });
    if (!silent) Auth.audit('edit', 'tasks', `${t.code} status: ${Lists.name('taskStatuses', was)} → ${Lists.name('taskStatuses', status)}`, { recordId: t.id, old: { status: Lists.name('taskStatuses', was) }, new: { status: Lists.name('taskStatuses', status) } });
  },
  spawnNext(t) {
    if (!t.recurrence || t.nextId || !License.has('recurring')) return;
    const n = { monthly: 1, quarterly: 3, yearly: 12 }[t.recurrence];
    const next = Object.assign(clone(t), { id: uid('t'), status: Lists.firstStatus(), completedAt: '', start: t.start ? addMonths(t.start, n) : '', due: addMonths(t.due, n), comments: [], timeLog: [], running: null, nextId: '', prevId: t.id, subtasks: (t.subtasks || []).map((s) => ({ id: uid('s'), text: s.text, done: false })) });
    next.code = Store.next('task'); Rec.stamp(next, true);
    Store.s.tasks.push(next); t.nextId = next.id;
    toast(`Recurring task ${next.code} created for ${fmtDate(next.due)}`, 'info');
    Auth.audit('create', 'tasks', `Recurring task ${next.code} auto-created from ${t.code}`, { recordId: next.id });
  },
  rowCls(t) { return DB.isOverdue(t) ? 'row-late' : ''; },
  dueCell(t) { const late = DB.isOverdue(t); const dd = t.due ? daysBetween(today(), t.due) : null; return html`<span class="${late ? 'late-txt' : ''}">${fmtDate(t.due)}</span>${late ? html`<br>${badge(`${-dd}d overdue`, 'red')}` : (!Lists.isDone(t.status) && dd !== null && dd <= 3 ? html`<br>${badge(dd === 0 ? 'Due today' : `in ${dd}d`, 'amber')}` : '')}`; },
  cols(selectableStatus = true) {
    return [
      { key: 'code', label: 'Task ID', render: (t) => html`<a class="code" href="#/tasks/${t.code}">${t.code}</a>` },
      { key: 'title', label: 'Title', render: (t) => html`<a href="#/tasks/${t.code}" class="strong">${t.title}</a>${t.recurrence ? html` <span title="Repeats ${t.recurrence}">↻</span>` : ''}${(t.subtasks || []).length ? html`<br>${progress(this.pct(t))}` : ''}` },
      { key: 'client', label: 'Client', get: (t) => (DB.client(t.clientId) || {}).name, render: (t) => { const c = DB.client(t.clientId); return c ? html`<a href="#/clients/${c.code}">${c.name}</a><br><small class="code">${c.code}</small>` : html`<span class="muted">—</span>`; } },
      { key: 'service', label: 'Service', get: (t) => Lists.name('services', t.service), render: (t) => Lists.name('services', t.service) },
      { key: 'assignedTo', label: 'Assigned', get: (t) => DB.memberName(t.assignedTo), render: (t) => DB.memberName(t.assignedTo) },
      { key: 'priority', label: 'Priority', get: (t) => Lists.all('priorities').findIndex((p) => p.id === t.priority), render: (t) => listBadge('priorities', t.priority) },
      { key: 'due', label: 'Due', render: (t) => this.dueCell(t) },
      { key: 'status', label: 'Status', get: (t) => Lists.all('taskStatuses').findIndex((p) => p.id === t.status), render: (t) => Auth.can('tasks', 'edit') && selectableStatus ? html`<select class="inp sm status-sel" data-act-change="task:status" data-id="${t.id}" aria-label="Status">${Lists.options('taskStatuses', t.status)}</select>` : listBadge('taskStatuses', t.status) },
      { key: 'completedAt', label: 'Completed', render: (t) => fmtDate(t.completedAt) }
    ];
  },
  table(rows, key, opts = {}) { return dataTable(key, { rows, cols: this.cols(), selectable: opts.selectable, rowCls: (t) => this.rowCls(t), empty: emptyState('No tasks', 'Create a task or change filters.') }); },
  pct(t) { const s = t.subtasks || []; return s.length ? s.filter((x) => x.done).length / s.length * 100 : 0; },
  miniRow(t) { return html`<div class="mini-row ${DB.isOverdue(t) ? 'late' : ''}"><div class="mr-main"><a href="#/tasks/${t.code}"><b>${t.title}</b></a><small class="muted">${t.code} · ${(DB.client(t.clientId) || {}).name || ''}</small></div><div class="mr-side">${this.dueCell(t)}</div></div>`; },
  filtered() {
    const f = vs('tasks');
    return Auth.tasks().filter((t) => {
      const c = DB.client(t.clientId) || {};
      return textMatch(f.q, t.code, t.title, t.description, c.name, c.code) && (!f.status || t.status === f.status) && (!f.priority || t.priority === f.priority)
        && (!f.assignee || t.assignedTo === f.assignee) && (!f.service || t.service === f.service) && (!f.client || t.clientId === f.client)
        && inRange(t.due, f.from, f.to) && (!f.overdue || DB.isOverdue(t)) && (!f.mine || t.assignedTo === Auth.memberId()) && (!f.project || t.projectId === f.project) && (f.showDone !== false && f.showDone !== '' ? true : !Lists.isDone(t.status) || f.status);
    });
  }
};

Views.tasks = {
  onNew() { if (Auth.can('tasks', 'create')) Tasks.open(); },
  render(params) {
    if (params[0]) return TaskDetail.render(params[0]);
    const f = vs('tasks', { tab: 'table', showDone: true }); const rows = Tasks.filtered(); const sel = tstate('tasks').sel.size;
    let body;
    if (f.tab === 'kanban') body = this.kanban(rows);
    else if (f.tab === 'calendar') body = this.calendar(rows);
    else body = html`${sel ? html`<div class="bulk card"><b>${sel} selected</b>${Auth.can('tasks', 'edit') ? html`<select class="inp sm" data-act-change="task:bulk-status" aria-label="Set status"><option value="">Set status…</option>${Lists.options('taskStatuses')}</select><select class="inp sm" data-act-change="task:bulk-assign" aria-label="Reassign"><option value="">Reassign to…</option>${memberOpts().map((o) => html`<option value="${o.value}">${o.label}</option>`)}</select>` : ''}${Auth.can('tasks', 'delete') ? btn('Delete', 'task:bulk-del', { cls: 'sm danger' }) : ''}</div>` : ''}<div class="card p0">${Tasks.table(rows, 'tasks', { selectable: true })}</div>`;
    return html`${pageHead('Tasks', `${rows.length} tasks · ${rows.filter((t) => DB.isOverdue(t)).length} overdue`, html`${Auth.can('tasks', 'export') ? btn('Export', 'task:export', { cls: 'ghost', icon: 'download' }) : ''}${Auth.can('tasks', 'create') ? btn('New task', 'task:new', { cls: 'primary', icon: 'plus' }) : ''}`)}
      <div class="row-between wrap">${tabsBar('tasks', [['table', 'Table'], ['kanban', 'Kanban board'], ['calendar', 'Calendar']], f.tab)}</div>
      <div class="card filters">${fInput('tasks.q', 'Search task, client…')}${fSelect('tasks.status', 'All statuses', listOpts('taskStatuses'))}${fSelect('tasks.priority', 'All priorities', listOpts('priorities'))}${fSelect('tasks.assignee', 'Anyone', memberOpts())}${fSelect('tasks.service', 'All services', listOpts('services'))}${fSelect('tasks.client', 'All clients', clientOpts())}${fSelect('tasks.project', 'All projects', (Store.s.projects||[]).map(p=>({value:p.id,label:p.code+' · '+p.name})))}${fDate('tasks.from', 'Due from')}${fDate('tasks.to', 'to')}
        <label class="chk"><input type="checkbox" data-vs="tasks.overdue" ${f.overdue ? raw('checked') : ''}> <span>Overdue only</span></label>${Auth.memberId() ? html`<label class="chk"><input type="checkbox" data-vs="tasks.mine" ${f.mine ? raw('checked') : ''}> <span>My tasks</span></label>` : ''}<label class="chk"><input type="checkbox" data-vs="tasks.showDone" ${f.showDone ? raw('checked') : ''}> <span>Show completed</span></label>
        ${savedFiltersBar('tasks')}</div>${body}`;
  },
  kanban(rows) {
    const cols = Lists.all('taskStatuses'); const canEdit = Auth.can('tasks', 'edit');
    return html`<div class="kanban">${cols.map((s) => { const items = rows.filter((t) => t.status === s.id).sort((a, b) => (a.due > b.due ? 1 : -1)); return html`<div class="kcol" data-drop="${s.id}"><div class="kcol-h"><i style="background:${s.color || '#888'}"></i><b>${s.name}</b><span class="cnt">${items.length}</span></div><div class="kcol-b">${items.slice(0, 80).map((t) => { const c = DB.client(t.clientId) || {}; return html`<div class="kcard ${DB.isOverdue(t) ? 'late' : ''}" draggable="${canEdit}" data-drag="${t.id}"><div class="row-between"><a class="code" href="#/tasks/${t.code}">${t.code}</a>${listBadge('priorities', t.priority)}</div><a href="#/tasks/${t.code}" class="strong">${t.title}</a><div class="muted sm">${c.code || ''} · ${c.name || ''}</div>${(t.subtasks || []).length ? progress(Tasks.pct(t)) : ''}<div class="row-between sm"><span>${avatar(DB.memberName(t.assignedTo), (DB.member(t.assignedTo) || {}).photo, 22)} ${DB.memberName(t.assignedTo).split(' ')[0]}</span><span class="${DB.isOverdue(t) ? 'late-txt' : 'muted'}">${fmtDate(t.due)}</span></div>${canEdit ? html`<select class="inp sm only-m" data-act-change="task:status" data-id="${t.id}" aria-label="Move to">${Lists.options('taskStatuses', t.status)}</select>` : ''}</div>`; })}${items.length > 80 ? html`<p class="muted sm">+${items.length - 80} more (use filters)</p>` : ''}</div></div>`; })}</div>`;
  },
  calendar(rows) {
    const f = vs('tasks'); const base = f.month || monthKey(today()); const [y, m] = base.split('-').map(Number);
    const first = new Date(y, m - 1, 1); const startDow = (first.getDay() + 6) % 7; const days = new Date(y, m, 0).getDate();
    const byDay = groupBy(rows.filter((t) => monthKey(t.due) === base), (t) => t.due);
    const cells = []; for (let i = 0; i < startDow; i++) cells.push(null); for (let d = 1; d <= days; d++) cells.push(`${base}-${pad(d, 2)}`);
    while (cells.length % 7) cells.push(null);
    const prev = monthKey(addMonths(base + '-01', -1)), next = monthKey(addMonths(base + '-01', 1));
    const comp = (Store.s.compliance || []).filter((x) => x.active !== false);
    return html`<div class="card"><div class="cal-h">${btn('‹', 'nav', { cls: 'ghost sm', extra: `data-vs-set="tasks.month" data-val="${prev}"` })}<h3>${MONTHS[m - 1]} ${y}</h3>${btn('›', 'nav', { cls: 'ghost sm', extra: `data-vs-set="tasks.month" data-val="${next}"` })}${btn('Today', 'nav', { cls: 'ghost sm', extra: `data-vs-set="tasks.month" data-val="${monthKey(today())}"` })}</div>
      <div class="cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => html`<div class="cal-dow">${d}</div>`)}${cells.map((d) => d ? html`<div class="cal-d ${d === today() ? 'today' : ''}" data-drop-day="${d}"><span class="cal-n">${+d.slice(8)}</span>${comp.filter((x) => Compliance.dueIn(x, base) === d).map((x) => html`<div class="cal-comp" title="${x.name}">⚑ ${x.name}</div>`)}${(byDay[d] || []).slice(0, 4).map((t) => html`<a href="#/tasks/${t.code}" class="cal-t ${DB.isOverdue(t) ? 'late' : Lists.isDone(t.status) ? 'done' : ''}" draggable="${Auth.can('tasks', 'edit')}" data-drag-day="${t.id}" title="${t.code} ${t.title}">${t.title}</a>`)}${(byDay[d] || []).length > 4 ? html`<small class="muted">+${byDay[d].length - 4} more</small>` : ''}</div>` : html`<div class="cal-d off"></div>`)}</div><p class="help">Drag a task to another day to change its due date. ⚑ = compliance deadline.</p></div>`;
  },
  mount(root, params) {
    if (params[0]) return TaskDetail.mount(root, params[0]);
    // Kanban drag & drop between status columns
    let dragId = null;
    $$('[data-drag]', root).forEach((c) => {
      c.addEventListener('dragstart', (e) => { dragId = c.dataset.drag; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
      c.addEventListener('dragend', () => c.classList.remove('dragging'));
    });
    $$('[data-drop]', root).forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', () => col.classList.remove('over'));
      col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('over'); const id = dragId || e.dataTransfer.getData('text/plain'); const t = DB.task(id); if (t && t.status !== col.dataset.drop) { Tasks.setStatus(t, col.dataset.drop); toast(`${t.code} → ${Lists.name('taskStatuses', col.dataset.drop)}`); } dragId = null; });
    });
    // Calendar drag to change due date
    $$('[data-drag-day]', root).forEach((c) => c.addEventListener('dragstart', (e) => { dragId = c.dataset.dragDay; e.dataTransfer.setData('text/plain', dragId); }));
    $$('[data-drop-day]', root).forEach((d) => {
      d.addEventListener('dragover', (e) => { e.preventDefault(); d.classList.add('over'); });
      d.addEventListener('dragleave', () => d.classList.remove('over'));
      d.addEventListener('drop', (e) => { e.preventDefault(); const t = DB.task(dragId || e.dataTransfer.getData('text/plain')); if (t) { const old = t.due; Store.commit(() => { t.due = d.dataset.dropDay; Rec.stamp(t); }); Auth.audit('edit', 'tasks', `${t.code} due date moved`, { recordId: t.id, old: { due: old }, new: { due: t.due } }); toast(`${t.code} due ${fmtDate(t.due)}`); } dragId = null; });
    });
  }
};

/* ---------- Task detail page ---------- */
const TaskDetail = {
  render(code) {
    const t = Store.s.tasks.find((x) => x.code === code);
    if (!t || !Auth.tasks().includes(t)) return emptyState('Task not found', 'It may have been deleted or is not visible to you.');
    const c = DB.client(t.clientId) || {}; const canEdit = Auth.can('tasks', 'edit');
    const docs = Store.s.documents.filter((d) => d.taskId === t.id);
    const total = sum(t.timeLog || [], (l) => l.min);
    const activity = Store.s.audit.filter((a) => a.recordId === t.id).slice(0, 10);
    return html`<div class="crumbs"><a href="#/tasks">Tasks</a> › ${t.code}</div>
      <div class="card"><div class="row-between wrap"><div><h1>${t.title} <span class="code big">${t.code}</span></h1><p class="muted">${c.code ? html`<a href="#/clients/${c.code}">${c.code} · ${c.name}</a>` : '—'} · ${Lists.name('services', t.service)}${t.recurrence ? ` · repeats ${t.recurrence}` : ''}</p></div>
      <div class="row-acts">${canEdit ? html`<select class="inp" data-act-change="task:status" data-id="${t.id}" aria-label="Status">${Lists.options('taskStatuses', t.status)}</select>${btn('Edit', 'task:edit', { id: t.id, icon: 'edit', cls: 'ghost' })}` : listBadge('taskStatuses', t.status)}${c.id ? btn('Remind client', 'task:wa', { id: t.id, icon: 'wa', cls: 'wa' }) : ''}${Auth.can('tasks', 'delete') ? btn('', 'task:del', { id: t.id, icon: 'trash', cls: 'icon-btn danger-txt', title: 'Delete task' }) : ''}</div></div>
      ${DB.isOverdue(t) ? html`<div class="note err">This task is overdue by ${-daysBetween(today(), t.due)} days.</div>` : ''}
      ${(()=>{ const prj = t.projectId && DB.project ? DB.project(t.projectId) : null; return kv([['Project', prj ? html`<a href="#/projects/${prj.code}">${prj.name}</a>` : '—'], ['Assigned to', DB.memberName(t.assignedTo)], ['Priority', listBadge('priorities', t.priority)], ['Status', listBadge('taskStatuses', t.status)], ['Start date', fmtDate(t.start)], ['Due date', Tasks.dueCell(t)], ['Completion date', fmtDate(t.completedAt)], ['Customer code', c.code], ['Created', `${fmtDateTime(t.createdAt)} by ${t.createdBy || ''}`]]); })()}
      ${t.description ? html`<div class="desc">${t.description}</div>` : ''}</div>
      <div class="grid2"><div class="card"><div class="card-h"><h3>Checklist</h3><span class="muted sm">${(t.subtasks || []).filter((s) => s.done).length}/${(t.subtasks || []).length}</span></div>${progress(Tasks.pct(t), Tasks.pct(t) === 100 ? 'green' : '')}
        <ul class="checklist">${(t.subtasks || []).map((s) => html`<li><label class="chk"><input type="checkbox" data-act="sub:toggle" data-id="${t.id}" data-sub="${s.id}" ${s.done ? raw('checked') : ''} ${canEdit ? '' : raw('disabled')}> <span class="${s.done ? 'done' : ''}">${s.text}</span></label>${canEdit ? btn('', 'sub:del', { id: t.id, icon: 'close', cls: 'icon-btn sm', title: 'Remove', extra: `data-sub="${esc(s.id)}"` }) : ''}</li>`)}</ul>
        ${canEdit ? html`<form class="inline-form" data-sub-form="${t.id}"><input class="inp" name="text" placeholder="Add checklist item…" aria-label="New checklist item"><button class="btn sm">Add</button></form>` : ''}</div>
      <div class="card"><div class="card-h"><h3>Time log</h3><b>${Math.floor(total / 60)}h ${total % 60}m</b></div>
        ${t.running ? html`<div class="timer on">${icon('timer')} <b data-timer="${t.running.start}">00:00:00</b> <span class="muted sm">started by ${t.running.by}</span>${btn('Stop', 'time:stop', { id: t.id, cls: 'sm danger' })}</div>` : (canEdit ? html`<div class="timer">${btn('Start timer', 'time:start', { id: t.id, icon: 'timer', cls: 'sm primary' })}${btn('Add time manually', 'time:add', { id: t.id, cls: 'sm ghost' })}</div>` : '')}
        <ul class="list sm">${(t.timeLog || []).slice().reverse().map((l) => html`<li>${fmtDateTime(l.start)} — <b>${l.min} min</b> · ${l.by}${l.note ? ' · ' + l.note : ''}</li>`)}</ul></div></div>
      <div class="grid2"><div class="card"><h3>Comments</h3><ul class="notes">${(t.comments || []).map((cm) => html`<li>${avatar(cm.by, '', 28)}<div><b>${cm.by}</b> <small class="muted">${fmtDateTime(cm.at)}</small><p>${cm.text}</p></div></li>`)}</ul>
        <form class="inline-form" data-cm-form="${t.id}"><input class="inp" name="text" placeholder="Write a comment…" aria-label="Comment"><button class="btn sm primary">Post</button></form></div>
      <div class="card"><div class="card-h"><h3>Attachments</h3>${Auth.can('documents', 'create') ? btn('Attach file', 'doc:upload', { cls: 'sm ghost', icon: 'upload', extra: `data-client="${esc(t.clientId || '')}" data-task="${esc(t.id)}"` }) : ''}</div>${docs.length ? html`<ul class="list">${docs.map((d) => html`<li class="row-between"><span>${icon('documents')} <a href="#" data-act="doc:preview" data-id="${d.id}">${d.name}</a> <small class="muted">${fmtSize(Docs.cur(d).size)}</small></span>${btn('', 'doc:download', { id: d.id, icon: 'download', cls: 'icon-btn sm', title: 'Download' })}</li>`)}</ul>` : html`<p class="muted">No attachments.</p>`}
        <h3 class="mt">Activity</h3><ul class="list sm">${activity.map((a) => html`<li><b>${a.user}</b> — ${a.summary} <small class="muted">${timeAgo(a.at)}</small></li>`)}</ul></div></div>`;
  },
  mount(root, code) {
    const t = Store.s.tasks.find((x) => x.code === code); if (!t) return;
    const sf = root.querySelector('[data-sub-form]');
    if (sf) sf.onsubmit = (e) => { e.preventDefault(); const v = sf.text.value.trim(); if (!v) return; Store.commit(() => { t.subtasks = t.subtasks || []; t.subtasks.push({ id: uid('s'), text: v, done: false }); }); };
    const cf = root.querySelector('[data-cm-form]');
    if (cf) cf.onsubmit = (e) => {
      e.preventDefault(); const v = cf.text.value.trim(); if (!v) return;
      Store.commit(() => { t.comments = t.comments || []; t.comments.push({ id: uid('cm'), by: Auth.user.name, userId: Auth.user.id, at: new Date().toISOString(), text: v }); });
      const m = DB.member(t.assignedTo); const u = m && Team.user(m); if (u && u.id !== Auth.user.id) Notify.push(u.id, 'comment', `New comment on ${t.code}`, `${Auth.user.name}: ${v.slice(0, 100)}`, '#/tasks/' + t.code);
      Auth.audit('create', 'tasks', `Comment on ${t.code}`, { recordId: t.id });
    };
    const tm = root.querySelector('[data-timer]');
    if (tm) { const st = new Date(tm.dataset.timer).getTime(); const upd = () => { if (!document.body.contains(tm)) { clearInterval(iv); return; } const s = Math.floor((Date.now() - st) / 1000); tm.textContent = `${pad(Math.floor(s / 3600), 2)}:${pad(Math.floor(s / 60) % 60, 2)}:${pad(s % 60, 2)}`; }; const iv = setInterval(upd, 1000); upd(); }
  }
};

const taskOf = (a) => DB.task(a.dataset.id);
act('task:new', (a) => Tasks.open(null, a.dataset.client ? { clientId: a.dataset.client } : {}));
act('task:edit', (a) => Tasks.open(taskOf(a)));
act('task:status', (a) => { const t = taskOf(a); Tasks.setStatus(t, a.value); toast(`${t.code} → ${Lists.name('taskStatuses', a.value)}`); });
act('task:del', async (a) => { const t = taskOf(a); if (!(await confirmDlg(`Delete task ${t.code}?`, { danger: true, ok: 'Delete' }))) return; Rec.remove('tasks', t, `Task ${t.code}`, 'tasks'); if (Router.cur.params[0]) location.hash = '#/tasks'; });
act('task:wa', (a) => { const t = taskOf(a); Contact.compose('whatsapp', DB.client(t.clientId), t); });
act('task:bulk-status', (a) => { if (!a.value) return; const ids = Array.from(tstate('tasks').sel); ids.forEach((id) => { const t = DB.task(id); if (t) Tasks.setStatus(t, a.value, true); }); Auth.audit('edit', 'tasks', `Bulk status → ${Lists.name('taskStatuses', a.value)} for ${ids.length} tasks`); tstate('tasks').sel.clear(); toast(`${ids.length} tasks updated`); Router.refresh(); });
act('task:bulk-assign', (a) => { if (!a.value) return; const ids = Array.from(tstate('tasks').sel); Store.commit(() => ids.forEach((id) => { const t = DB.task(id); if (t) { t.assignedTo = a.value; Rec.stamp(t); } })); Notify.toMember(a.value, 'assignment', 'Tasks reassigned to you', `${ids.length} tasks were assigned to you.`, '#/tasks'); Auth.audit('edit', 'tasks', `Bulk reassigned ${ids.length} tasks to ${DB.memberName(a.value)}`); tstate('tasks').sel.clear(); toast('Tasks reassigned'); });
act('task:bulk-del', async () => {
  const ids = new Set(tstate('tasks').sel); if (!(await confirmDlg(`Delete ${ids.size} tasks?`, { danger: true, ok: 'Delete' }))) return;
  const backup = Store.s.tasks.slice(); Store.commit((s) => { s.tasks = s.tasks.filter((t) => !ids.has(t.id)); }); tstate('tasks').sel.clear();
  Auth.audit('delete', 'tasks', `Bulk deleted ${ids.size} tasks`);
  toast(`${ids.size} tasks deleted`, 'ok', { undo: () => Store.commit((s) => { s.tasks = backup; }) });
});
act('task:export', () => {
  const rows = Tasks.filtered(); const H = ['Task ID', 'Client', 'Customer Code', 'Service', 'Title', 'Description', 'Assigned To', 'Priority', 'Start', 'Due', 'Completion Date', 'Status'];
  downloadFile('tasks.csv', toCSV(H, rows.map((t) => { const c = DB.client(t.clientId) || {}; return [t.code, c.name, c.code, Lists.name('services', t.service), t.title, t.description, DB.memberName(t.assignedTo), Lists.name('priorities', t.priority), t.start, t.due, t.completedAt, Lists.name('taskStatuses', t.status)]; })), 'text/csv');
  Auth.audit('export', 'tasks', `Exported ${rows.length} tasks`);
});
act('sub:toggle', (a) => { const t = taskOf(a); const s = t.subtasks.find((x) => x.id === a.dataset.sub); Store.commit(() => { s.done = a.checked; }); });
act('sub:del', (a) => { const t = taskOf(a); Store.commit(() => { t.subtasks = t.subtasks.filter((x) => x.id !== a.dataset.sub); }); });
act('time:start', (a) => { const t = taskOf(a); Store.commit(() => { t.running = { start: new Date().toISOString(), by: Auth.user.name }; }); });
act('time:stop', (a) => { const t = taskOf(a); const min = Math.max(1, Math.round((Date.now() - new Date(t.running.start).getTime()) / 60000)); Store.commit(() => { t.timeLog = t.timeLog || []; t.timeLog.push({ start: t.running.start, min, by: t.running.by }); t.running = null; }); toast(`${min} minutes logged`); });
act('time:add', (a) => { const t = taskOf(a); formModal({ title: 'Log time', size: 'sm', fields: [{ name: 'date', label: 'Date', type: 'date', required: true }, { name: 'min', label: 'Minutes', type: 'number', required: true, min: 1 }, { name: 'note', label: 'Note' }], values: { date: today() }, onSubmit: (v) => { Store.commit(() => { t.timeLog = t.timeLog || []; t.timeLog.push({ start: v.date + 'T09:00:00', min: v.min, by: Auth.user.name, note: v.note }); }); } }); });
