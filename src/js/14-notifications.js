/* ==========================================================================
   14-notifications.js — Per-user notification center + auto reminders
   (deadlines 3/7 days, overdue tasks, assignments, follow-ups, document
   expiry, overdue invoices, password age, compliance) + browser notifications.
   ========================================================================== */
const Notify = {
  push(userId, type, title, body, link = '', key = '') {
    if (!userId) return false;
    if (key && Store.s.notifications.some((n) => n.userId === userId && n.key === key)) return false;
    const n = { id: uid('nt'), userId, type, title, body, link, key, at: new Date().toISOString(), read: false };
    Store.s.notifications.unshift(n);
    if (Store.s.notifications.length > 3000) Store.s.notifications.length = 3000;
    Store.scheduleSave();
    if (Auth.user && userId === Auth.user.id) this.browser(n);
    return true;
  },
  toMember(memberId, type, title, body, link) { const u = Store.s.users.find((x) => x.memberId === memberId && x.status === 'active'); if (u && (!Auth.user || u.id !== Auth.user.id || type !== 'assignment')) this.push(u.id, type, title, body, link); },
  mine() { return Auth.user ? Store.s.notifications.filter((n) => n.userId === Auth.user.id) : []; },
  browser(n) {
    if (!Store.s.settings.browserNotify || !('Notification' in window) || Notification.permission !== 'granted' || document.hasFocus()) return;
    try { new Notification(n.title, { body: n.body, icon: 'data:image/svg+xml,' + encodeURIComponent(logoSVG({ mark: true })) }); } catch (e) { /* ignore */ }
  },
  /* Auto-generated reminders for the signed-in user (deduplicated by key). */
  generate() {
    if (!Auth.user) return;
    const me = Auth.user.id; const mid = Auth.memberId(); const t0 = today(); let added = 0;
    const P = (...a) => { if (this.push(me, ...a)) added++; };
    if (Auth.can('tasks')) {
      const tasks = Auth.tasks().filter((t) => !Lists.isDone(t.status) && t.due);
      const mineT = mid ? tasks.filter((t) => t.assignedTo === mid) : [];
      mineT.forEach((t) => {
        const d = daysBetween(t0, t.due); const c = DB.client(t.clientId) || {};
        if (d < 0) P('overdue', `Overdue: ${t.code}`, `${t.title} (${c.code || ''}) was due ${fmtDate(t.due)}`, '#/tasks/' + t.code, `over:${t.id}:${t.due}`);
        else if (d <= 3) P('deadline', `Due in ${d} day${d === 1 ? '' : 's'}: ${t.code}`, `${t.title} (${c.code || ''}) — due ${fmtDate(t.due)}`, '#/tasks/' + t.code, `due3:${t.id}:${t.due}`);
        else if (d <= 7) P('deadline', `Due in ${d} days: ${t.code}`, `${t.title} (${c.code || ''}) — due ${fmtDate(t.due)}`, '#/tasks/' + t.code, `due7:${t.id}:${t.due}`);
      });
      if (!mid || !Auth.assignedOnly()) {
        const over = tasks.filter((t) => t.due < t0).length; const soon = tasks.filter((t) => t.due >= t0 && daysBetween(t0, t.due) <= 3).length;
        if (over) P('overdue', `${over} overdue tasks across the firm`, 'Open the task list filtered to overdue tasks.', '#/tasks', `sumover:${t0}`);
        if (soon) P('deadline', `${soon} tasks due in the next 3 days`, 'Review upcoming deadlines.', '#/tasks', `sumsoon:${t0}`);
      }
    }
    if (Auth.can('clients')) Followups.mine().forEach((f) => { const d = f.snoozedTo || f.date; if (d <= t0 && (f.userId === me || Auth.assignedOnly() || !mid)) { const c = DB.client(f.clientId) || {}; P('followup', `Follow-up ${d < t0 ? 'overdue' : 'today'}: ${c.code || ''} ${c.name || ''}`, f.note, '#/clients/' + c.code, `fu:${f.id}:${d}`); } });
    if (Auth.can('documents')) Auth.byClient(Store.s.documents).forEach((d) => { if (!d.expiry) return; const n = daysBetween(t0, d.expiry); const b = n < 0 ? 'x' : n <= 7 ? '7' : n <= 30 ? '30' : ''; if (b) P('expiry', n < 0 ? `Document expired: ${d.name}` : `Document expires in ${n} days`, `${d.code} · ${Lists.name('docCategories', d.category)} · ${(DB.client(d.clientId) || {}).name || ''} — ${fmtDate(d.expiry)}`, '#/documents?doc=' + d.id, `exp:${d.id}:${d.expiry}:${b}`); });
    if (Auth.can('invoices')) Auth.byClient(Store.s.invoices).forEach((i) => { if (DB.invStatus(i) === 'Overdue') P('invoice', `Invoice overdue: ${i.number}`, `${(DB.client(i.clientId) || {}).name || ''} — balance ${money(DB.invBalance(i))}, due ${fmtDate(i.due)}`, '#/invoices/' + i.number, `inv:${i.id}:${i.due}`); });
    if (Auth.can('vault')) Auth.byClient(Store.s.creds).forEach((c) => { if (Vault.age(c) > 90) P('password', `Password older than 90 days`, `${Lists.name('portals', c.portal)} for ${(DB.client(c.clientId) || {}).name || ''} was last changed ${fmtDate(c.changedAt)}`, '#/vault', `pw:${c.id}:${c.changedAt}`); });
    if (Auth.can('compliance')) Store.s.compliance.filter((x) => x.active !== false).forEach((x) => { const d = Compliance.nextDue(x); const n = d ? daysBetween(t0, d) : 99; if (n <= 7) P('deadline', `${x.name} due ${n === 0 ? 'today' : `in ${n} days`}`, `${Lists.name('authorities', x.authority)} deadline on ${fmtDate(d)}`, '#/compliance', `cp:${x.id}:${d}:${n <= 3 ? 3 : 7}`); });
    if (added) { Store.scheduleSave(); App.renderChrome(); }
  }
};
setInterval(() => { if (Auth.user && !Auth.locked) Notify.generate(); }, 5 * 60000);
Bus.on('change', debounce(() => { if (Auth.user && !Auth.locked) Notify.generate(); }, 3000));

const NT_ICON = { overdue: 'tasks', deadline: 'calendar', assignment: 'user', followup: 'phone', expiry: 'documents', invoice: 'invoices', password: 'vault', mention: 'edit', comment: 'edit', registration: 'users' };
Views.notifications = {
  perm: 'any',
  render() {
    const f = vs('notif', { tab: 'all' }); const mine = Notify.mine();
    const rows = mine.filter((n) => (f.tab === 'unread' ? !n.read : true) && (!f.type || n.type === f.type));
    const fus = Followups.mine().sort((a, b) => ((a.snoozedTo || a.date) > (b.snoozedTo || b.date) ? 1 : -1));
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const st = tstate('notif'); const page = rows.slice((st.page - 1) * 50, st.page * 50); const pages = Math.max(1, Math.ceil(rows.length / 50));
    return html`${pageHead('Notifications & Reminders', `${mine.filter((n) => !n.read).length} unread`, html`${perm === 'default' || (perm === 'granted' && !Store.s.settings.browserNotify) ? btn('Enable browser alerts', 'nt:browser', { cls: 'ghost', icon: 'bell' }) : ''}${btn('Mark all read', 'nt:allread', { cls: 'ghost', icon: 'check' })}${btn('Clear read', 'nt:clear', { cls: 'ghost' })}`)}
      ${tabsBar('notif', [['all', 'All', mine.length], ['unread', 'Unread', mine.filter((n) => !n.read).length], ['followups', 'Follow-ups', fus.length]], f.tab)}
      ${f.tab === 'followups' ? html`<div class="card"><div class="card-h"><h3>Follow-up scheduler</h3>${Auth.can('clients') ? btn('Add follow-up', 'fu:pick', { cls: 'sm primary', icon: 'plus' }) : ''}</div>${fus.length ? html`<ul class="list">${fus.map((x) => Followups.item(x))}</ul>` : html`<p class="muted">No pending follow-ups.</p>`}</div>`
      : html`<div class="card filters">${fSelect('notif.type', 'All types', Object.keys(NT_ICON).map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })))}</div><div class="card p0">${rows.length ? html`<ul class="nlist">${page.map((n) => html`<li class="${n.read ? '' : 'unread'}"><span class="n-ic t-${n.type}">${icon(NT_ICON[n.type] || 'bell')}</span><a href="${n.link || '#/notifications'}" data-act="nt:open" data-id="${n.id}"><b>${n.title}</b><br><span class="muted sm">${n.body}</span></a><small class="muted">${timeAgo(n.at)}</small>${btn('', 'nt:del', { id: n.id, icon: 'close', cls: 'icon-btn sm', title: 'Remove' })}</li>`)}</ul><div class="pager"><span class="grow"></span><button type="button" class="btn sm ghost" data-act="tbl:page" data-key="notif" data-p="${st.page - 1}" ${st.page <= 1 ? raw('disabled') : ''}>‹ Prev</button><span class="sm">Page ${st.page} / ${pages}</span><button type="button" class="btn sm ghost" data-act="tbl:page" data-key="notif" data-p="${st.page + 1}" ${st.page >= pages ? raw('disabled') : ''}>Next ›</button></div>` : emptyState("You're all caught up", 'New reminders will appear here.')}</div>`}`;
  }
};
act('nt:open', (a) => { const n = Store.s.notifications.find((x) => x.id === a.dataset.id); if (n && !n.read) Store.commit(() => { n.read = true; }, { allowRO: true }); });
act('nt:del', (a) => Store.commit((s) => { s.notifications = s.notifications.filter((x) => x.id !== a.dataset.id); }, { allowRO: true }));
act('nt:allread', () => Store.commit(() => Notify.mine().forEach((n) => { n.read = true; }), { allowRO: true }));
act('nt:clear', () => Store.commit((s) => { s.notifications = s.notifications.filter((n) => n.userId !== Auth.user.id || !n.read); }, { allowRO: true }));
act('nt:browser', async () => {
  if (!('Notification' in window)) { toast('This browser does not support notifications', 'warn'); return; }
  const p = await Notification.requestPermission();
  if (p === 'granted') { Store.commit((s) => { s.settings.browserNotify = true; }); toast('Browser alerts enabled'); } else toast('Permission was not granted', 'warn');
});
act('fu:pick', () => {
  formModal({ title: 'New follow-up', fields: [{ name: 'clientId', label: 'Client', type: 'select', options: clientOpts, required: true }, { name: 'date', label: 'Date', type: 'date', required: true }, { name: 'note', label: 'Note', type: 'textarea', required: true, full: true }], values: { date: addDays(today(), 1) }, onSubmit: (v) => {
    Store.commit((s) => { s.followups.push({ id: uid('fu'), clientId: v.clientId, date: v.date, note: v.note, done: false, userId: Auth.user.id, at: new Date().toISOString() }); Timeline.add(v.clientId, 'followup', `Follow-up scheduled for ${fmtDate(v.date)}: ${v.note}`); });
    toast('Follow-up scheduled');
  } });
});
