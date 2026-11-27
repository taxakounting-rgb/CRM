/* ==========================================================================
   24-accounts.js — Money accounts: "Cash in Hand" + any number of bank accounts.
   Every received payment is deposited to one account (payments[].accountId);
   expenses can optionally be paid from one (expenses[].accountId).
   Balance = opening balance + payments received - expenses paid.
   ========================================================================== */
const Accounts = {
  CASH: 'acc_cash',
  ensure() {
    const s = Store.s; if (!Array.isArray(s.accounts)) s.accounts = [];
    if (!s.accounts.some((a) => a.id === this.CASH)) s.accounts.unshift({ id: this.CASH, name: 'Cash in Hand', type: 'cash', opening: 0, system: true, createdAt: new Date().toISOString() });
  },
  all() { return Store.s.accounts || []; },
  get(id) { return this.all().find((a) => a.id === id); },
  name(id) { const a = this.get(id); return a ? a.name : '—'; },
  opts() { return this.all().map((a) => ({ value: a.id, label: a.type === 'bank' ? `${a.name} (Bank)` : a.name })); },
  received(a) { return sum(Store.s.payments.filter((p) => p.accountId === a.id), (p) => p.amount); },
  spent(a) { return sum(Store.s.expenses.filter((e) => e.accountId === a.id), (e) => e.amount); },
  balance(a) { return (Number(a.opening) || 0) + this.received(a) - this.spent(a); },
  usage(a) { return Store.s.payments.filter((p) => p.accountId === a.id).length + Store.s.expenses.filter((e) => e.accountId === a.id).length; },
  unassigned() { return Store.s.payments.filter((p) => !p.accountId); },
  ledger(a) {
    const rows = [];
    if (Number(a.opening)) rows.push({ id: 'open', date: a.createdAt ? new Date(new Date(a.createdAt).getTime() - new Date(a.createdAt).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : today(), ref: '—', desc: 'Opening balance', in: Number(a.opening) > 0 ? Number(a.opening) : 0, out: Number(a.opening) < 0 ? -Number(a.opening) : 0, at: a.createdAt || '' });
    Store.s.payments.filter((p) => p.accountId === a.id).forEach((p) => { const c = DB.client(p.clientId) || {}; const i = DB.invoice(p.invoiceId) || {}; rows.push({ id: p.id, date: p.date, ref: p.number, desc: `Payment from ${c.name || '—'}${i.number ? ' · ' + i.number : ''} (${Lists.name('paymentMethods', p.method)})`, in: Number(p.amount), out: 0, pay: true, at: p.createdAt || '' }); });
    Store.s.expenses.filter((e) => e.accountId === a.id).forEach((e) => rows.push({ id: e.id, date: e.date, ref: e.number, desc: `Expense: ${Lists.name('expenseCategories', e.category)}${e.payee ? ' · ' + e.payee : ''}`, in: 0, out: Number(e.amount), at: e.createdAt || '' }));
    rows.sort((x, y) => (x.date === y.date ? (x.at > y.at ? 1 : -1) : (x.date > y.date ? 1 : -1)));
    let bal = 0; rows.forEach((r) => { bal += r.in - r.out; r.bal = bal; });
    return rows.reverse();
  },
  /* In the payment dialog: choosing Cash selects Cash in Hand; any other method selects the first bank account. */
  linkMethod() {
    const m = document.querySelector('form [name=method]'), a = document.querySelector('form [name=accountId]'); if (!m || !a) return;
    m.addEventListener('change', () => {
      if (/cash/i.test(Lists.name('paymentMethods', m.value))) a.value = this.CASH;
      else { const bank = this.all().find((x) => x.type === 'bank'); if (bank) a.value = bank.id; }
    });
  },
  open(a) {
    const isNew = !a;
    formModal({
      title: isNew ? 'Add bank account' : `Edit account · ${a.name}`, size: 'md',
      fields: [
        { name: 'name', label: 'Account name', required: true, placeholder: 'e.g. HBL Current Account', validate: (v) => this.all().some((x) => x !== a && x.name.toLowerCase() === String(v).toLowerCase()) ? 'An account with this name already exists' : '' },
        ...(a && a.system ? [] : [{ name: 'type', label: 'Type', type: 'select', required: true, options: [{ value: 'bank', label: 'Bank account' }, { value: 'cash', label: 'Cash' }] }]),
        { name: 'opening', label: `Opening balance (${curCode()})`, type: 'money', help: 'Money already in this account before you start using the CRM.' },
        { name: 'notes', label: 'Bank / account details (optional)', type: 'textarea', full: true, rows: 2 }
      ],
      values: a ? clone(a) : { type: 'bank', opening: 0 },
      onSubmit: (v) => {
        v.opening = Number(v.opening) || 0;
        if (a) { Store.commit(() => { Object.assign(a, v); Rec.stamp(a); }); Auth.audit('edit', 'invoices', `Account "${a.name}" edited`, { recordId: a.id }); }
        else { const r = Rec.stamp(Object.assign({ id: uid('acc_') }, v), true); Store.commit((s) => { s.accounts.push(r); }); Auth.audit('create', 'invoices', `Account "${r.name}" added`, { recordId: r.id }); vs('invoices').acc = r.id; }
        toast('Account saved');
      }
    });
  },
  render() {
    const f = vs('invoices'); const list = this.all();
    const sel = this.get(f.acc) || list[0]; const can = Auth.can('invoices', 'edit');
    const total = sum(list, (a) => this.balance(a));
    const un = this.unassigned();
    const cards = list.map((a) => html`<button type="button" class="acc-card ${sel && sel.id === a.id ? 'on' : ''}" data-vs-set="invoices.acc" data-val="${a.id}"><small>${a.type === 'bank' ? 'Bank account' : 'Cash'}</small><span class="acc-name">${a.name}</span><b class="${this.balance(a) < 0 ? 'late-txt' : ''}">${money(this.balance(a))}</b></button>`);
    return html`<div class="kpis sm4"><div class="kpi"><small>Total across all accounts</small><b>${money(total)}</b></div><div class="kpi"><small>Cash in hand</small><b>${money(sum(list.filter((a) => a.type === 'cash'), (a) => this.balance(a)))}</b></div><div class="kpi"><small>In bank accounts</small><b>${money(sum(list.filter((a) => a.type === 'bank'), (a) => this.balance(a)))}</b></div></div>
      ${un.length && can ? html`<div class="card acc-note"><span>${un.length} earlier payment(s) (${money(sum(un, (p) => p.amount))}) have no account.</span>${btn('Put them in Cash in Hand', 'acc:assign', { cls: 'sm ghost' })}</div>` : ''}
      <div class="acc-grid">${cards}${Auth.can('invoices', 'create') ? html`<button type="button" class="acc-card add" data-act="acc:new">${icon('plus')}<span>Add bank account</span></button>` : ''}</div>
      ${sel ? html`<div class="card p0"><div class="row-between" style="padding:14px 16px"><h3 style="margin:0">${sel.name} · transactions</h3><span class="row-acts">${can ? btn('Edit', 'acc:edit', { id: sel.id, icon: 'edit', cls: 'sm ghost' }) : ''}${Auth.can('invoices', 'delete') && !sel.system ? btn('', 'acc:del', { id: sel.id, icon: 'trash', cls: 'icon-btn sm danger-txt', title: 'Delete account' }) : ''}</span></div>
        ${dataTable('acc-ledger', { rows: this.ledger(sel), empty: emptyState('No transactions yet', 'Payments deposited to this account will appear here.'), cols: [{ key: 'date', label: 'Date', render: (r) => fmtDate(r.date) }, { key: 'ref', label: 'Ref', render: (r) => html`<code>${r.ref}</code>` }, { key: 'desc', label: 'Description' }, { key: 'in', label: 'Money in', cls: 'num', render: (r) => r.in ? html`<span class="pos-txt">${money(r.in)}</span>` : '' }, { key: 'out', label: 'Money out', cls: 'num', render: (r) => r.out ? money(r.out) : '' }, { key: 'bal', label: 'Balance', cls: 'num', sort: false, render: (r) => html`<b>${money(r.bal)}</b>` }, { key: 'x', label: '', sort: false, cls: 'act', render: (r) => r.pay && can ? btn('Move', 'pay:acc', { id: r.id, icon: 'edit', cls: 'sm ghost', title: 'Move this payment to another account' }) : '' }] })}</div>` : ''}`;
  }
};
act('acc:new', () => Accounts.open());
act('acc:edit', (a) => Accounts.open(Accounts.get(a.dataset.id)));
act('acc:assign', () => { const un = Accounts.unassigned(); Store.commit(() => { un.forEach((p) => { p.accountId = Accounts.CASH; }); }); Auth.audit('edit', 'invoices', `${un.length} earlier payment(s) put in Cash in Hand`); toast('Done'); });
act('acc:del', async (a) => {
  const acc = Accounts.get(a.dataset.id); if (!acc || acc.system) return;
  if (Accounts.usage(acc)) { toast(`"${acc.name}" has ${Accounts.usage(acc)} transaction(s) and cannot be deleted`, 'warn'); return; }
  if (!(await confirmDlg(html`Delete account <b>${acc.name}</b>?`, { danger: true, ok: 'Delete' }))) return;
  Store.commit((s) => { s.accounts = s.accounts.filter((x) => x.id !== acc.id); }); vs('invoices').acc = ''; Auth.audit('delete', 'invoices', `Account "${acc.name}" deleted`, { recordId: acc.id }); toast('Account deleted');
});

/* Fix a wrong deposit: move a received payment to another account (balances follow automatically). */
act('pay:acc', (a) => {
  const p = Store.s.payments.find((x) => x.id === a.dataset.id); if (!p) return;
  formModal({
    title: `Change deposit account · ${p.number}`, size: 'sm', submit: 'Move payment',
    intro: html`<p>${money(p.amount)} is currently in <b>${p.accountId ? Accounts.name(p.accountId) : 'no account'}</b>. Choose where it should be.</p>`,
    fields: [{ name: 'accountId', label: 'Deposit to', type: 'select', options: () => Accounts.opts(), required: true }],
    values: { accountId: p.accountId || '' },
    onSubmit: (v) => {
      if (v.accountId === p.accountId) return;
      const from = p.accountId ? Accounts.name(p.accountId) : 'no account';
      Store.commit(() => { p.accountId = v.accountId; Rec.stamp(p); });
      Auth.audit('edit', 'invoices', `Payment ${p.number} moved from ${from} to ${Accounts.name(v.accountId)}`, { recordId: p.id, old: { accountId: from }, new: { accountId: v.accountId } });
      toast(`${money(p.amount)} moved from ${from} to ${Accounts.name(v.accountId)}`);
    }
  });
});
