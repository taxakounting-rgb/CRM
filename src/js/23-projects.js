/* ==========================================================================
   23-projects.js — Project Management
   Projects: linked to clients, have tasks, milestones, budget, status.
   ========================================================================== */

const Projects = {
  statusColors: { 'Planning': 'blue', 'Active': 'green', 'On Hold': 'amber', 'Completed': 'green', 'Cancelled': 'red' },
  statuses: ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'],

  pct(p) {
    const tasks = Store.s.tasks.filter(t => t.projectId === p.id);
    if (!tasks.length) return 0;
    return Math.round(tasks.filter(t => Lists.isDone(t.status)).length / tasks.length * 100);
  },

  open(proj, preset = {}) {
    const isNew = !proj;
    const v = proj ? clone(proj) : Object.assign({
      name: '', clientId: '', status: 'Planning',
      start: today(), due: addDays(today(), 30),
      budget: 0, description: ''
    }, preset);

    formModal({
      title: isNew ? 'New Project' : `Edit: ${proj.name}`,
      size: 'lg', submit: isNew ? 'Create Project' : 'Save Changes',
      fields: [
        { name: 'name', label: 'Project Name', required: true, full: true },
        { name: 'clientId', label: 'Client', type: 'select', options: clientOpts, required: true },
        { name: 'status', label: 'Status', type: 'select', options: Projects.statuses.map(s => ({ value: s, label: s })), required: true },
        { name: 'start', label: 'Start Date', type: 'date', required: true },
        { name: 'due', label: 'Deadline', type: 'date', required: true, validate: (val, all) => val && all.start && val < all.start ? 'Deadline cannot be before start date' : '' },
        { name: 'budget', label: `Budget (${curCode()})`, type: 'money', min: 0 },
        { name: 'description', label: 'Description / Scope', type: 'textarea', full: true, rows: 3 },
      ],
      values: v,
      onSubmit: (vals) => {
        if (!Auth.canSeeClient(vals.clientId)) return { clientId: 'Choose one of your clients.' };
        if (isNew) {
          const rec = Rec.stamp(Object.assign({ id: uid('prj') }, vals), true);
          Store.commit(s => { rec.code = Store.next('prj'); s.projects.push(rec); });
          Auth.audit('create', 'projects', `Project ${rec.code} "${rec.name}" created`, { recordId: rec.id });
          toast(`${rec.code} created`);
          location.hash = '#/projects/' + rec.code;
        } else {
          const old = clone(proj);
          Store.commit(() => { Object.assign(proj, vals); Rec.stamp(proj); });
          Auth.audit('edit', 'projects', `Project ${proj.code} edited`, { recordId: proj.id, old, new: vals });
          toast('Project updated');
        }
      }
    });
  },

  card(p) {
    const c = DB.client(p.clientId) || {};
    const tasks = Store.s.tasks.filter(t => t.projectId === p.id);
    const done = tasks.filter(t => Lists.isDone(t.status)).length;
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    const isLate = p.due && p.status !== 'Completed' && p.status !== 'Cancelled' && p.due < today();
    return html`
      <div class="proj-card">
        <div class="proj-card-top">
          <div>
            <a href="#/projects/${p.code}" class="proj-name">${p.name}</a>
            <div class="proj-meta"><a href="#/clients/${c.code}" class="muted">${c.name || '—'}</a> · <code>${p.code}</code></div>
          </div>
          ${badge(p.status, Projects.statusColors[p.status] || 'blue')}
        </div>
        ${p.description ? html`<p class="proj-desc muted">${p.description}</p>` : ''}
        <div class="proj-stats">
          <span>${icon('tasks')}<b>${done}/${tasks.length}</b> tasks</span>
          ${p.budget ? html`<span>${icon('invoices')}<b>${money(p.budget)}</b> budget</span>` : ''}
          ${p.due ? html`<span class="${isLate ? 'late-txt' : ''}">${icon('compliance')}<b>${fmtDate(p.due)}</b></span>` : ''}
        </div>
        ${tasks.length ? html`<div class="proj-progress">${progress(pct, pct === 100 ? 'green' : isLate ? 'red' : 'blue')}<small>${pct}% complete</small></div>` : ''}
        <div class="row-acts">
          ${Auth.can('projects', 'edit') ? btn('', 'prj:edit', { id: p.id, icon: 'edit', cls: 'icon-btn sm', title: 'Edit' }) : ''}
          ${Auth.can('projects', 'delete') ? btn('', 'prj:del', { id: p.id, icon: 'trash', cls: 'icon-btn sm', title: 'Delete' }) : ''}
        </div>
      </div>`;
  }
};

/* ---- Add projects array to initial state ---- */
const _origLoad = Store.load;
Store.load = async function() {
  await _origLoad.call(this);
  if (!this.s.projects) Store.commit(s => { s.projects = []; });
};

/* ---- DB helpers ---- */
DB.project = (id) => (Store.s.projects || []).find(p => p.id === id);
DB.projectByCode = (code) => (Store.s.projects || []).find(p => p.code === code);

/* ---- Views ---- */
Views.projects = {
  perm: 'projects',
  onNew() { if (Auth.can('projects', 'create')) Projects.open(); },

  render(params) {
    if (!Store.s.projects) Store.commit(s => { s.projects = []; });
    if (params[0]) return this.detail(params[0]);
    const f = vs('projects', { status: '', client: '', q: '' });
    let rows = Auth.byClient ? Auth.byClient(Store.s.projects) : Store.s.projects;

    // Filter
    if (f.q) rows = rows.filter(p => {
      const c = DB.client(p.clientId) || {};
      return textMatch(f.q, p.name, p.code, c.name, c.code, p.description);
    });
    if (f.status) rows = rows.filter(p => p.status === f.status);
    if (f.client) rows = rows.filter(p => p.clientId === f.client);

    const counts = {};
    Projects.statuses.forEach(s => { counts[s] = (Store.s.projects || []).filter(p => p.status === s).length; });

    return html`
      ${pageHead('Projects', 'Manage all client projects and track progress',
        html`${Auth.can('projects', 'create') ? btn('New Project', 'prj:new', { cls: 'primary', icon: 'plus' }) : ''}`
      )}
      <div class="kpis sm4">
        <div class="kpi"><small>Total</small><b>${rows.length}</b></div>
        <div class="kpi"><small>Active</small><b>${counts['Active'] || 0}</b></div>
        <div class="kpi"><small>Completed</small><b>${counts['Completed'] || 0}</b></div>
        <div class="kpi ${counts['On Hold'] ? 'warn' : ''}"><small>On Hold</small><b>${counts['On Hold'] || 0}</b></div>
      </div>
      <div class="card filters">
        ${fInput('projects.q', 'Search project, client…')}
        ${fSelect('projects.status', 'All statuses', Projects.statuses.map(s => ({ value: s, label: s })))}
        ${fSelect('projects.client', 'All clients', clientOpts())}
      </div>
      ${rows.length
        ? html`<div class="proj-grid">${rows.map(p => Projects.card(p))}</div>`
        : emptyState('No projects found', 'Create your first project to get started.', Auth.can('projects', 'create') ? btn('New Project', 'prj:new', { cls: 'primary', icon: 'plus' }) : '')}`;
  },

  detail(code) {
    const p = DB.projectByCode(code);
    if (!p) return emptyState('Project not found');
    const c = DB.client(p.clientId) || {};
    const tasks = Store.s.tasks.filter(t => t.projectId === p.id);
    const done = tasks.filter(t => Lists.isDone(t.status)).length;
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    const isLate = p.due && p.status !== 'Completed' && p.status !== 'Cancelled' && p.due < today();
    const canEdit = Auth.can('projects', 'edit');

    return html`
      <div class="crumbs"><a href="#/projects">Projects</a> › ${p.name}</div>
      <div class="card">
        <div class="row-between wrap">
          <div>
            <h1>${p.name} ${badge(p.status, Projects.statusColors[p.status] || 'blue')}</h1>
            <p class="muted"><a href="#/clients/${c.code}">${c.code} · ${c.name}</a> · <code>${p.code}</code>
              · Start: ${fmtDate(p.start)} · Deadline: <span class="${isLate ? 'late-txt' : ''}">${fmtDate(p.due)}</span>
            </p>
          </div>
          <div class="row-acts">
            ${canEdit ? html`
              ${Projects.statuses.filter(s => s !== p.status).map(s =>
                s === 'Completed' || s === 'Active' || s === 'On Hold'
                  ? btn(s, 'prj:setstatus', { id: p.id, status: s, cls: 'ghost sm' }) : ''
              )}
            ` : ''}
            ${canEdit ? btn('Edit', 'prj:edit', { id: p.id, cls: 'ghost', icon: 'edit' }) : ''}
            ${Auth.can('projects', 'delete') ? btn('', 'prj:del', { id: p.id, icon: 'trash', cls: 'icon-btn danger-txt', title: 'Delete project' }) : ''}
          </div>
        </div>
      </div>

      <div class="grid-31">
        <div>
          <div class="card">
            <div class="row-between"><h3>Tasks (${done}/${tasks.length} done)</h3>
              ${Auth.can('tasks', 'create') ? btn('Add Task', 'prj:addtask', { id: p.id, cls: 'primary sm', icon: 'plus' }) : ''}
            </div>
            ${tasks.length ? html`
              ${progress(pct, pct === 100 ? 'green' : isLate ? 'red' : 'blue')}
              <p class="muted sm">${pct}% complete</p>
              <ul class="list">
                ${tasks.sort((a, b) => (a.due || '') > (b.due || '') ? 1 : -1).map(t => {
                  const late = DB.isOverdue(t);
                  return html`<li class="row-between">
                    <span>
                      <a href="#/tasks/${t.code}" class="${Lists.isDone(t.status) ? 'done-txt' : ''}">${t.code} · ${t.title}</a>
                      <br><small class="muted ${late ? 'late-txt' : ''}">${DB.memberName ? DB.memberName(t.assignedTo) : ''} · due ${fmtDate(t.due)}</small>
                    </span>
                    ${badge(Lists.name('taskStatuses', t.status) || t.status, late ? 'red' : Lists.isDone(t.status) ? 'green' : 'blue')}
                  </li>`;
                })}
              </ul>` : emptyState('No tasks yet', 'Add tasks to track work on this project.')}
          </div>
        </div>

        <div>
          <div class="card">
            <h3>Project Details</h3>
            <table class="meta-t">
              <tr><td>Status</td><td>${badge(p.status, Projects.statusColors[p.status] || 'blue')}</td></tr>
              <tr><td>Client</td><td><a href="#/clients/${c.code}">${c.name}</a></td></tr>
              <tr><td>Start</td><td>${fmtDate(p.start)}</td></tr>
              <tr><td>Deadline</td><td class="${isLate ? 'late-txt' : ''}">${fmtDate(p.due)}</td></tr>
              ${p.budget ? html`<tr><td>Budget</td><td><b>${money(p.budget)}</b></td></tr>` : ''}
              ${p.description ? html`<tr><td>Scope</td><td>${p.description}</td></tr>` : ''}
              <tr><td>Progress</td><td><b>${pct}%</b> (${done}/${tasks.length} tasks)</td></tr>
            </table>
          </div>
        </div>
      </div>`;
  }
};

/* ---- Actions ---- */
act('prj:new', (a) => Projects.open(null, a.dataset.client ? { clientId: a.dataset.client } : {}));
act('prj:edit', (a) => { const p = DB.project(a.dataset.id); if (p) Projects.open(p); });
act('prj:setstatus', (a) => {
  const p = DB.project(a.dataset.id);
  if (!p) return;
  Store.commit(() => { p.status = a.dataset.status; Rec.stamp(p); });
  Auth.audit('edit', 'projects', `Project ${p.code} status → ${p.status}`, { recordId: p.id });
  toast(`Status: ${p.status}`);
});
act('prj:addtask', (a) => {
  const p = DB.project(a.dataset.id);
  if (!p) return;
  Tasks.open(null, { clientId: p.clientId, projectId: p.id });
});
act('prj:del', async (a) => {
  const p = DB.project(a.dataset.id);
  if (!p) return;
  const taskCount = Store.s.tasks.filter(t => t.projectId === p.id).length;
  if (!(await confirmDlg(html`Delete project <b>${p.name}</b>${taskCount ? html` (${taskCount} linked task(s) will be unlinked)` : ''}?`, { danger: true, ok: 'Delete' }))) return;
  const idx = Store.s.projects.indexOf(p);
  Store.commit(s => {
    s.tasks.forEach(t => { if (t.projectId === p.id) delete t.projectId; });
    s.projects.splice(idx, 1);
  });
  Auth.audit('delete', 'projects', `Deleted project ${p.code} "${p.name}"`, { recordId: p.id });
  location.hash = '#/projects';
  toast(`Project "${p.name}" deleted`);
});
