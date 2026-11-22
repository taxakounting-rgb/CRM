// End-to-end check: first-run wizard -> workspace, branding, currency, themes, clients, persistence.
// Usage: node scripts/e2e.mjs [screenshotDir]
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv[2] || join(root, 'dist', 'shots'); mkdirSync(shots, { recursive: true });
const url = pathToFileURL(join(root, 'dist/Universal_CRM.html')).href;
// tiny valid PNG (blue square) used as the logo
const png = readFileSync(join(root, 'scripts/logo-test.png'));
writeFileSync(join(shots, 'logo.png'), png);
const results = []; const ok = (n, c, extra = '') => { results.push([n, !!c, extra]); console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (extra && !c ? '  → ' + extra : '')); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 } });
const page = await ctx.newPage(); const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url); await page.waitForSelector('[data-gate=signup]'); await page.click('[data-gate=signup]'); await page.waitForSelector('#su-form');

// ---- Wizard ----
ok('Setup wizard appears on first run', await page.locator('.su-steps').count());
await page.screenshot({ path: join(shots, '01-wizard-company-empty.png') });
await page.fill('[name=name]', 'Acme Solutions');
await page.selectOption('[name=industry]', 'Marketing / Digital Agency');
await page.fill('[name=phone]', '+44 20 7946 0000'); await page.fill('[name=email]', 'hello@acme.test'); await page.fill('[name=website]', 'www.acme.test');
await page.fill('[name=country]', 'United Kingdom'); await page.fill('[name=address]', '1 High Street, London');
ok('Live brand preview shows the company name', (await page.locator('[data-brand-name]').textContent()) === 'Acme Solutions');
await page.setInputFiles('[data-su-logo]', join(shots, 'logo.png')); await page.waitForSelector('.su-logo-prev img');
ok('Logo upload previews', await page.locator('.su-logo-prev img').count());
await page.waitForTimeout(500); await page.screenshot({ path: join(shots, '02-wizard-company.png') });
await page.click('.su-actions button[type=submit]');
await page.waitForSelector('[name=currency]');
await page.selectOption('[name=currency]', 'GBP'); await page.fill('[name=dialCode]', '44');
await page.fill('[name=services]', 'Website Design, 1500\nMonthly Consulting, 400\nLogo Design');
await page.screenshot({ path: join(shots, '03-wizard-business.png') });
await page.click('.su-actions button[type=submit]');
await page.waitForSelector('.theme-grid');
ok('23+ built-in themes in wizard', (await page.locator('.theme-grid .th-card').count()) >= 23, String(await page.locator('.theme-grid .th-card').count()));
await page.click('[data-id=midnight]');
ok('Theme applied live', (await page.evaluate(() => document.documentElement.dataset.skin)) === 'midnight');
await page.waitForTimeout(500); await page.screenshot({ path: join(shots, '04-wizard-theme.png') });
await page.click('.su-actions button[type=submit]');
await page.waitForSelector('[name=admUser]');
await page.click('.su-actions button[type=submit]');
ok('Admin step validates empty fields', (await page.locator('[data-err-for=admName]').textContent()).length > 0);
await page.fill('[name=admName]', 'Sara Khan'); await page.fill('[name=admUser]', 'sara'); await page.fill('[name=admEmail]', 'sara@acme.test');
await page.fill('[name=password]', 'weak'); await page.fill('[name=confirm]', 'weak'); await page.click('.su-actions button[type=submit]');
ok('Weak password rejected', (await page.locator('[data-err-for=password]').textContent()).includes('Password needs'));
await page.fill('[name=password]', 'Acme#2026pw'); await page.fill('[name=confirm]', 'Acme#2026pw');
await page.screenshot({ path: join(shots, '05-wizard-admin.png') });
await page.click('.su-actions button[type=submit]');
await page.waitForSelector('#sidenav .nav-it');

// ---- Workspace ----
const body = await page.content();
ok('No TaxAkounting / FBR / CNIC leftovers in the UI', !/taxakounting|FBR|CNIC|SECP|IRIS|Sabzazar/i.test(await page.locator('body').innerText()));
ok('Tab title uses company name', (await page.title()) === 'Acme Solutions CRM', await page.title());
ok('Sidebar shows uploaded logo', await page.locator('.side-logo img').count());
ok('Footer shows company details', (await page.locator('.foot').innerText()).includes('Acme Solutions') && (await page.locator('.foot').innerText()).includes('London'));
ok('Theme saved as company default', await page.evaluate(() => Store.s.settings.defaultSkin === 'midnight'));
ok('Services from the wizard are in Master Lists', await page.evaluate(() => Lists.all('services').length === 3 && Lists.all('services')[0].fee === 1500));
ok('No demo clients / tasks pre-loaded', await page.evaluate(() => Store.s.clients.length === 0 && Store.s.tasks.length === 0));
ok('No pre-seeded deadlines', await page.evaluate(() => Store.s.compliance.length === 0));
ok('Currency is GBP', await page.evaluate(() => money(1234.4) === '£1,234' && moneyShort(2500000) === '£2.5M'));
await page.screenshot({ path: join(shots, '06-dashboard.png') });

// ---- Clients: codes ----
await page.goto(url + '#/clients');
for (const n of ['Ali', 'Ahmad', 'Bilal', 'Babar']) await page.evaluate((nm) => { const c = { id: uid('c'), name: nm, mobile: '+44 7000 000000', status: Lists.all('clientStatuses')[0].id, branch: 'br_1', createdAt: new Date().toISOString() }; c.code = Store.clientCode(nm); Store.commit((s) => s.clients.push(c)); }, n);
const codes = await page.evaluate(() => Store.s.clients.map((c) => c.code).join(','));
ok('Client codes A1,A2,B1,B2', codes === 'A1,A2,B1,B2', codes);
// add a client via UI form (generic fields)
await page.evaluate(() => Clients.open());
await page.waitForSelector('.modal form, [role=dialog] form');
const labels = await page.locator('[role=dialog] label span, .modal label span').allInnerTexts();
ok('Client form uses generic labels', labels.some((l) => /ID \/ Reg/.test(l)) && !labels.some((l) => /CNIC|NTN/.test(l)), labels.join('|'));
await page.screenshot({ path: join(shots, '07-client-form.png') });
await page.keyboard.press('Escape');

// ---- Service + task + invoice with logo/currency ----
const inv = await page.evaluate(() => {
  const c = Store.s.clients[0]; const svc = Lists.all('services')[0];
  const i = { id: uid('i'), number: Store.next('inv'), clientId: c.id, date: today(), due: addDays(today(), 15), items: [{ service: svc.id, desc: svc.name, qty: 1, rate: svc.fee }], discount: 0, taxPct: 0, status: 'Sent', createdAt: new Date().toISOString() };
  Store.commit((s) => s.invoices.push(i));
  Store.commit((s) => s.payments.push({ id: uid('p'), number: Store.next('rcpt'), invoiceId: i.id, clientId: c.id, amount: 500, date: today(), method: 'pm_2', createdAt: new Date().toISOString() }));
  return { status: DB.invStatus(i), bal: DB.invBalance(i), head: String(printHeader('INVOICE')) };
});
ok('Invoice with partial payment', inv.status === 'Partially Paid' && inv.bal === 1000, JSON.stringify(inv).slice(0, 120));
ok('Print header carries the logo + company', inv.head.includes('<img') && inv.head.includes('Acme Solutions'));
await page.goto(url + '#/invoices'); await page.waitForTimeout(300);
ok('Invoices page shows £ amounts', (await page.locator('main').innerText()).includes('£'));
await page.goto(url + '#/services'); await page.waitForTimeout(200);
ok('Services page renders with generic title', (await page.locator('main h1, main .page-head').first().innerText()).includes('Services'));
await page.goto(url + '#/compliance'); await page.waitForTimeout(200);
ok('Deadlines page renders empty & generic', (await page.locator('main').innerText()).includes('Deadlines Calendar'));
for (const r of ['dashboard', 'tasks', 'vault', 'team', 'documents', 'reports', 'audit', 'settings/company', 'settings/lists', 'settings/prefs', 'settings/roles', 'settings/templates']) { await page.goto(url + '#/' + r); await page.waitForTimeout(150); }
await page.goto(url + '#/settings/company'); await page.waitForTimeout(200);
await page.screenshot({ path: join(shots, '08-settings-company.png') });

// ---- Themes ----
const ids = await page.evaluate(() => Theme.list().map((t) => t.id));
for (const id of ids) await page.evaluate((i) => Theme.setSkin(i), id);
await page.evaluate(() => Theme.setSkin('midnight'));
await page.evaluate(() => ThemeUI.open()); await page.waitForSelector('.th-custom');
ok('Theme gallery groups + custom builder', (await page.locator('.th-group').count()) >= 2 && (await page.locator('.th-custom').count()) === 1);
await page.waitForTimeout(500); await page.screenshot({ path: join(shots, '09-themes.png') });
await page.evaluate(() => { const r = document.querySelector('.th-custom'); r.querySelector('[data-cust=brand]').value = '#ff6600'; r.querySelector('[data-cust=side]').value = '#222244'; r.querySelector('[data-act="theme:custom"]').click(); });
ok('Custom theme applies', await page.evaluate(() => Theme.skinId() === 'custom' && getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().toLowerCase() === '#ff6600'));
await page.keyboard.press('Escape');
for (const id of ['clean', 'sand', 'gold']) { await page.evaluate((i) => Theme.setSkin(i), id); await page.goto(url + '#/dashboard'); await page.waitForTimeout(150); await page.screenshot({ path: join(shots, `10-theme-${id}.png`) }); }
await page.evaluate(() => Theme.setMode('dark')); await page.waitForTimeout(150); await page.screenshot({ path: join(shots, '11-dark.png') });
await page.evaluate(() => { Theme.setMode('light'); Theme.setSkin('midnight'); });

// ---- Persistence: reload, sign out, sign in ----
await page.reload(); await page.waitForSelector('#sidenav .nav-it');
ok('Refresh keeps data', await page.evaluate(() => Store.s.clients.length === 4 && Store.s.invoices.length === 1));
await page.evaluate(() => Auth.logout()); await page.waitForSelector('#login-form');
ok('Sign-in screen branded with company', (await page.locator('.auth-brand').innerText()).includes('Acme Solutions') && !(await page.locator('.auth-hint').count()));
await page.screenshot({ path: join(shots, '12-login.png') });
await page.fill('[name=username]', 'sara'); await page.fill('[name=password]', 'Acme#2026pw'); await page.click('#login-form button[type=submit]');
await page.waitForSelector('#sidenav .nav-it');
ok('Login with wizard-created admin works (no forced password change)', true);
ok('Default admin/Admin@123 does not exist', await page.evaluate(() => !Store.s.users.some((u) => u.username === 'admin')));
// escaping
await page.evaluate(() => Store.commit((s) => { s.settings.company.name = '<img src=x onerror=window.__x=1>Evil'; })); await page.waitForTimeout(200);
ok('Company name is HTML-escaped', await page.evaluate(() => !window.__x && !document.querySelector('.foot img')));
await page.evaluate(() => Store.commit((s) => { s.settings.company.name = 'Acme Solutions'; }));

// ---- Fresh restore path link & mobile layout ----
const m = await browser.newContext({ viewport: { width: 390, height: 780 } }); const mp = await m.newPage(); mp.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
await mp.goto(url); await mp.waitForSelector('[data-gate=signup]'); await mp.click('[data-gate=signup]'); await mp.waitForSelector('#su-form'); await mp.fill('[name=name]', 'Acme Solutions'); await mp.screenshot({ path: join(shots, '13-wizard-mobile.png') });
ok('No horizontal scroll on mobile wizard', await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await browser.close();
ok('No console errors during the whole run', !errors.length, errors.slice(0, 3).join(' || '));
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
