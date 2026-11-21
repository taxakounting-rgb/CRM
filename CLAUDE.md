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
