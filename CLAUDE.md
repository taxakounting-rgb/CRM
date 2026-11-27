# Universal CRM & Workflow Management System

A complete, dynamic CRM as ONE offline HTML file for any company (agency, accounting, IT, consulting, retail...). On first launch a Setup Wizard asks for the company name, logo, contact details, currency, own services and the admin account. Nothing is pre-filled: no sample data, no industry-specific services.

## Output
- Deliverable: `dist/Universal_CRM.html` (HTML + CSS + vanilla JS, no CDN, no server, no install).
- Source is modular in `src/`; `node scripts/build.mjs` bundles it into the single file. Never hand-edit `dist/`.
- One app with a login screen. Role decides visible modules and buttons.

## Commands
- Build: `node scripts/build.mjs` (also runs `node --check` on the bundle)
- Smoke test: `node scripts/smoke.mjs` (needs `npm i -D playwright`)
- End-to-end: `node scripts/e2e.mjs [screenshotDir]` (wizard, branding, currency, themes, clients, persistence, XSS)

## Architecture (src/js, bundled in the order of src/order.json)
00-core Store/Lists/money (currency from Settings) · 01-crypto · 02-auth (roles, permission matrix, audit) · 03-ui · 04-router (shell, login, lock) · 05-common · 06-clients · 07-vault · 08-team · 09-tasks · 10-services · 11-compliance (generic "Deadlines") · 12-invoices · 13-documents · 14-notifications · 15-dashboard · 16-reports · 17-settings · 18-themes (23 presets + custom builder, Light/Dark/System) · 19-brand (Brand helpers, generated logo, currencies, no-op License shim) · 20-datafile (auto-save to file) · 21-setup (first-run wizard) · 99-boot (generic seeds, start).

## Hard rules
- Everything dynamic: dropdown values come from Settings > Master Lists, never hard-coded in forms. Services start EMPTY; the owner adds them.
- Company name/logo/contact/currency live in `Store.s.settings.company` / `.currency`; use `Brand.*`, `brandLogo()`, `money()`, `curCode()`. Never hard-code a company name, currency or country.
- Customer code = first letter of name + next number for that letter (Ali=A1, Ahmad=A2, Bilal=B1).
- IDs from stored counters: TSK-0001, EMP-001, INV-0001, DOC-0001 (prefix configurable).
- Passwords never plain text; vault passwords AES-GCM encrypted with a key from the Vault PIN.
- Roles with scope `assigned` see only their assigned clients in EVERY query.
- Escape all user text before HTML (`html` tagged template escapes by default).
- Permissions are data (editable matrix), not if-statements on role names.
- Must work from `file://` in Chrome/Edge, offline, 1,000+ records.

## Cloud, multi-company (current design)
- First screen = company Sign up / Sign in (`App.showGate`, `showCompanySignup`, `showCompanyLogin`). After company sign-in, employees use the normal login (`showLogin`) against the users inside that company's state.
- `api/sync.js` (Vercel function + Upstash Redis; env KV_REST_API_URL/TOKEN, CRM_SECRET). Keys: crm:co:<companyId> -> {ws, salt, h2}; crm:state:<ws>; crm:meta:<ws>; crm:blob:<ws>:<vid>.
- `src/js/22-cloud.js`: company account, versioned whole-state sync (conflict = newer cloud copy wins, local snapshot kept), document files in cloud (max 3 MB), local browser copy is only a cache.
- No backup/restore/auto-save-file UI (removed on purpose). Tests: `node scripts/cloud-test.mjs`, `node scripts/dev-server.mjs` + `python3 scripts/e2e-cloud.py`.

## Credentials Vault & invoice print (latest)
- Vault credentials are typed: `settings.credTypes` (starter set in `DEFAULT_CRED_TYPES`, editable in Vault > Credential types). Each type = list of fields (text/email/url/password/PIN); password + PIN fields are always AES-GCM encrypted. Records keep `typeId`, `layout` (field snapshot), `fields`, `secrets`. Old records (portal/username/secret/extra) are upgraded on the fly by `Vault.upgrade()`.
- Printed documents use `--print-accent` = dominant colour of the company logo (`Brand.printColor()`, cached in `company.logoColor`; falls back to the theme brand colour). Invoices have no signature block and no "Balance Due".

## Invoice client search, email, password eye (latest)
- Invoice form: Client is a searchable box (`Invoices.bindClientPicker`) — filters by name, code, phone, email, company while typing.
- `Invoices.email(inv)`: composer (To / Subject / Message) with Open email app (mailto), Gmail, Copy and Print/PDF buttons; optionally marks a Draft as Sent and logs to the client timeline. Buttons: invoice list row + invoice detail page. mailto cannot attach files, so the PDF is saved via Print / PDF and attached by hand.
- `bindPwToggle(root)` (03-ui.js): every `input[type=password]` in forms and dialogs (vault credentials, Vault PIN setup/change/unlock) gets a show/hide eye button.
