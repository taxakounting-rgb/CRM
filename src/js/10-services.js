/* ==========================================================================
   10-services.js — Services tracking per client (period, fee, status, filed
   date, acknowledgement no., history) + Monthly Tracker matrix.
   ========================================================================== */
const FILING = { F: ['Done', 'green'], P: ['Pending', 'amber'], O: ['Overdue', 'red'], N: ['Not applicable', 'grey'] };
const Services = {
  open(s, clientId) {
    const isNew = !s;
    formModal({
      title: isNew ? 'Add service' : 'Edit service', size: 'lg',
      fields: [
        { name: 'clientId', label: 'Client', type: 'select', options: clientOpts, required: true },
        { name: 'service', label: 'Service', type: 'select', list: 'services', required: true },
        { name: 'period', label: 'Period', required: true, placeholder: 'e.g. 2026, Q1 2026 or Oct 2026' },
        { name: 'fee', label: `Fee (${curCode()})`, type: 'money', min: 0 },
        { name: 'status', label: 'Status', type: 'select', list: 'serviceStatuses', required: true },
        { name: 'dueDate', label: 'Due date', type: 'date' },
        { name: 'filedDate', label: 'Completed date', type: 'date' },
        { name: 'ackNo', label: 'Reference no.' },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }
      ],
      values: s ? clone(s) : { clientId: clientId || '', status: (Lists.all('serviceStatuses')[0] || {}).id, period: String(new Date().getFullYear()) },
      onSubmit: (v) => {
        if (!Auth.canSeeClient(v.clientId)) return { clientId: 'Choose one of your clients' };
        const c = DB.client(v.clientId);
        if (isNew) {
          const rec = Rec.stamp(Object.assign({ id: uid('sv'), history: [{ at: new Date().toISOString(), by: Auth.user.name, text: `Created · ${Lists.name('serviceStatuses', v.status)}` }] }, v), true);
          Store.commit((s2) => { s2.services.push(rec); Timeline.add(v.clientId, 'service', `Service added: ${Lists.name('services', v.service)} (${v.period})`); });
          Auth.audit('create', 'services', `Service ${Lists.name('services', v.service)} added for ${c.code}`, { recordId: rec.id, new: v });
        } else {
          const d = Auth.diff(s, v); const changes = Object.keys(d.new).map((k) => `${k}: ${k === 'status' ? Lists.name('serviceStatuses', d.new[k]) : d.new[k]}`).join(', ');
          Store.commit(() => { Object.assign(s, v); Rec.stamp(s); s.history = s.history || []; if (changes) s.history.push({ at: new Date().toISOString(), by: Auth.user.name, text: changes }); if (d.new.status) Timeline.add(s.clientId, 'service', `${Lists.name('services', s.service)} → ${Lists.name('serviceStatuses', s.status)}`); });
          Auth.audit('edit', 'services', `Service edited for ${c.code}`, { recordId: s.id, old: d.old, new: d.new });
        }
        toast('Service saved');
      }
    });
  },
  table(rows, key) {
    return dataTable(key, {
      rows, empty: emptyState('No services recorded', 'Add the services you provide to this client.'),
      cols: [
        { key: 'client', label: 'Client', get: (s) => (DB.client(s.clientId) || {}).name, render: (s) => { const c = DB.client(s.clientId); return c ? html`<a href="#/clients/${c.code}">${c.code} · ${c.name}</a>` : '—'; } },
        { key: 'service', label: 'Service', get: (s) => Lists.name('services', s.service), render: (s) => html`<b>${Lists.name('services', s.service)}</b>` },
        { key: 'period', label: 'Period' },
        { key: 'fee', label: 'Fee', get: (s) => Number(s.fee) || 0, render: (s) => money(s.fee), cls: 'num' },
        { key: 'status', label: 'Status', get: (s) => Lists.name('serviceStatuses', s.status), render: (s) => listBadge('serviceStatuses', s.status) },
        { key: 'dueDate', label: 'Due', render: (s) => fmtDate(s.dueDate) },
        { key: 'filedDate', label: 'Completed', render: (s) => fmtDate(s.filedDate) },
        { key: 'ackNo', label: 'Reference', render: (s) => s.ackNo ? html`<code>${s.ackNo}</code>` : '' },
        { key: 'a', label: '', sort: false, cls: 'act', render: (s) => html`<div class="row-acts">${btn('', 'svc:hist', { id: s.id, icon: 'audit', cls: 'icon-btn sm', title: 'History' })}${Auth.can('services', 'edit') ? btn('', 'svc:edit', { id: s.id, icon: 'edit', cls: 'icon-btn sm', title: 'Edit' }) : ''}${Auth.can('services', 'delete') ? btn('', 'svc:del', { id: s.id, icon: 'trash', cls: 'icon-btn sm', title: 'Delete' }) : ''}</div>` }
      ]
    });
  },
  /* Tracker cell status: stored value, else computed Overdue/Pending if client has this service. */
  dueDay() { return Number(Store.s.settings.filingDueDay) || 18; },
  cell(c, svcId, mk) {
    const v = Store.s.filings[`${c.id}|${svcId}|${mk}`];
    if (v) { if (v === 'P' && this.monthDue(mk) < today()) return 'O'; return v; }
    if (c.regDate && mk < monthKey(c.regDate)) return '';
    const has = Store.s.services.some((s) => s.clientId === c.id && s.service === svcId);
    if (!has) return '';
    return this.monthDue(mk) < today() ? 'O' : (mk <= monthKey(today()) ? 'P' : '');
  },
  monthDue(mk) { return addMonths(mk + '-01', 1).slice(0, 8) + pad(this.dueDay(), 2); },
  matrixClients(svcId) {
    const f = vs('services');
    return Auth.clients().filter((c) => textMatch(f.mq, c.name, c.code) && (!f.monly || Store.s.services.some((s) => s.clientId === c.id && s.service === svcId))).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }
};

Views.services = {
  onNew() { if (Auth.can('services', 'create')) Services.open(); },
  render() {
    const f = vs('services', { tab: 'records', monly: true });
    const tabs = [['records', 'Client services'], ['matrix', 'Monthly tracker']];
    let body;
    if (f.tab === 'matrix') body = this.matrix(f);
    else {
      const rows = Auth.byClient(Store.s.services).filter((s) => { const c = DB.client(s.clientId) || {}; return textMatch(f.q, c.name, c.code, s.period, s.ackNo, Lists.name('services', s.service)) && (!f.service || s.service === f.service) && (!f.status || s.status === f.status) && inRange(s.filedDate || s.dueDate, f.from, f.to); });
      const dist = Lists.all('services').map((sv, i) => ({ label: sv.name, value: rows.filter((r) => r.service === sv.id).length, color: SERIES[i % 8] })).filter((d) => d.value);
      body = html`<div class="card filters">${fInput('services.q', 'Search client, period, ack no…')}${fSelect('services.service', 'All services', listOpts('services'))}${fSelect('services.status', 'All statuses', listOpts('serviceStatuses'))}${fDate('services.from', 'Date from')}${fDate('services.to', 'to')}${savedFiltersBar('services')}</div>
        <div class="grid-31"><div class="card p0">${Services.table(rows, 'services')}</div><div class="card"><h3>Active services</h3>${Charts.hbars(dist.sort((a, b) => b.value - a.value), {})}<p class="muted sm mt">Total fees: <b>${money(sum(rows, (r) => r.fee))}</b></p></div></div>`;
    }
    return html`${pageHead('Services', 'Track the services you provide to each client, plus a month-by-month tracker', Auth.can('services', 'create') ? btn('Add service', 'svc:new', { cls: 'primary', icon: 'plus' }) : '')}${tabsBar('services', tabs, f.tab)}${body}`;
  },
  matrix(f) {
    const monthly = Lists.all('services');
    const svcId = f.msvc || (monthly[0] || {}).id;
    const year = Number(f.year) || new Date().getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1, 2)}`);
    const clients = Services.matrixClients(svcId); const st = tstate('fmatrix'); const pages = Math.max(1, Math.ceil(clients.length / st.size)); if (st.page > pages) st.page = pages;
    const slice = clients.slice((st.page - 1) * st.size, st.page * st.size); const canEdit = Auth.can('services', 'edit');
    const counts = { F: 0, P: 0, O: 0, N: 0 }; slice.forEach((c) => months.forEach((mk) => { const v = Services.cell(c, svcId, mk); if (counts[v] !== undefined) counts[v]++; }));
    return html`<div class="card filters"><select class="inp" data-vs="services.msvc" aria-label="Service">${monthly.map((s) => html`<option value="${s.id}" ${s.id === svcId ? raw('selected') : ''}>${s.name}</option>`)}</select>
      <select class="inp" data-vs="services.year" aria-label="Year">${[year - 2, year - 1, year, year + 1].map((y) => html`<option ${y === year ? raw('selected') : ''}>${y}</option>`)}</select>${fInput('services.mq', 'Filter clients…')}<label class="chk"><input type="checkbox" data-vs="services.monly" ${f.monly ? raw('checked') : ''}> <span>Only clients with this service</span></label>
      <span class="grow"></span><div class="legend-row">${Object.entries(FILING).map(([k, [l, t]]) => html`<span>${badge(l, t)} ${counts[k]}</span>`)}</div></div>
      <div class="card p0"><div class="tbl-wrap"><table class="tbl matrix"><thead><tr><th class="sticky">Client</th>${months.map((mk) => html`<th class="center">${MONTHS[+mk.slice(5) - 1]}<br><small class="muted">due ${pad(Services.dueDay(), 2)}/${pad(+mk.slice(5) % 12 + 1, 2)}</small></th>`)}</tr></thead>
      <tbody>${slice.map((c) => html`<tr><td class="sticky"><a href="#/clients/${c.code}">${c.code}</a> ${c.name}</td>${months.map((mk) => { const v = Services.cell(c, svcId, mk); return html`<td class="center"><button type="button" class="fcell f-${v || 'x'}" ${canEdit ? raw(`data-act="filing:cycle" data-c="${esc(c.id)}" data-s="${esc(svcId)}" data-m="${mk}"`) : raw('disabled')} title="${FILING[v] ? FILING[v][0] : 'Not tracked'} — click to change" aria-label="${c.name} ${mk}: ${FILING[v] ? FILING[v][0] : 'Not tracked'}">${v ? FILING[v][0][0] : '·'}</button></td>`; })}</tr>`)}</tbody></table></div>
      ${clients.length ? '' : emptyState('No clients to show', 'Add this service to clients or untick "Only clients with this service".')}
      <div class="pager"><span class="muted">${clients.length} clients</span><span class="grow"></span><button type="button" class="btn sm ghost" data-act="tbl:page" data-key="fmatrix" data-p="${st.page - 1}" ${st.page <= 1 ? raw('disabled') : ''}>‹ Prev</button><span class="sm">Page ${st.page} / ${pages}</span><button type="button" class="btn sm ghost" data-act="tbl:page" data-key="fmatrix" data-p="${st.page + 1}" ${st.page >= pages ? raw('disabled') : ''}>Next ›</button></div></div>
      <p class="help">Click a cell to cycle: Pending → Filed → Not applicable → clear. Pending cells past the due day (${Services.dueDay()}th of the following month, set in Settings) show as Overdue.</p>`;
  }
};
const svcOf = (a) => Store.s.services.find((s) => s.id === a.dataset.id);
act('svc:new', (a) => Services.open(null, a.dataset.client));
act('svc:edit', (a) => Services.open(svcOf(a)));
act('svc:del', async (a) => { const s = svcOf(a); if (await confirmDlg('Delete this service record?', { danger: true, ok: 'Delete' })) Rec.remove('services', s, 'Service record', 'services'); });
act('svc:hist', (a) => { const s = svcOf(a); Modal.open({ title: `History · ${Lists.name('services', s.service)} ${s.period}`, size: 'sm', body: html`<ol class="timeline">${(s.history || []).slice().reverse().map((h) => html`<li><span class="tl-ic">${icon('check')}</span><div><b>${h.text}</b><br><small class="muted">${fmtDateTime(h.at)} · ${h.by}</small></div></li>`)}</ol>` }); });
act('filing:cycle', (a) => {
  const k = `${a.dataset.c}|${a.dataset.s}|${a.dataset.m}`; const cur = Store.s.filings[k] || '';
  const next = { '': 'P', P: 'F', F: 'N', N: '' }[cur];
  Store.commit((s) => { if (next) s.filings[k] = next; else delete s.filings[k]; if (next === 'F') Timeline.add(a.dataset.c, 'service', `${Lists.name('services', a.dataset.s)} done for ${monthLabel(a.dataset.m)}`); });
  Auth.audit('edit', 'services', `Monthly status ${Lists.name('services', a.dataset.s)} ${a.dataset.m} for ${(DB.client(a.dataset.c) || {}).code}: ${next ? FILING[next][0] : 'cleared'}`, { old: { v: cur }, new: { v: next } });
});
