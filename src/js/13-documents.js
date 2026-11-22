/* ==========================================================================
   13-documents.js — Document management. Files are stored in IndexedDB;
   metadata in the store. Drag & drop multi-upload, categories, client/task
   links, preview (images/PDF/text), download, version history + restore,
   expiry dates with reminders, size-limit warning.
   ========================================================================== */
const Docs = {
  cur(d) { return (d.versions || []).find((v) => v.vid === d.current) || (d.versions || [])[d.versions.length - 1] || {}; },
  maxMB() { return Math.min(Number(Store.s.settings.maxUploadMB) || 10, Cloud.maxFileMB()); },
  expiryInfo(d) { if (!d.expiry) return null; const n = daysBetween(today(), d.expiry); return { n, tone: n < 0 ? 'red' : n <= 30 ? 'amber' : 'green', label: n < 0 ? `Expired ${-n}d ago` : n === 0 ? 'Expires today' : `Expires in ${n}d` }; },
  async checkSizes(files) {
    const big = files.filter((f) => f.size > this.maxMB() * 1048576);
    if (big.length && Cloud.avail) { toast(`Cloud storage accepts files up to ${this.maxMB()} MB. Too large: ${big.map((f) => f.name).join(', ')}`, 'warn', { timeout: 7000 }); return false; }
    if (big.length && !(await confirmDlg(html`${big.length} file(s) are larger than the ${this.maxMB()} MB limit:<br><b>${big.map((f) => `${f.name} (${fmtSize(f.size)})`).join(', ')}</b><br><br>Large files use browser storage quickly. Upload anyway?`, { ok: 'Upload anyway' }))) return false;
    return true;
  },
  async saveBlob(vid, file) { try { await Cloud.putBlob(vid, file); } catch (e) { toast('Could not save the file to the cloud: ' + e.message, 'err', { timeout: 7000 }); throw e; } await IDB.put('blobs', vid, file); },
  upload(preset = {}) {
    let files = [];
    Modal.open({
      title: 'Upload documents', size: 'lg',
      body: html`<div class="drop" data-drop-zone tabindex="0" role="button" aria-label="Choose files">${icon('upload')}<p><b>Drag &amp; drop files here</b> or click to choose<br><small class="muted">Multiple files allowed · limit ${this.maxMB()} MB each (warning above)</small></p><input type="file" multiple hidden data-files></div><ul class="file-list" data-list></ul>
        <form class="grid-form" novalidate>${fieldHTML({ name: 'category', label: 'Category', type: 'select', list: 'docCategories', required: true }, preset.category)}${fieldHTML({ name: 'clientId', label: 'Client', type: 'select', options: clientOpts, placeholder: '— No client —' }, preset.clientId)}${fieldHTML({ name: 'taskId', label: 'Task (optional)', type: 'select', options: () => Auth.tasks().filter((t) => !Lists.isDone(t.status) || t.id === preset.taskId).map((t) => ({ value: t.id, label: `${t.code} · ${t.title}` })), placeholder: '— No task —' }, preset.taskId)}${fieldHTML({ name: 'expiry', label: 'Expiry date (optional)', type: 'date' }, '')}${fieldHTML({ name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }, '')}</form><p class="err" data-e></p>`,
      foot: html`<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" data-up disabled>Upload</button>`,
      onMount: (el, m) => {
        const zone = el.querySelector('[data-drop-zone]'); const inp = el.querySelector('[data-files]'); const form = el.querySelector('form'); bindFormExtras(form);
        const draw = () => { el.querySelector('[data-list]').innerHTML = String(html`${files.map((f, i) => html`<li>${icon('documents')} ${f.name} <small class="${f.size > this.maxMB() * 1048576 ? 'late-txt' : 'muted'}">${fmtSize(f.size)}${f.size > this.maxMB() * 1048576 ? ' — over limit' : ''}</small><button type="button" class="icon-btn sm" data-rmf="${i}" aria-label="Remove">${icon('close')}</button></li>`)}`); el.querySelector('[data-up]').disabled = !files.length; };
        const add = (fl) => { files = files.concat(Array.from(fl)); draw(); };
        zone.onclick = () => inp.click(); zone.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
        inp.onchange = () => add(inp.files);
        zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('over'); }; zone.ondragleave = () => zone.classList.remove('over');
        zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('over'); add(e.dataTransfer.files); };
        el.querySelector('[data-list]').onclick = (e) => { const b = e.target.closest('[data-rmf]'); if (b) { files.splice(+b.dataset.rmf, 1); draw(); } };
        el.querySelector('[data-up]').onclick = async () => {
          const meta = { category: form.category.value, clientId: form.clientId.value, taskId: form.taskId.value, expiry: form.expiry.value, notes: form.notes.value.trim() };
          if (!meta.category) { el.querySelector('[data-e]').textContent = 'Choose a category.'; return; }
          if (meta.clientId && !Auth.canSeeClient(meta.clientId)) { el.querySelector('[data-e]').textContent = 'Choose one of your clients.'; return; }
          if (!License.allow('storageMB', sum(files, (x) => x.size) / 1048576)) return;
          if (!(await this.checkSizes(files))) return;
          const b = el.querySelector('[data-up]'); b.disabled = true; b.textContent = 'Uploading…';
          try {
            const recs = [];
            for (const f of files) {
              const vid = uid('v'); await this.saveBlob(vid, f);
              recs.push(Rec.stamp(Object.assign({ id: uid('d'), name: f.name, versions: [{ vid, name: f.name, size: f.size, type: f.type || 'application/octet-stream', at: new Date().toISOString(), by: Auth.user.name, note: 'Original upload' }], current: vid, log: [] }, meta), true));
            }
            Store.commit((s) => recs.forEach((r) => { r.code = Store.next('doc'); s.documents.push(r); if (r.clientId) Timeline.add(r.clientId, 'document', `Document uploaded: ${r.name} (${Lists.name('docCategories', r.category)})`); }));
            Auth.audit('create', 'documents', `Uploaded ${recs.length} document(s): ${recs.map((r) => r.code).join(', ')}`);
            toast(`${recs.length} document(s) uploaded`); m.close();
          } catch (e) { console.warn(e); el.querySelector('[data-e]').textContent = 'Upload failed: ' + (e.message || 'storage error. The browser may be out of space.'); b.disabled = false; b.textContent = 'Upload'; }
        };
      }
    });
  },
  newVersion(d) {
    const inp = document.createElement('input'); inp.type = 'file';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return; if (!License.allow('storageMB', f.size / 1048576)) return; if (!(await this.checkSizes([f]))) return;
      const note = await promptDlg('New version', 'What changed? (optional)', { ok: 'Upload version' }); if (note === null) return;
      const vid = uid('v'); await this.saveBlob(vid, f);
      Store.commit(() => { d.versions.push({ vid, name: f.name, size: f.size, type: f.type || 'application/octet-stream', at: new Date().toISOString(), by: Auth.user.name, note: note || '' }); d.current = vid; d.name = f.name; Rec.stamp(d); if (d.clientId) Timeline.add(d.clientId, 'document', `New version (v${d.versions.length}) of ${d.name}`); });
      Auth.audit('edit', 'documents', `New version v${d.versions.length} for ${d.code}`, { recordId: d.id });
      toast(`Version ${d.versions.length} uploaded`); this.versions(d);
    };
    inp.click();
  },
  versions(d) {
    Modal.closeAll();
    Modal.open({
      title: `Version history · ${d.code}`, size: 'md',
      body: html`<ul class="list">${d.versions.slice().reverse().map((v) => { const i = d.versions.indexOf(v) + 1; const isCur = v.vid === d.current; return html`<li class="row-between ${isCur ? 'cur-ver' : ''}"><span><b>v${i}</b> ${v.name} ${isCur ? badge('Current', 'green') : ''}<br><small class="muted">${fmtDateTime(v.at)} · ${v.by} · ${fmtSize(v.size)}${v.note ? ' · ' + v.note : ''}</small></span><span class="row-acts">${btn('', 'doc:vdl', { id: d.id, icon: 'download', cls: 'icon-btn sm', title: 'Download', extra: `data-v="${esc(v.vid)}"` })}${!isCur && Auth.can('documents', 'edit') ? btn('Restore', 'doc:vrestore', { id: d.id, cls: 'sm ghost', extra: `data-v="${esc(v.vid)}"` }) : ''}</span></li>`; })}</ul>`,
      foot: html`${Auth.can('documents', 'edit') ? btn('Upload new version', 'doc:version', { id: d.id, icon: 'upload', cls: 'primary' }) : ''}<button type="button" class="btn ghost" data-close>Close</button>`
    });
  },
  async blob(d, vid) { const id = vid || d.current; let b = await IDB.get('blobs', id); if (!b) { try { b = await Cloud.getBlob(id); } catch (e) { b = null; } if (b) IDB.put('blobs', id, b).catch(() => {}); } if (!b) throw new Error('File not found in the cloud storage.'); return b; },
  async preview(d) {
    const v = this.cur(d); let url = ''; let b;
    try { b = await this.blob(d); url = URL.createObjectURL(b); } catch (e) { toast(e.message, 'err'); return; }
    const type = v.type || ''; let view;
    if (type.startsWith('image/')) view = html`<img class="pv-img" src="${url}" alt="${d.name}">`;
    else if (type === 'application/pdf') view = html`<iframe class="pv-pdf" src="${url}" title="${d.name}"></iframe>`;
    else if (type.startsWith('text/') || /\.(txt|csv|json)$/i.test(v.name)) view = html`<pre class="pv-txt">${(await b.text()).slice(0, 100000)}</pre>`;
    else view = html`<div class="empty">${icon('documents')}<p>No preview for this file type.</p></div>`;
    const c = DB.client(d.clientId); const ex = this.expiryInfo(d);
    Modal.open({
      title: d.name, size: 'xl', body: html`<div class="pv-meta muted sm">${d.code} · ${Lists.name('docCategories', d.category)}${c ? html` · <a href="#/clients/${c.code}">${c.code} ${c.name}</a>` : ''} · v${d.versions.indexOf(v) + 1} · ${fmtSize(v.size)}${ex ? html` · ${badge(ex.label, ex.tone)}` : ''}</div>${view}`,
      foot: html`${btn('Versions', 'doc:versions', { id: d.id, cls: 'ghost' })}${btn('Download', 'doc:download', { id: d.id, cls: 'primary', icon: 'download' })}`,
      onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000)
    });
  },
  async download(d, vid) {
    try { const b = await this.blob(d, vid); const v = d.versions.find((x) => x.vid === (vid || d.current)) || {}; downloadFile(v.name || d.name, b); Auth.audit('export', 'documents', `Downloaded ${d.code} ${v.name || d.name}`, { recordId: d.id }); }
    catch (e) { toast(e.message, 'err'); }
  },
  edit(d) {
    formModal({
      title: `Edit ${d.code}`, size: 'md',
      fields: [{ name: 'name', label: 'Display name', required: true, full: true }, { name: 'category', label: 'Category', type: 'select', list: 'docCategories', required: true }, { name: 'clientId', label: 'Client', type: 'select', options: clientOpts, placeholder: '— No client —' }, { name: 'taskId', label: 'Task', type: 'select', options: () => Auth.tasks().map((t) => ({ value: t.id, label: `${t.code} · ${t.title}` })), placeholder: '— No task —' }, { name: 'expiry', label: 'Expiry date', type: 'date' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }],
      values: clone(d),
      onSubmit: (v) => { const df = Auth.diff(d, v); Store.commit(() => { Object.assign(d, v); Rec.stamp(d); }); Auth.audit('edit', 'documents', `Edited ${d.code}`, { recordId: d.id, old: df.old, new: df.new }); toast('Document updated'); }
    });
  },
  table(rows, key) {
    return dataTable(key, {
      rows, empty: emptyState('No documents', 'Upload contracts, IDs, certificates, proposals and reports.'),
      cols: [
        { key: 'code', label: 'ID', render: (d) => html`<code>${d.code}</code>` },
        { key: 'name', label: 'Name', render: (d) => html`<a href="#" data-act="doc:preview" data-id="${d.id}" class="strong">${d.name}</a><br><small class="muted">${fmtSize(this.cur(d).size || 0)} · v${d.versions.length}</small>` },
        { key: 'category', label: 'Category', get: (d) => Lists.name('docCategories', d.category), render: (d) => listBadge('docCategories', d.category) },
        { key: 'client', label: 'Client', get: (d) => (DB.client(d.clientId) || {}).name, render: (d) => { const c = DB.client(d.clientId); return c ? html`<a href="#/clients/${c.code}">${c.code} · ${c.name}</a>` : html`<span class="muted">—</span>`; } },
        { key: 'task', label: 'Task', get: (d) => (DB.task(d.taskId) || {}).code, render: (d) => { const t = DB.task(d.taskId); return t ? html`<a href="#/tasks/${t.code}">${t.code}</a>` : ''; } },
        { key: 'expiry', label: 'Expiry', render: (d) => { const e = this.expiryInfo(d); return e ? html`${fmtDate(d.expiry)}<br>${badge(e.label, e.tone)}` : html`<span class="muted">—</span>`; } },
        { key: 'updatedAt', label: 'Updated', render: (d) => html`${fmtDate(d.updatedAt)}<br><small class="muted">${d.createdBy || ''}</small>` },
        { key: 'a', label: '', sort: false, cls: 'act', render: (d) => html`<div class="row-acts">${btn('', 'doc:download', { id: d.id, icon: 'download', cls: 'icon-btn sm', title: 'Download' })}${btn('', 'doc:versions', { id: d.id, icon: 'audit', cls: 'icon-btn sm', title: 'Versions' })}${Auth.can('documents', 'edit') ? btn('', 'doc:edit', { id: d.id, icon: 'edit', cls: 'icon-btn sm', title: 'Edit' }) : ''}${Auth.can('documents', 'delete') ? btn('', 'doc:del', { id: d.id, icon: 'trash', cls: 'icon-btn sm', title: 'Delete' }) : ''}</div>` }
      ]
    });
  }
};

Views.documents = {
  onNew() { if (Auth.can('documents', 'create')) Docs.upload(); },
  render() {
    const f = vs('documents');
    const all = Auth.byClient(Store.s.documents);
    const rows = all.filter((d) => { const c = DB.client(d.clientId) || {}; return textMatch(f.q, d.name, d.code, d.notes, c.name, c.code, Lists.name('docCategories', d.category)) && (!f.cat || d.category === f.cat) && (!f.client || d.clientId === f.client) && (!f.exp || (d.expiry && daysBetween(today(), d.expiry) <= 30)) && inRange(String(d.createdAt).slice(0, 10), f.from, f.to); });
    const expiring = all.filter((d) => d.expiry && daysBetween(today(), d.expiry) <= 30).length;
    const used = sum(all, (d) => sum(d.versions, (v) => v.size));
    return html`${pageHead('Documents', `${all.length} documents · ${fmtSize(used)} stored in this browser`, Auth.can('documents', 'create') ? btn('Upload', 'doc:upload', { cls: 'primary', icon: 'upload' }) : '')}
      ${expiring ? html`<div class="note warn">${expiring} document(s) expire within 30 days or have expired. <a href="#" data-vs-set="documents.exp" data-val="1">Show them</a></div>` : ''}
      ${Auth.can('documents', 'create') ? html`<div class="drop slim" data-page-drop>${icon('upload')} Drop files anywhere here to upload</div>` : ''}
      <div class="card filters">${fInput('documents.q', 'Search name, category, client…')}${fSelect('documents.cat', 'All categories', listOpts('docCategories'))}${fSelect('documents.client', 'All clients', clientOpts())}${fDate('documents.from', 'Uploaded from')}${fDate('documents.to', 'to')}<label class="chk"><input type="checkbox" data-vs="documents.exp" ${f.exp ? raw('checked') : ''}> <span>Expiring ≤ 30 days</span></label>${savedFiltersBar('documents')}</div>
      <div class="card p0">${Docs.table(rows, 'documents')}</div>`;
  },
  mount(root, params, query) {
    const z = root.querySelector('[data-page-drop]');
    if (z) { const main = $('#main'); main.ondragover = (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); z.classList.add('over'); } }; main.ondragleave = () => z.classList.remove('over'); main.ondrop = async (e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); z.classList.remove('over'); Docs.upload(); setTimeout(() => { const zone = $('[data-drop-zone]'); if (zone) zone.dispatchEvent(Object.assign(new Event('drop'), { dataTransfer: e.dataTransfer, preventDefault() {} })); }, 60); }; }
    if (query.doc && !this._opened) { this._opened = query.doc; const d = Store.s.documents.find((x) => x.id === query.doc); if (d) Docs.preview(d); setTimeout(() => { location.hash = '#/documents'; this._opened = null; }, 100); }
  }
};
const docOf = (a) => Store.s.documents.find((d) => d.id === a.dataset.id);
act('doc:upload', (a) => Docs.upload({ clientId: a.dataset.client || '', taskId: a.dataset.task || '' }));
act('doc:preview', (a, e) => { e.preventDefault(); Docs.preview(docOf(a)); });
act('doc:download', (a) => Docs.download(docOf(a)));
act('doc:versions', (a) => Docs.versions(docOf(a)));
act('doc:version', (a) => Docs.newVersion(docOf(a)));
act('doc:vdl', (a) => Docs.download(docOf(a), a.dataset.v));
act('doc:vrestore', async (a) => {
  const d = docOf(a); const v = d.versions.find((x) => x.vid === a.dataset.v); const n = d.versions.indexOf(v) + 1;
  if (!(await confirmDlg(`Restore version ${n} (${v.name}) as the current version? Newer versions are kept in history.`, { ok: 'Restore' }))) return;
  Store.commit(() => { d.current = v.vid; d.name = v.name; Rec.stamp(d); d.log = d.log || []; d.log.push({ at: new Date().toISOString(), by: Auth.user.name, text: `Restored v${n}` }); if (d.clientId) Timeline.add(d.clientId, 'document', `Version v${n} of ${d.name} restored`); });
  Auth.audit('edit', 'documents', `Restored ${d.code} to v${n}`, { recordId: d.id });
  toast(`Version ${n} restored`); Docs.versions(d);
});
act('doc:edit', (a) => Docs.edit(docOf(a)));
act('doc:del', async (a) => {
  const d = docOf(a); if (!(await confirmDlg(`Delete ${d.code} "${d.name}" and all its versions?`, { danger: true, ok: 'Delete' }))) return;
  Rec.remove('documents', d, `Document ${d.code}`, 'documents', () => setTimeout(() => { if (!Store.s.documents.includes(d)) d.versions.forEach((v) => { IDB.del('blobs', v.vid).catch(() => {}); Cloud.delBlob(v.vid).catch(() => {}); }); }, 7000));
});
