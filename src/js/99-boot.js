/* ==========================================================================
   99-boot.js — First-run defaults (generic Master Lists, roles, settings) and
   app start. The first-run Setup Wizard (21-setup.js) creates the company
   profile and the administrator account. Starts EMPTY: no sample data.
   ========================================================================== */
const Seed = {
  L(prefix, names, extra = {}) { return names.map((n, i) => Object.assign({ id: `${prefix}_${i + 1}`, name: Array.isArray(n) ? n[0] : n }, Array.isArray(n) ? n[1] : {}, extra[i] || {})); },
  lists() {
    const C = SERIES;
    return {
      services: [],
      businessTypes: this.L('bt', ['Individual', 'Small Business', 'Company', 'Partnership', 'Non-profit / NGO', 'Government', 'Other']),
      designations: this.L('des', ['Owner / Director', 'Manager', 'Team Lead', 'Executive', 'Associate', 'Intern', 'Office Manager']),
      departments: this.L('dep', ['Management', 'Sales', 'Operations', 'Accounts', 'Support', 'IT', 'Administration']),
      taskStatuses: this.L('ts', [['To Do', { color: '#6b7280' }], ['In Progress', { color: '#2a78d6' }], ['Waiting on Client', { color: '#eda100' }], ['Under Review', { color: '#6250d6' }], ['Completed', { color: '#1baf7a', done: true }]]),
      priorities: this.L('pr', [['Low', { color: '#6b7280' }], ['Medium', { color: '#2a78d6' }], ['High', { color: '#eb6834' }], ['Urgent', { color: '#d62828' }]]),
      docCategories: this.L('dc', ['ID / Identity', 'Contract', 'Agreement', 'Proposal / Quote', 'Invoice', 'Report', 'Certificate', 'Bank Statement', 'Other'], {}).map((x, i) => Object.assign(x, { color: C[i % 8] })),
      portals: this.L('pt', [['Email Account', { url: '' }], ['Website / Hosting', { url: '' }], ['Bank Portal', { url: '' }], ['Social Media', { url: '' }], ['Government Portal', { url: '' }], ['Software / SaaS', { url: '' }], ['Other', { url: '' }]]),
      branches: this.L('br', ['Head Office']),
      clientStatuses: this.L('cs', [['Active', { color: '#1baf7a' }], ['Lead / Prospect', { color: '#2a78d6' }], ['On Hold', { color: '#eda100' }], ['Inactive', { color: '#6b7280' }]]),
      paymentMethods: this.L('pm', ['Cash', 'Bank Transfer', 'Cheque', 'Card', 'Online Payment']),
      expenseCategories: this.L('ec', ['Salaries', 'Office Rent', 'Utilities', 'Internet & Phone', 'Stationery', 'Software', 'Transport', 'Marketing', 'Miscellaneous']),
      tags: this.L('tg', [['VIP', { color: '#d62828' }], ['Retainer', { color: '#2a78d6' }], ['Referral', { color: '#6250d6' }], ['New', { color: '#1baf7a' }]]),
      serviceStatuses: this.L('ss', [['Not Started', { color: '#6b7280' }], ['In Progress', { color: '#2a78d6' }], ['Completed', { color: '#1baf7a' }], ['On Hold', { color: '#eda100' }], ['Cancelled', { color: '#9a9a9a' }]]),
      staffStatuses: this.L('st', [['Active', { color: '#1baf7a' }], ['On Leave', { color: '#eda100' }], ['Inactive', { color: '#6b7280' }]]),
      authorities: this.L('au', [['General', { color: '#2a78d6' }], ['Legal', { color: '#6250d6' }], ['Finance', { color: '#1baf7a' }], ['Client', { color: '#eb6834' }], ['Internal', { color: '#6b7280' }]])
    };
  },
  perms(spec) { const p = {}; Object.entries(spec).forEach(([m, s]) => { p[m] = { view: s.includes('v'), create: s.includes('c'), edit: s.includes('e'), delete: s.includes('d'), export: s.includes('x') }; }); return p; },
  roles() {
    const all = 'vcedx';
    return [
      { id: 'role_super', name: 'Super Admin', system: true, all: true, scope: 'all', perms: {} },
      { id: 'role_admin', name: 'Admin', system: true, scope: 'all', perms: this.perms({ dashboard: 'v', clients: all, vault: all, team: all, tasks: all, services: all, compliance: all, invoices: all, projects: all, documents: all, reports: 'vx', settings: 'vex', users: 'vce', audit: 'vx' }) },
      { id: 'role_staff', name: 'Staff (own clients)', system: true, scope: 'assigned', perms: this.perms({ dashboard: 'v', clients: 'vce', vault: 'vce', team: 'v', tasks: 'vce', services: 'vce', compliance: 'v', projects: 'vce', documents: 'vce', reports: 'vx' }) },
      { id: 'role_acc', name: 'Accounts', system: true, scope: 'all', perms: this.perms({ dashboard: 'v', clients: 'v', tasks: 'v', services: 'v', invoices: 'vcedx', projects: 'v', documents: 'vc', reports: 'vx' }) },
      { id: 'role_view', name: 'Viewer', system: true, scope: 'all', perms: this.perms({ dashboard: 'v', clients: 'v', team: 'v', tasks: 'v', services: 'v', compliance: 'v', projects: 'v', documents: 'v', reports: 'v' }) }
    ];
  },
  settings() {
    return {
      defaultSkin: 'ocean', prefixes: { task: 'TSK-', emp: 'EMP-', inv: 'INV-', doc: 'DOC-', rcpt: 'RCPT-', exp: 'EXP-', prj: 'PRJ-' },
      company: { name: '', phone: '', email: '', website: '', address: '', ntn: '', industry: '', country: '', invoiceFooter: 'Thank you for your business.', terms: '', bank: '' },
      tcTemplates: [
        { id: 'tc_std', name: 'Standard', isDefault: true, text: '1. Payment is due by the due date shown on this invoice.\n2. Late payments may incur a 2% monthly surcharge.\n3. All prices are exclusive of applicable taxes unless stated.\n4. This invoice is subject to our standard terms of service.' },
        { id: 'tc_consult', name: 'Consulting / Retainer', isDefault: false, text: '1. Fees are due within 15 days of invoice date.\n2. Retainer fees are non-refundable once work has commenced.\n3. Additional work beyond agreed scope will be billed separately.\n4. Disputes must be raised within 7 days of invoice date.' },
        { id: 'tc_tax', name: 'Tax & Accounting', isDefault: false, text: '1. Payment is due within 30 days of invoice date.\n2. Documents required from the client must be provided in time. Delays caused by late submission will not be the responsibility of the firm.\n3. The firm shall not be liable for penalties arising from inaccurate information provided by the client.\n4. Confidentiality of all client information is maintained.' }
      ],
      currency: { code: 'USD', symbol: '$' },
      inactivityMin: 15, capacity: 15, filingDueDay: 18, defaultTaxPct: 0, invoiceDueDays: 15, maxUploadMB: 10,
      allowRegistration: false, requireApproval: true, registrationRole: 'role_view', browserNotify: false,
      templates: [
        { name: 'Document request', channel: 'whatsapp', subject: '', body: 'Hello {client},\n\nFor {task}, could you please share the required documents at your earliest convenience?\n\nThank you,\n{company} | {phone}' },
        { name: 'Deadline reminder', channel: 'whatsapp', subject: '', body: 'Dear {client} ({code}),\n\nA reminder that {task} is due on {due}. Please send any pending information so we can finish on time.\n\n{company} | {phone}' },
        { name: 'Payment reminder', channel: 'whatsapp', subject: '', body: 'Dear {client},\n\nA gentle reminder regarding payment for {task}. Please arrange it at your convenience.\n\n{company} | {phone}' },
        { name: 'Work completed', channel: 'whatsapp', subject: '', body: 'Dear {client},\n\nGood news! {task} has been completed. We will share the details shortly.\n\n{company}' },
        { name: 'Document request', channel: 'email', subject: 'Documents required: {task}', body: 'Dear {client},\n\nTo proceed with {task} (due {due}), please send us the required documents.\n\nKind regards,\n{officer}\n{company} | {phone} | {website}' },
        { name: 'Deadline reminder', channel: 'email', subject: 'Reminder: {task} due {due}', body: 'Dear {client},\n\nThis is a reminder that {task} is due on {due}.\n\nKind regards,\n{company}' }
      ],
      taskTemplates: []
    };
  },
  async ensure() {
    const s = Store.s;
    Accounts.ensure();
    if (!s.users.length) {
      // Brand-new company: defaults only. The Setup Wizard creates the company profile and the admin user.
      if (!s.roles.length) Object.assign(s, { lists: this.lists(), roles: this.roles(), settings: this.settings(), compliance: [] });
      Store.saveNow();
      return;
    }
    // Upgrade safety: make sure every list key exists
    const L = this.lists(); Object.keys(L).forEach((k) => { if (!s.lists[k]) s.lists[k] = L[k]; });
    s.settings.prefixes = Object.assign({}, this.settings().prefixes, s.settings.prefixes || {});
    if (!s.settings.currency) s.settings.currency = { code: 'USD', symbol: '$' };
    if (!s.settings.setupDone) s.settings.setupDone = true;
    // Projects: ensure array exists for existing installs
    if (!s.projects) s.projects = [];
    // TC Templates: seed defaults for existing installs if none exist
    if (!s.settings.tcTemplates || !s.settings.tcTemplates.length) s.settings.tcTemplates = this.settings().tcTemplates;
  }
};

/* Boot: show a skeleton while IndexedDB loads, then start the app. */
document.getElementById('app').innerHTML = '<div class="boot"><div class="skel-wrap"><div class="skel"></div><div class="skel"></div></div></div>';
App.boot().catch((e) => { console.warn(e); document.getElementById('app').textContent = 'Failed to start: ' + e.message; });
