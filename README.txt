UNIVERSAL CRM
=============
Open dist/Universal_CRM.html in Chrome or Edge (double-click; no install, no internet).

First launch = Setup Wizard
  1. Company: name, logo, industry, phone, email, website, address, tax/registration no.
  2. Business: currency, phone country code, and your own services (optional)
  3. Look & feel: 23 themes + build-your-own colours, Light / Dark / System
  4. Admin account: your own username and password

Afterwards: Settings > Company (edit profile / logo / currency), Settings > Master Lists (services, client types,
statuses, tags, ...), Settings > Users & Roles, Settings > Backup & Restore.
Turn on "auto-save to a file" from the dashboard banner so your data is always backed up on disk.

Data is stored in this browser on this computer. Use the same browser profile each time.

Rebuild from source:  node scripts/build.mjs   (then node scripts/e2e.mjs to test)


LOG IN / SIGN UP + CLOUD (use from any computer)
------------------------------------------------
The first screen is always Log in / Sign up.
  * Sign up on a new system = create your company workspace (wizard). Your admin username + password become your cloud login.
  * Log in on ANY computer = same username + password; your data is downloaded from the cloud.
Cloud sync needs the hosted version (Vercel) with a database:
  1. Vercel dashboard > your project > Storage > Create > Upstash Redis (Marketplace) > connect to the project.
     (This adds KV_REST_API_URL and KV_REST_API_TOKEN automatically.)
  2. Settings > Environment Variables > add CRM_SECRET = any long random text.
  3. Redeploy. Open your Vercel address: the first screen will say "stored safely online".
If the database is not connected (or you open the file directly), the app still works, storing data only in that browser.
Not synced to the cloud: scanned document files (stay in the browser; use Settings > Backup > Export full backup).
Test cloud API: node scripts/cloud-test.mjs
