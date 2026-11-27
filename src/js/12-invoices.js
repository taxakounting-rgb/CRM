/* ==========================================================================
   12-invoices.js — Invoices (line items, discount, tax %, auto number),
   partial payments & receipts, client ledger/statement, aging, expenses,
   net profit. Printable invoice with logo via window.print().
   ========================================================================== */
const Invoices = {
  clientLabel(id) { const c = DB.client(id); return c ? `${c.code} · ${c.name}` : ''; },
  /* Searchable client box: filters while typing (name, code, phone, email, company). */
  bindClientPicker(box, form) {
    const q = box.querySelector('[data-cq]'); const hid = box.querySelector('[name=clientId]'); const list = box.querySelector('[data-clist]');
    let items = []; let idx = 0;
    const find = (t) => {
      const w = String(t || '').toLowerCase().split(/\s+/).filter(Boolean);
      return Auth.clients().filter((c) => { const hay = [c.name, c.code, c.mobile, c.whatsapp, c.email, c.businessName, c.father].join(' ').toLowerCase(); return w.every((x) => hay.includes(x)); }).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
    };
    const draw = () => {
      if (!items.length) { list.innerHTML = String(html`<div class="cpick-empty">${q.value.trim() ? 'No client found' : 'No clients yet'}</div>`); list.hidden = false; return; }
      list.innerHTML = items.map((c, i) => String(html`<div class="cpick-it ${i === idx ? 'on' : ''}" role="option" data-i="${i}"><b>${c.name}</b><small class="muted"> ${c.code}${c.mobile ? ' · ' + c.mobile : ''}${c.businessName ? ' · ' + c.businessName : ''}</small></div>`)).join(''); list.hidden = false;
      const on = list.querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    };
    const pick = (c) => { hid.value = c.id; q.value = `${c.code} · ${c.name}`; list.hidden = true; const e = form.querySelector('[data-e]'); if (e) e.textContent = ''; };
    const open = () => { items = find(hid.value && q.value === Invoices.clientLabel(hid.value) ? '' : q.value); idx = 0; draw(); };
    q.addEventListener('focus', () => { if (hid.value) q.select(); open(); });
    q.addEventListener('input', () => { hid.value = ''; open(); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (!list.hidden && items[idx]) { pick(items[idx]); } e.preventDefault(); }
      else if (e.key === 'Escape' && !list.hidden) { list.hidden = true; e.stopPropagation(); }
    });
    list.addEventListener('mousedown', (e) => { const it = e.target.closest('.cpick-it'); if (it) { e.preventDefault(); pick(items[+it.dataset.i]); } });
    q.addEventListener('blur', () => { setTimeout(() => { list.hidden = true; if (!hid.value) q.value = ''; else q.value = Invoices.clientLabel(hid.value); }, 120); });
  },
  open(inv, preset = {}) {
    const isNew = !inv;
    const defaultTc = ((Store.s.settings.tcTemplates || []).find(t => t.isDefault) || {}).id || '';
    const v = inv ? clone(inv) : Object.assign({ date: today(), due: addDays(today(), Number(Store.s.settings.invoiceDueDays) || 15), items: [{ desc: '', service: '', qty: 1, rate: 0 }], discount: 0, taxPct: Number(Store.s.settings.defaultTaxPct) || 0, notes: '', status: 'Draft', tcTemplateId: defaultTc }, preset);
    const svcFee = (id) => { const s = Lists.get('services', id); return s && s.fee ? Number(s.fee) : 0; };
    const row = (it, i) => html`<tr data-i="${i}"><td><select class="inp sm" data-k="service" aria-label="Service"><option value="">— Service —</option>${Lists.options('services', it.service)}</select><input class="inp sm" data-k="desc" value="${it.desc}" placeholder="Description" aria-label="Description"></td><td><input class="inp sm num" type="number" min="0" step="any" data-k="qty" value="${it.qty}" aria-label="Quantity"></td><td><input class="inp sm num" type="number" min="0" step="any" data-k="rate" value="${it.rate}" aria-label="Rate"></td><td class="num" data-amt>${money(it.qty * it.rate)}</td><td><button type="button" class="icon-btn sm" data-rm aria-label="Remove line">${icon('close')}</button></td></tr>`;
    Modal.open({
      title: isNew ? 'New invoice' : `Edit ${inv.number}`, size: 'xl',
      body: html`<form class="grid-form" data-inv novalidate>
        <div class="fld full cpick-fld"><span>Client<b class="req">*</b></span>
          <div class="cpick" data-cpick>
            <input class="inp" data-cq type="search" autocomplete="off" placeholder="Type to search client by name, code, phone, company…" aria-label="Search client" value="${v.clientId ? Invoices.clientLabel(v.clientId) : ''}">
            <input type="hidden" name="clientId" value="${v.clientId || ''}">
            <div class="cpick-list" data-clist role="listbox" hidden></div>
          </div></div>
        ${fieldHTML({ name: 'date', label: 'Invoice date', type: 'date', required: true }, v.date)}
        ${fieldHTML({ name: 'due', label: 'Due date', type: 'date', required: true }, v.due)}
        ${fieldHTML({ name: 'status', label: 'Status', type: 'select', options: [{ value: 'Draft', label: 'Draft' }, { value: 'Sent', label: 'Sent / Issued' }, { value: 'Cancelled', label: 'Cancelled' }], required: true }, v.status === 'Cancelled' || v.status === 'Draft' ? v.status : 'Sent')}
        <div class="full"><table class="tbl lines"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate (${curCode()})</th><th class="num">Amount</th><th></th></tr></thead><tbody data-lines>${v.items.map(row)}</tbody></table><button type="button" class="btn sm ghost" data-add>${icon('plus')}<span>Add line</span></button></div>
        ${fieldHTML({ name: 'discount', label: `Discount (${curCode()})`, type: 'money', min: 0 }, v.discount)}
        ${fieldHTML({ name: 'taxPct', label: 'Tax %', type: 'number', min: 0, step: '0.01' }, v.taxPct)}
        ${fieldHTML({ name: 'notes', label: 'Notes on invoice', type: 'textarea', full: true, rows: 2 }, v.notes)}
        <div class="full"><label class="fld"><span>Terms & Conditions</span><select name="tcTemplateId" data-tc>
          <option value="">— None —</option>
          ${(Store.s.settings.tcTemplates || []).map(t => html`<option value="${t.id}" ${t.id === v.tcTemplateId ? raw('selected') : ''}>${t.name}${t.isDefault ? ' (Default)' : ''}</option>`)}
        </select></label><div class="tc-preview muted sm" data-tc-preview>${(Store.s.settings.tcTemplates || []).find(t => t.id === v.tcTemplateId) ? html`<pre style="white-space:pre-wrap;font-size:0.8em;max-height:80px;overflow:auto">${(Store.s.settings.tcTemplates || []).find(t => t.id === v.tcTemplateId).text}</pre>` : ''}</div></div>
        <div class="full totals" data-totals></div><p class="err full" data-e></p></form>`,
      foot: html`<button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn primary" data-save>Save invoice</button>`,
      onMount: (el, m) => {
        const form = el.querySelector('[data-inv]'); const tb = el.querySelector('[data-lines]');
        Invoices.bindClientPicker(el.querySelector('[data-cpick]'), form);
        const read = () => $$('tr', tb).map((tr) => ({ service: $('[data-k=service]', tr).value, desc: $('[data-k=desc]', tr).value.trim(), qty: Number($('[data-k=qty]', tr).value) || 0, rate: Number($('[data-k=rate]', tr).value) || 0 }));
        const recalc = () => {
          const items = read(); $$('tr', tb).forEach((tr, i) => { $('[data-amt]', tr).textContent = money(items[i].qty * items[i].rate); });
          const t = DB.invTotal({ items, discount: form.discount.value, taxPct: form.taxPct.value });
          el.querySelector('[data-totals]').innerHTML = String(html`<div>Subtotal <b>${money(t.sub)}</b></div><div>Discount <b>− ${money(t.disc)}</b></div><div>Tax <b>${money(t.tax)}</b></div><div class="grand">Total <b>${money(t.total)}</b></div>`);
        };
        tb.addEventListener('input', recalc);
        tb.addEventListener('change', (e) => { if (e.target.dataset.k === 'service') { const tr = e.target.closest('tr'); const d = $('[data-k=desc]', tr); if (!d.value) d.value = Lists.name('services', e.target.value); const r = $('[data-k=rate]', tr); if (!Number(r.value)) r.value = svcFee(e.target.value); recalc(); } });
        tb.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) { if ($$('tr', tb).length > 1) e.target.closest('tr').remove(); recalc(); } });
        el.querySelector('[data-add]').onclick = () => { tb.insertAdjacentHTML('beforeend', String(row({ desc: '', service: '', qty: 1, rate: 0 }, $$('tr', tb).length))); };
        form.addEventListener('input', recalc); recalc(); bindFormExtras(form);
        // TC preview
        const tcSel = el.querySelector('[data-tc]'); const tcPrev = el.querySelector('[data-tc-preview]');
        if (tcSel && tcPrev) tcSel.addEventListener('change', () => {
          const tcs = Store.s.settings.tcTemplates || [];
          const t = tcs.find(x => x.id === tcSel.value);
          tcPrev.innerHTML = t ? `<pre style="white-space:pre-wrap;font-size:0.8em;max-height:80px;overflow:auto">${String(t.text).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre>` : '';
        });
        el.querySelector('[data-save]').onclick = () => {
          const items = read().filter((i) => i.desc || i.service || i.rate);
          const vals = { clientId: form.clientId.value, date: form.date.value, due: form.due.value, status: form.status.value, discount: Number(form.discount.value) || 0, taxPct: Number(form.taxPct.value) || 0, notes: form.notes.value.trim(), tcTemplateId: (el.querySelector('[data-tc]') || {}).value || '', items: items.map((i) => Object.assign(i, { desc: i.desc || Lists.name('services', i.service) })) };
          const err = !vals.clientId ? 'Choose a client.' : !items.length ? 'Add at least one line item.' : vals.due < vals.date ? 'Due date is before the invoice date.' : !Auth.canSeeClient(vals.clientId) ? 'Choose one of your clients.' : '';
          if (err) { el.querySelector('[data-e]').textContent = err; return; }
          const c = DB.client(vals.clientId);
          if (isNew) {
            const rec = Rec.stamp(Object.assign({ id: uid('i') }, vals), true);
            Store.commit((s) => { rec.number = Store.next('inv'); s.invoices.push(rec); Timeline.add(vals.clientId, 'invoice', `Invoice ${rec.number} created — ${money(DB.invTotal(rec).total)}`); });
            Auth.audit('create', 'invoices', `Invoice ${rec.number} for ${c.code} — ${money(DB.invTotal(rec).total)}`, { recordId: rec.id });
            toast(`${rec.number} saved`); m.close(); location.hash = '#/invoices/' + rec.number;
          } else {
            const old = { total: DB.invTotal(inv).total, status: inv.status, due: inv.due };
            Store.commit(() => { Object.assign(inv, vals); Rec.stamp(inv); });
            Auth.audit('edit', 'invoices', `Invoice ${inv.number} edited`, { recordId: inv.id, old, new: { total: DB.invTotal(inv).total, status: inv.status, due: inv.due } });
            toast('Invoice updated'); m.close();
          }
        };
      }
    });
  },
  /* Plain-text version of the invoice for e-mail bodies. */
  emailText(inv) {
    const c = DB.client(inv.clientId) || {}; const t = DB.invTotal(inv); const paid = DB.invPaid(inv); const co = Store.s.settings.company || {};
    const L = [`Dear ${c.name || 'Customer'},`, '', `Please find the details of your invoice ${inv.number} below.`, '', `Invoice No: ${inv.number}`, `Invoice Date: ${fmtDate(inv.date)}`, `Due Date: ${fmtDate(inv.due)}`, '', 'Items:'];
    inv.items.forEach((it, i) => L.push(`${i + 1}. ${it.desc} — ${it.qty} x ${money(it.rate)} = ${money(it.qty * it.rate)}`));
    L.push('', `Subtotal: ${money(t.sub)}`);
    if (t.disc) L.push(`Discount: -${money(t.disc)}`);
    if (inv.taxPct) L.push(`Tax (${inv.taxPct}%): ${money(t.tax)}`);
    L.push(`TOTAL: ${money(t.total)}`);
    if (paid > 0) L.push(`Paid: ${money(paid)}`, `Remaining: ${money(Math.max(0, t.total - paid))}`);
    if (co.bank) L.push('', 'Payment details:', co.bank);
    if (inv.notes) L.push('', 'Notes:', inv.notes);
    L.push('', 'Thank you for your business.', '', 'Regards,', co.name || '', [co.phone, co.website].filter(Boolean).join(' | '));
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  },
  /* E-mail composer: opens the default mail app, Gmail, or copies the text. */
  email(inv) {
    const c = DB.client(inv.clientId) || {}; const co = Store.s.settings.company || {};
    const subj = `Invoice ${inv.number} from ${co.name || 'us'}`;
    Modal.open({
      title: `Send invoice ${inv.number} by email`, size: 'md',
      body: html`<p class="muted sm">Client: <b>${c.name || ''}</b> · ${c.code || ''}</p>
        <label class="fld"><span>To<b class="req">*</b></span><input data-to type="email" value="${c.email || ''}" placeholder="client@email.com" autocomplete="off"></label>
        <label class="fld"><span>Subject</span><input data-subj value="${subj}"></label>
        <label class="fld"><span>Message</span><textarea rows="12" data-body>${Invoices.emailText(inv)}</textarea></label>
        ${inv.status === 'Draft' ? html`<label class="chk"><input type="checkbox" data-mark checked> <span>Mark invoice as Sent</span></label>` : ''}
        <p class="help">Email apps cannot attach files automatically. To attach the PDF: click <b>Print / PDF</b>, choose “Save as PDF”, then attach it to the email.</p><p class="err" data-e></p>`,
      foot: html`<button type="button" class="btn ghost" data-pdf>${icon('print')}<span>Print / PDF</span></button><span class="grow"></span><button type="button" class="btn ghost" data-copy>${icon('copy')}<span>Copy</span></button><button type="button" class="btn ghost" data-gmail>Gmail</button><button type="button" class="btn primary" data-send>${icon('mail')}<span>Open email app</span></button>`,
      onMount: (el, m) => {
        const f = () => ({ to: el.querySelector('[data-to]').value.trim(), subj: el.querySelector('[data-subj]').value, body: el.querySelector('[data-body]').value });
        const check = () => { const v = f(); if (!v.to) { el.querySelector('[data-e]').textContent = 'Enter the client email address.'; return null; } if (Valid.email(v.to)) { el.querySelector('[data-e]').textContent = Valid.email(v.to); return null; } el.querySelector('[data-e]').textContent = ''; return v; };
        const done = (how) => {
          const mk = el.querySelector('[data-mark]');
          Store.commit(() => { if (mk && mk.checked && inv.status === 'Draft') inv.status = 'Sent'; Timeline.add(inv.clientId, 'invoice', `Invoice ${inv.number} emailed to ${f().to}`); });
          Auth.audit('export', 'invoices', `Invoice ${inv.number} emailed (${how}) to ${f().to}`, { recordId: inv.id });
        };
        el.querySelector('[data-send]').onclick = () => { const v = check(); if (!v) return; location.href = 'mailto:' + encodeURIComponent(v.to) + '?subject=' + encodeURIComponent(v.subj) + '&body=' + encodeURIComponent(v.body); done('mail app'); m.close(); };
        el.querySelector('[data-gmail]').onclick = () => { const v = check(); if (!v) return; window.open('https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(v.to) + '&su=' + encodeURIComponent(v.subj) + '&body=' + encodeURIComponent(v.body), '_blank', 'noopener'); done('gmail'); m.close(); };
        el.querySelector('[data-copy]').onclick = async () => { const v = f(); try { await navigator.clipboard.writeText(v.body); } catch (e) { const t = el.querySelector('[data-body]'); t.select(); document.execCommand('copy'); } toast('Message copied', 'info'); };
        el.querySelector('[data-pdf]').onclick = () => { m.close(); setTimeout(() => Invoices.printInvoice(inv), 250); };
      }
    });
  },
  pay(inv) {
    const bal = DB.invBalance(inv);
    formModal({
      title: `Record payment · ${inv.number}`, size: 'md', submit: 'Save payment',
      intro: html`<p>Invoice total <b>${money(DB.invTotal(inv).total)}</b> · paid <b>${money(DB.invPaid(inv))}</b></p>`,
      fields: [{ name: 'amount', label: `Amount (${curCode()})`, type: 'money', required: true, min: 1, validate: (v) => v > bal ? `Amount is more than the unpaid amount (${money(bal)})` : '' }, { name: 'date', label: 'Payment date', type: 'date', required: true }, { name: 'method', label: 'Method', type: 'select', list: 'paymentMethods', required: true }, { name: 'accountId', label: 'Deposit to', type: 'select', options: () => Accounts.opts(), required: true, placeholder: '— Cash in Hand or bank account —', help: 'The received amount is added to this account balance.' }, { name: 'ref', label: 'Reference / transaction ID' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }],
      values: { amount: bal, date: today(), method: (Lists.all('paymentMethods')[0] || {}).id, accountId: Accounts.CASH },
      onSubmit: (v) => {
        const p = Rec.stamp(Object.assign({ id: uid('p'), invoiceId: inv.id, clientId: inv.clientId }, v), true);
        Store.commit((s) => { p.number = Store.next('rcpt'); if (inv.status === 'Draft') inv.status = 'Sent'; s.payments.push(p); Timeline.add(inv.clientId, 'payment', `Payment ${money(v.amount)} received for ${inv.number} (${Lists.name('paymentMethods', v.method)}) into ${Accounts.name(v.accountId)}${DB.invBalance(inv) === 0 ? ' — invoice paid' : ''}`); });
        Auth.audit('create', 'invoices', `Payment ${p.number} ${money(v.amount)} for ${inv.number} deposited to ${Accounts.name(v.accountId)}`, { recordId: inv.id, new: v });
        toast((DB.invBalance(inv) === 0 ? `${inv.number} is now fully paid` : 'Partial payment recorded') + ` · added to ${Accounts.name(v.accountId)}`);
      }
    });
    setTimeout(() => Accounts.linkMethod(), 0);
  },
  table(rows, key) {
    return dataTable(key, {
      rows, empty: emptyState('No invoices', 'Create an invoice to start billing.'),
      rowCls: (i) => DB.invStatus(i) === 'Overdue' ? 'row-late' : '',
      cols: [
        { key: 'number', label: 'Invoice', render: (i) => html`<a class="code" href="#/invoices/${i.number}">${i.number}</a>` },
        { key: 'client', label: 'Client', get: (i) => (DB.client(i.clientId) || {}).name, render: (i) => { const c = DB.client(i.clientId); return c ? html`<a href="#/clients/${c.code}">${c.name}</a><br><small class="code">${c.code}</small>` : '—'; } },
        { key: 'date', label: 'Date', render: (i) => fmtDate(i.date) },
        { key: 'due', label: 'Due', render: (i) => fmtDate(i.due) },
        { key: 'total', label: 'Total', cls: 'num', get: (i) => DB.invTotal(i).total, render: (i) => money(DB.invTotal(i).total) },
        { key: 'paid', label: 'Paid', cls: 'num', get: (i) => DB.invPaid(i), render: (i) => money(DB.invPaid(i)) },
        { key: 'status', label: 'Status', get: (i) => DB.invStatus(i), render: (i) => badge(DB.invStatus(i), statusTone(DB.invStatus(i))) },
        { key: 'a', label: '', sort: false, cls: 'act', render: (i) => html`<div class="row-acts">${Auth.can('invoices', 'edit') && DB.invBalance(i) > 0 && DB.invStatus(i) !== 'Cancelled' ? btn('', 'inv:pay', { id: i.id, icon: 'invoices', cls: 'icon-btn sm', title: 'Record payment' }) : ''}${btn('', 'inv:email', { id: i.id, icon: 'mail', cls: 'icon-btn sm', title: 'Email invoice' })}${btn('', 'inv:print', { id: i.id, icon: 'print', cls: 'icon-btn sm', title: 'Print' })}</div>` }
      ]
    });
  },
  payTable(rows, key) {
    return dataTable(key, {
      rows, empty: emptyState('No payments yet'),
      cols: [
        { key: 'number', label: 'Receipt', render: (p) => html`<code>${p.number}</code>` }, { key: 'date', label: 'Date', render: (p) => fmtDate(p.date) },
        { key: 'inv', label: 'Invoice', get: (p) => (DB.invoice(p.invoiceId) || {}).number, render: (p) => { const i = DB.invoice(p.invoiceId); return i ? html`<a href="#/invoices/${i.number}">${i.number}</a>` : '—'; } },
        { key: 'client', label: 'Client', get: (p) => (DB.client(p.clientId) || {}).name, render: (p) => (DB.client(p.clientId) || {}).name || '—' },
        { key: 'method', label: 'Method', get: (p) => Lists.name('paymentMethods', p.method), render: (p) => Lists.name('paymentMethods', p.method) },
        { key: 'acc', label: 'Deposited to', get: (p) => Accounts.name(p.accountId), render: (p) => p.accountId ? Accounts.name(p.accountId) : html`<span class="muted">—</span>` }, { key: 'ref', label: 'Reference' }, { key: 'amount', label: 'Amount', cls: 'num', get: (p) => Number(p.amount), render: (p) => html`<b>${money(p.amount)}</b>` },
        { key: 'a', label: '', sort: false, cls: 'act', render: (p) => html`<div class="row-acts">${Auth.can('invoices', 'edit') ? btn('', 'pay:acc', { id: p.id, icon: 'edit', cls: 'icon-btn sm', title: 'Change deposit account' }) : ''}${btn('', 'pay:receipt', { id: p.id, icon: 'print', cls: 'icon-btn sm', title: 'Print receipt' })}${Auth.can('invoices', 'delete') ? btn('', 'pay:del', { id: p.id, icon: 'trash', cls: 'icon-btn sm', title: 'Delete payment' }) : ''}</div>` }
      ]
    });
  },
  aging(invs) {
    const out = {};
    invs.forEach((i) => {
      const st = DB.invStatus(i); if (st === 'Draft' || st === 'Cancelled') return; const b = DB.invBalance(i); if (b <= 0) return;
      const d = daysBetween(i.due, today()); const k = d <= 0 ? 'cur' : d <= 30 ? 'a' : d <= 60 ? 'b' : 'c';
      const r = out[i.clientId] = out[i.clientId] || { clientId: i.clientId, id: i.clientId, cur: 0, a: 0, b: 0, c: 0, total: 0 };
      r[k] += b; r.total += b;
    });
    return Object.values(out);
  },
  printInvoice(inv) {
    const c = DB.client(inv.clientId) || {}; const t = DB.invTotal(inv); const paid = DB.invPaid(inv); const co = Store.s.settings.company || {};
    const pays = Store.s.payments.filter((p) => p.invoiceId === inv.id);
    const tcs = Store.s.settings.tcTemplates || [];
    const tcTpl = inv.tcTemplateId ? tcs.find(x => x.id === inv.tcTemplateId) : tcs.find(x => x.isDefault);
    const tcText = tcTpl ? tcTpl.text : co.terms;
    const balance = Math.max(0, t.total - paid);
    const st = DB.invStatus(inv);
    printHTML(inv.number, html`<div class="invoice-print">
      ${printHeader('INVOICE')}
      <div class="inv-meta">
        <div class="inv-bill-to">
          <div class="inv-label">BILL TO</div>
          <div class="inv-client-name">${c.name || ''}</div>
          ${c.businessName ? html`<div>${c.businessName}</div>` : ''}
          ${c.address ? html`<div class="inv-addr">${c.address}</div>` : ''}
          ${c.mobile ? html`<div>${c.mobile}</div>` : ''}
          ${c.ntn ? html`<div>Tax No: ${c.ntn}</div>` : ''}
          ${c.cnic ? html`<div>ID: ${c.cnic}</div>` : ''}
        </div>
        <div class="inv-details-box">
          <table class="inv-detail-t">
            <tr><td>Invoice No.</td><td><b>${inv.number}</b></td></tr>
            <tr><td>Customer Code</td><td>${c.code || ''}</td></tr>
            <tr><td>Invoice Date</td><td>${fmtDate(inv.date)}</td></tr>
            <tr><td>Due Date</td><td><b>${fmtDate(inv.due)}</b></td></tr>
            <tr><td>Status</td><td><b>${st}</b></td></tr>
          </table>
        </div>
      </div>

      <table class="ptbl inv-items">
        <thead><tr><th style="width:40px">#</th><th>Description</th><th class="num" style="width:70px">Qty</th><th class="num" style="width:100px">Rate</th><th class="num" style="width:110px">Amount</th></tr></thead>
        <tbody>${inv.items.map((it, i) => html`<tr><td>${i + 1}</td><td>${it.desc}${it.service && Lists.name('services', it.service) !== it.desc ? html`<br><small style="color:#888">${Lists.name('services', it.service)}</small>` : ''}</td><td class="num">${it.qty}</td><td class="num">${money(it.rate)}</td><td class="num"><b>${money(it.qty * it.rate)}</b></td></tr>`)}</tbody>
      </table>

      <div class="inv-bottom">
        ${inv.notes ? html`<div class="inv-notes-box"><b>Notes</b><br>${inv.notes}</div>` : html`<div></div>`}
        <table class="ptot inv-totals">
          <tr><td>Subtotal</td><td>${money(t.sub)}</td></tr>
          ${t.disc ? html`<tr><td>Discount</td><td class="disc">− ${money(t.disc)}</td></tr>` : ''}
          ${inv.taxPct ? html`<tr><td>Tax (${inv.taxPct}%)</td><td>${money(t.tax)}</td></tr>` : ''}
          <tr class="g total-row"><td>TOTAL</td><td>${money(t.total)}</td></tr>
          ${paid > 0 ? html`<tr><td>Paid</td><td>${money(paid)}</td></tr>` : ''}
          ${balance === 0 ? html`<tr class="g paid-row"><td colspan="2" style="text-align:center;color:#16a34a">✓ PAID IN FULL</td></tr>` : ''}
        </table>
      </div>

      ${pays.length ? html`<div class="inv-payments"><b>Payments Received</b><table class="ptbl"><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Reference</th><th class="num">Amount</th></tr>${pays.map((p) => html`<tr><td>${p.number}</td><td>${fmtDate(p.date)}</td><td>${Lists.name('paymentMethods', p.method)}</td><td>${p.ref || '—'}</td><td class="num">${money(p.amount)}</td></tr>`)}</table></div>` : ''}

      ${co.bank ? html`<div class="p-terms"><b>Bank / Payment Details</b><br><span style="white-space:pre-line">${co.bank}</span></div>` : ''}
      ${tcText ? html`<div class="p-terms"><b>Terms &amp; Conditions${tcTpl && tcTpl.name ? ` — ${tcTpl.name}` : ''}</b><br><span style="white-space:pre-line">${tcText}</span></div>` : ''}

      <div class="p-foot">${co.invoiceFooter || ''}<br>${printFooter()}</div>
    </div>`);
    Auth.audit('export', 'invoices', `Printed invoice ${inv.number}`, { recordId: inv.id });
  },
  statement(c) {
    const invs = Store.s.invoices.filter((i) => i.clientId === c.id && i.status !== 'Draft' && i.status !== 'Cancelled');
    const pays = Store.s.payments.filter((p) => p.clientId === c.id);
    const rows = [...invs.map((i) => ({ date: i.date, ref: i.number, desc: 'Invoice', dr: DB.invTotal(i).total, cr: 0 })), ...pays.map((p) => ({ date: p.date, ref: p.number, desc: `Payment (${Lists.name('paymentMethods', p.method)}) — ${(DB.invoice(p.invoiceId) || {}).number || ''}`, dr: 0, cr: Number(p.amount) }))].sort((a, b) => (a.date > b.date ? 1 : -1));
    let bal = 0; rows.forEach((r) => { bal += r.dr - r.cr; r.bal = bal; });
    return { rows, bal };
  }
};

Views.invoices = {
  onNew() { if (Auth.can('invoices', 'create')) Invoices.open(); },
  render(params) {
    if (params[0]) return this.detail(params[0]);
    const f = vs('invoices', { tab: 'invoices' });
    const invs = Auth.byClient(Store.s.invoices); const pays = Auth.byClient(Store.s.payments);
    const mk = monthKey(today());
    const k = { billed: sum(invs.filter((i) => monthKey(i.date) === mk && !['Draft', 'Cancelled'].includes(i.status)), (i) => DB.invTotal(i).total), received: sum(pays.filter((p) => monthKey(p.date) === mk), (p) => p.amount), outstanding: sum(invs.filter((i) => !['Draft', 'Cancelled'].includes(DB.invStatus(i))), (i) => DB.invBalance(i)), overdue: invs.filter((i) => DB.invStatus(i) === 'Overdue').length };
    const tabs = [['invoices', 'Invoices', invs.length], ['payments', 'Payments', pays.length], ['aging', 'Receivables aging'], ['ledger', 'Client ledger']];
    if (!Auth.assignedOnly() && License.has('expenses')) tabs.push(['expenses', 'Expenses'], ['profit', 'Revenue & profit']);
    if (!Auth.assignedOnly()) tabs.splice(2, 0, ['accounts', 'Accounts']);
    if ((f.tab === 'expenses' || f.tab === 'profit') && !License.has('expenses')) f.tab = 'invoices';
    let body = '';
    if (f.tab === 'payments') {
      const rows = pays.filter((p) => { const c = DB.client(p.clientId) || {}; return textMatch(f.q, c.name, c.code, p.number, p.ref) && (!f.method || p.method === f.method) && inRange(p.date, f.from, f.to); });
      body = html`<div class="card filters">${fInput('invoices.q', 'Search client, receipt, reference…')}${fSelect('invoices.method', 'All methods', listOpts('paymentMethods'))}${fDate('invoices.from', 'From')}${fDate('invoices.to', 'To')}<span class="grow"></span><b>Total ${money(sum(rows, (p) => p.amount))}</b></div><div class="card p0">${Invoices.payTable(rows, 'payments')}</div>`;
    } else if (f.tab === 'accounts' && !Auth.assignedOnly()) {
      body = Accounts.render();
    } else if (f.tab === 'aging') {
      const rows = Invoices.aging(invs); const T = (k2) => sum(rows, (r) => r[k2]);
      body = html`<div class="kpis sm4">${[['Not yet due', 'cur', 'blue'], ['0–30 days', 'a', 'amber'], ['31–60 days', 'b', 'amber'], ['60+ days', 'c', 'red']].map(([l, k2]) => html`<div class="kpi"><small>${l}</small><b>${money(T(k2))}</b></div>`)}</div>
        <div class="card p0">${dataTable('aging', { rows, empty: emptyState('No outstanding receivables', 'All invoices are paid.'), cols: [
          { key: 'c', label: 'Client', get: (r) => (DB.client(r.clientId) || {}).name, render: (r) => { const c = DB.client(r.clientId) || {}; return html`<a href="#/clients/${c.code}">${c.code} · ${c.name}</a>`; } },
          { key: 'cur', label: 'Not due', cls: 'num', render: (r) => money(r.cur) }, { key: 'a', label: '0–30', cls: 'num', render: (r) => money(r.a) }, { key: 'b', label: '31–60', cls: 'num', render: (r) => money(r.b) }, { key: 'cc', label: '60+', cls: 'num', get: (r) => r.c, render: (r) => html`<span class="${r.c ? 'late-txt' : ''}">${money(r.c)}</span>` }, { key: 'total', label: 'Total', cls: 'num', render: (r) => html`<b>${money(r.total)}</b>` },
          { key: 'x', label: '', sort: false, render: (r) => html`${btn('Statement', 'inv:statement', { id: r.clientId, cls: 'sm ghost' })}${btn('', 'client:wa', { id: r.clientId, icon: 'wa', cls: 'icon-btn sm wa', title: 'WhatsApp reminder' })}` }] })}</div>`;
    } else if (f.tab === 'ledger') {
      const c = DB.client(f.ledgerClient);
      const st = c ? Invoices.statement(c) : null;
      body = html`<div class="card filters">${fSelect('invoices.ledgerClient', 'Choose a client…', clientOpts())}${c ? btn('Print statement', 'inv:statement', { id: c.id, cls: 'ghost', icon: 'print' }) : ''}</div>${st ? html`<div class="card p0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Ref</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>${st.rows.map((r) => html`<tr><td>${fmtDate(r.date)}</td><td><code>${r.ref}</code></td><td>${r.desc}</td><td class="num">${r.dr ? money(r.dr) : ''}</td><td class="num">${r.cr ? money(r.cr) : ''}</td><td class="num"><b>${money(r.bal)}</b></td></tr>`)}</tbody><tfoot><tr><td colspan="5" class="right"><b>Closing balance</b></td><td class="num"><b>${money(st.bal)}</b></td></tr></tfoot></table></div></div>` : emptyState('Select a client to view the ledger')}`;
    } else if (f.tab === 'expenses') body = Expenses.render();
    else if (f.tab === 'profit') body = Expenses.profit();
    else {
      const rows = invs.filter((i) => { const c = DB.client(i.clientId) || {}; return textMatch(f.q, i.number, c.name, c.code) && (!f.status || DB.invStatus(i) === f.status) && inRange(i.date, f.from, f.to) && (!f.client || i.clientId === f.client); });
      body = html`<div class="card filters">${fInput('invoices.q', 'Search invoice no, client…')}${fSelect('invoices.status', 'All statuses', ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'].map((s) => ({ value: s, label: s })))}${fSelect('invoices.client', 'All clients', clientOpts())}${fDate('invoices.from', 'From')}${fDate('invoices.to', 'To')}${savedFiltersBar('invoices')}</div><div class="card p0">${Invoices.table(rows, 'invoices')}</div>`;
    }
    return html`${pageHead('Invoices & Payments', `Billing, receipts, receivables and profit (${curCode()})`, html`${Auth.can('invoices', 'export') && f.tab === 'invoices' ? btn('Export', 'inv:export', { cls: 'ghost', icon: 'download' }) : ''}${Auth.can('invoices', 'create') && f.tab === 'expenses' ? btn('Add expense', 'exp:new', { cls: 'primary', icon: 'plus' }) : ''}${Auth.can('invoices', 'create') ? btn('New invoice', 'inv:new', { cls: f.tab === 'expenses' ? 'ghost' : 'primary', icon: 'plus' }) : ''}`)}
      <div class="kpis sm4"><div class="kpi"><small>Billed this month</small><b>${money(k.billed)}</b></div><div class="kpi"><small>Received this month</small><b>${money(k.received)}</b></div><div class="kpi"><small>Outstanding receivables</small><b>${money(k.outstanding)}</b></div><div class="kpi ${k.overdue ? 'warn' : ''}"><small>Overdue invoices</small><b>${k.overdue}</b></div></div>
      ${tabsBar('invoices', tabs, f.tab)}${body}`;
  },
  detail(no) {
    const inv = Store.s.invoices.find((i) => i.number === no);
    if (!inv || !Auth.byClient([inv]).length) return emptyState('Invoice not found');
    const c = DB.client(inv.clientId) || {}; const t = DB.invTotal(inv); const st = DB.invStatus(inv); const pays = Store.s.payments.filter((p) => p.invoiceId === inv.id);
    const canEdit = Auth.can('invoices', 'edit');
    return html`<div class="crumbs"><a href="#/invoices">Invoices</a> › ${inv.number}</div>
      <div class="card"><div class="row-between wrap"><div><h1>${inv.number} ${badge(st, statusTone(st))}</h1><p class="muted"><a href="#/clients/${c.code}">${c.code} · ${c.name}</a> · issued ${fmtDate(inv.date)} · due ${fmtDate(inv.due)}</p></div>
      <div class="row-acts">${canEdit && DB.invBalance(inv) > 0 && st !== 'Cancelled' ? btn('Record payment', 'inv:pay', { id: inv.id, cls: 'primary', icon: 'invoices' }) : ''}${canEdit && inv.status === 'Draft' ? btn('Mark as sent', 'inv:sent', { id: inv.id, cls: 'ghost' }) : ''}${btn('Print / PDF', 'inv:print', { id: inv.id, icon: 'print', cls: 'ghost' })}${btn('Email', 'inv:email', { id: inv.id, icon: 'mail', cls: 'ghost' })}${btn('Reminder', 'inv:wa', { id: inv.id, icon: 'wa', cls: 'wa' })}${canEdit ? btn('Edit', 'inv:edit', { id: inv.id, icon: 'edit', cls: 'ghost' }) : ''}${Auth.can('invoices', 'delete') ? btn('', 'inv:del', { id: inv.id, icon: 'trash', cls: 'icon-btn danger-txt', title: 'Delete invoice' }) : ''}</div></div></div>
      <div class="grid-31"><div class="card"><table class="tbl"><thead><tr><th>#</th><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${inv.items.map((it, i) => html`<tr><td>${i + 1}</td><td>${it.desc}</td><td class="num">${it.qty}</td><td class="num">${money(it.rate)}</td><td class="num">${money(it.qty * it.rate)}</td></tr>`)}</tbody></table>
        <div class="totals"><div>Subtotal <b>${money(t.sub)}</b></div><div>Discount <b>− ${money(t.disc)}</b></div><div>Tax (${inv.taxPct || 0}%) <b>${money(t.tax)}</b></div><div class="grand">Total <b>${money(t.total)}</b></div><div>Paid <b>${money(DB.invPaid(inv))}</b></div></div>${inv.notes ? html`<p class="muted">${inv.notes}</p>` : ''}</div>
      <div class="card"><h3>Payments</h3>${progress(t.total ? DB.invPaid(inv) / t.total * 100 : 0, 'green')}${pays.length ? html`<ul class="list">${pays.map((p) => html`<li class="row-between"><span><b>${money(p.amount)}</b> · ${Lists.name('paymentMethods', p.method)}${p.accountId ? ' → ' + Accounts.name(p.accountId) : ''}<br><small class="muted">${p.number} · ${fmtDate(p.date)}${p.ref ? ' · ' + p.ref : ''}</small></span>${Auth.can('invoices', 'edit') ? btn('', 'pay:acc', { id: p.id, icon: 'edit', cls: 'icon-btn sm', title: 'Change deposit account' }) : ''}${btn('', 'pay:receipt', { id: p.id, icon: 'print', cls: 'icon-btn sm', title: 'Receipt' })}</li>`)}</ul>` : html`<p class="muted">No payments yet.</p>`}</div></div>`;
  }
};

/* ---------- Expenses & profit ---------- */
const Expenses = {
  open(x) {
    formModal({
      title: x ? 'Edit expense' : 'Add expense', size: 'md',
      fields: [{ name: 'date', label: 'Date', type: 'date', required: true }, { name: 'category', label: 'Category', type: 'select', list: 'expenseCategories', required: true }, { name: 'amount', label: `Amount (${curCode()})`, type: 'money', required: true, min: 1 }, { name: 'payee', label: 'Paid to' }, { name: 'method', label: 'Method', type: 'select', list: 'paymentMethods' }, { name: 'accountId', label: 'Paid from (optional)', type: 'select', options: () => Accounts.opts(), placeholder: '— Not tracked —', help: 'Deducts the amount from this account balance.' }, { name: 'branch', label: 'Branch', type: 'select', list: 'branches' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 }],
      values: x ? clone(x) : { date: today(), branch: (Lists.all('branches')[0] || {}).id },
      onSubmit: (v) => {
        if (x) { Store.commit(() => { Object.assign(x, v); Rec.stamp(x); }); Auth.audit('edit', 'invoices', `Expense ${x.number} edited`, { recordId: x.id }); }
        else { const r = Rec.stamp(Object.assign({ id: uid('e') }, v), true); Store.commit((s) => { r.number = Store.next('exp'); s.expenses.push(r); }); Auth.audit('create', 'invoices', `Expense ${r.number} ${money(v.amount)}`, { recordId: r.id }); }
        toast('Expense saved');
      }
    });
  },
  list() { return Store.s.expenses.filter((e) => !UIState.branch || e.branch === UIState.branch); },
  render() {
    const f = vs('invoices');
    const rows = this.list().filter((e) => textMatch(f.eq, e.payee, e.notes, Lists.name('expenseCategories', e.category)) && (!f.ecat || e.category === f.ecat) && inRange(e.date, f.efrom, f.eto));
    return html`<div class="card filters">${fInput('invoices.eq', 'Search payee, notes…')}${fSelect('invoices.ecat', 'All categories', listOpts('expenseCategories'))}${fDate('invoices.efrom', 'From')}${fDate('invoices.eto', 'To')}<span class="grow"></span><b>Total ${money(sum(rows, (e) => e.amount))}</b></div>
      <div class="card p0">${dataTable('expenses', { rows, empty: emptyState('No expenses recorded'), cols: [{ key: 'number', label: 'No.', render: (e) => html`<code>${e.number}</code>` }, { key: 'date', label: 'Date', render: (e) => fmtDate(e.date) }, { key: 'category', label: 'Category', get: (e) => Lists.name('expenseCategories', e.category), render: (e) => Lists.name('expenseCategories', e.category) }, { key: 'payee', label: 'Paid to' }, { key: 'method', label: 'Method', render: (e) => Lists.name('paymentMethods', e.method) }, { key: 'acc', label: 'Paid from', get: (e) => Accounts.name(e.accountId), render: (e) => e.accountId ? Accounts.name(e.accountId) : html`<span class="muted">—</span>` }, { key: 'amount', label: 'Amount', cls: 'num', get: (e) => Number(e.amount), render: (e) => html`<b>${money(e.amount)}</b>` }, { key: 'a', label: '', sort: false, cls: 'act', render: (e) => html`<div class="row-acts">${Auth.can('invoices', 'edit') ? btn('', 'exp:edit', { id: e.id, icon: 'edit', cls: 'icon-btn sm', title: 'Edit' }) : ''}${Auth.can('invoices', 'delete') ? btn('', 'exp:del', { id: e.id, icon: 'trash', cls: 'icon-btn sm', title: 'Delete' }) : ''}</div>` }] })}</div>`;
  },
  months(n = 12) { return Array.from({ length: n }, (_, i) => monthKey(addMonths(today().slice(0, 8) + '01', i - n + 1))); },
  profit() {
    const pays = Auth.byClient(Store.s.payments); const exps = this.list();
    const rows = this.months().map((mk) => { const r = sum(pays.filter((p) => monthKey(p.date) === mk), (p) => p.amount); const e = sum(exps.filter((x) => monthKey(x.date) === mk), (x) => x.amount); return { id: mk, mk, r, e, n: r - e }; });
    const T = { r: sum(rows, (x) => x.r), e: sum(rows, (x) => x.e) };
    const byCat = Lists.all('expenseCategories').map((c, i) => ({ label: c.name, value: sum(exps.filter((x) => x.category === c.id && rows.some((r) => r.mk === monthKey(x.date))), (x) => x.amount), color: SERIES[i % 8] })).filter((d) => d.value).sort((a, b) => b.value - a.value);
    return html`<div class="kpis sm4"><div class="kpi"><small>Revenue received (12 months)</small><b>${money(T.r)}</b></div><div class="kpi"><small>Expenses (12 months)</small><b>${money(T.e)}</b></div><div class="kpi ${T.r - T.e < 0 ? 'warn' : ''}"><small>Net profit</small><b>${money(T.r - T.e)}</b></div><div class="kpi"><small>Margin</small><b>${T.r ? Math.round((T.r - T.e) / T.r * 100) : 0}%</b></div></div>
      <div class="grid-31"><div class="card"><h3>Net profit by month</h3>${Charts.bars(rows.map((x) => ({ label: monthLabel(x.mk), value: Math.max(0, x.n), tip: `${monthLabel(x.mk)} — revenue ${money(x.r)}, expenses ${money(x.e)}, net ${money(x.n)}` })), { fmt: moneyShort })}
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th><th class="num">Revenue</th><th class="num">Expenses</th><th class="num">Net profit</th></tr></thead><tbody>${rows.slice().reverse().map((x) => html`<tr><td>${monthLabel(x.mk)}</td><td class="num">${money(x.r)}</td><td class="num">${money(x.e)}</td><td class="num"><b class="${x.n < 0 ? 'late-txt' : ''}">${money(x.n)}</b></td></tr>`)}</tbody></table></div></div>
      <div class="card"><h3>Expenses by category</h3>${Charts.hbars(byCat, { fmt: moneyShort })}</div></div>`;
  }
};

const invOf = (a) => DB.invoice(a.dataset.id);
act('inv:new', (a) => Invoices.open(null, a.dataset.client ? { clientId: a.dataset.client } : {}));
act('inv:edit', (a) => Invoices.open(invOf(a)));
act('inv:pay', (a) => Invoices.pay(invOf(a)));
act('inv:print', (a) => Invoices.printInvoice(invOf(a)));
act('inv:email', (a) => Invoices.email(invOf(a)));
act('inv:sent', (a) => { const i = invOf(a); Store.commit(() => { i.status = 'Sent'; }); Auth.audit('edit', 'invoices', `${i.number} marked as sent`, { recordId: i.id, old: { status: 'Draft' }, new: { status: 'Sent' } }); toast('Marked as sent'); });
act('inv:wa', (a) => { const i = invOf(a); const c = DB.client(i.clientId); const tpl = { title: `invoice ${i.number} (${money(DB.invTotal(i).total)})`, due: i.due }; Contact.compose('whatsapp', c, tpl); });
act('inv:del', async (a) => {
  const i = invOf(a); const p = Store.s.payments.filter((x) => x.invoiceId === i.id);
  if (!(await confirmDlg(html`Delete invoice <b>${i.number}</b>${p.length ? html` and its ${p.length} payment(s)` : ''}?`, { danger: true, ok: 'Delete' }))) return;
  const idx = Store.s.invoices.indexOf(i);
  Store.commit((s) => { s.payments = s.payments.filter((x) => x.invoiceId !== i.id); s.invoices.splice(idx, 1); });
  Auth.audit('delete', 'invoices', `Deleted invoice ${i.number}${p.length ? ` with ${p.length} payment(s)` : ''}`, { recordId: i.id, old: { invoice: i, payments: p } });
  location.hash = '#/invoices';
  toast(`Invoice ${i.number} deleted`, 'ok', { undo: () => { Store.commit((s) => { s.invoices.splice(Math.min(idx, s.invoices.length), 0, i); s.payments.push(...p); }); Auth.audit('restore', 'invoices', `Undo delete: ${i.number}`, { recordId: i.id }); toast('Restored'); } });
});
act('inv:export', () => {
  const rows = Auth.byClient(Store.s.invoices); const H = ['Invoice', 'Client', 'Code', 'Date', 'Due', 'Subtotal', 'Discount', 'Tax', 'Total', 'Paid', 'Status'];
  downloadFile('invoices.csv', toCSV(H, rows.map((i) => { const c = DB.client(i.clientId) || {}; const t = DB.invTotal(i); return [i.number, c.name, c.code, i.date, i.due, t.sub, t.disc, t.tax, t.total, DB.invPaid(i), DB.invStatus(i)]; })), 'text/csv');
  Auth.audit('export', 'invoices', `Exported ${rows.length} invoices`);
});
act('inv:statement', (a) => {
  const c = DB.client(a.dataset.id); const st = Invoices.statement(c);
  printHTML(`Statement ${c.code}`, html`${printHeader('Statement of Account', `${c.code} · ${c.name} · as of ${fmtDate(today())}`)}<table class="ptbl"><tr><th>Date</th><th>Ref</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr>${st.rows.map((r) => html`<tr><td>${fmtDate(r.date)}</td><td>${r.ref}</td><td>${r.desc}</td><td class="num">${r.dr ? money(r.dr) : ''}</td><td class="num">${r.cr ? money(r.cr) : ''}</td><td class="num">${money(r.bal)}</td></tr>`)}<tr><td colspan="5" class="right"><b>Balance due</b></td><td class="num"><b>${money(st.bal)}</b></td></tr></table>`);
});
act('pay:receipt', (a) => {
  const p = Store.s.payments.find((x) => x.id === a.dataset.id); const i = DB.invoice(p.invoiceId) || {}; const c = DB.client(p.clientId) || {};
  printHTML(`Receipt ${p.number}`, html`<div class="invoice-print">${printHeader('PAYMENT RECEIPT')}${kv([['Receipt no.', p.number], ['Date', fmtDate(p.date)], ['Received from', `${c.name || ''} (${c.code || ''})`], ['Amount', money(p.amount)], ['Method', Lists.name('paymentMethods', p.method)], ['Deposited to', p.accountId ? Accounts.name(p.accountId) : ''], ['Reference', p.ref], ['Against invoice', i.number]])}<div class="p-sign">Authorised signature</div><div class="p-foot">${printFooter()}</div></div>`);
});
act('pay:del', async (a) => { const p = Store.s.payments.find((x) => x.id === a.dataset.id); if (await confirmDlg(`Delete payment ${p.number} of ${money(p.amount)}?`, { danger: true, ok: 'Delete' })) Rec.remove('payments', p, `Payment ${p.number}`, 'invoices'); });
act('exp:new', () => Expenses.open());
act('exp:edit', (a) => Expenses.open(Store.s.expenses.find((x) => x.id === a.dataset.id)));
act('exp:del', async (a) => { const x = Store.s.expenses.find((e) => e.id === a.dataset.id); if (await confirmDlg('Delete this expense?', { danger: true, ok: 'Delete' })) Rec.remove('expenses', x, `Expense ${x.number}`, 'invoices'); });
