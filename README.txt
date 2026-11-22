UNIVERSAL CRM (cloud, multi-company)
====================================
How it works
  1. First screen: "Sign up (new company)" or "Sign in (existing company)".
  2. Sign up = company name + company username + company password. Then a short wizard
     (company details, currency, theme) and the first Super Admin (employee) account.
  3. Sign in (company) = company username + password. Then every employee signs in with
     their own username + password. Roles/permissions decide what each one sees.
  4. All data (records, users, uploaded document files) is stored in the cloud database,
     so you can sign in from any computer in the world. Each company's data is private.
  Employees: Super Admin / Admin creates them in Settings > Users.

Deploy on Vercel (one time, ~5 minutes)
  1. Upload this folder to GitHub and import it in Vercel (build settings are in vercel.json).
  2. Vercel project > Storage > Create > Upstash Redis (Marketplace) > connect to the project.
     (adds KV_REST_API_URL and KV_REST_API_TOKEN automatically)
  3. Settings > Environment Variables > add CRM_SECRET = any long random text.
  4. Redeploy. Share your Vercel link: any new company can sign up and use its own CRM.

Notes
  * Uploaded document files: up to 3 MB each. Whole company data: about 3.8 MB of records.
    Upstash free plan may limit request size to ~1 MB; use the pay-as-you-go plan for bigger companies.
  * Company password cannot be recovered (stored only as a one-way hash). Keep it safe.
  * Opened as a local file (not hosted) the app shows "Server not connected".

Develop / test
  node scripts/build.mjs        bundle src/ -> dist/
  node scripts/cloud-test.mjs   API tests with fake database
  node scripts/dev-server.mjs   local server, then: python3 scripts/e2e-cloud.py   (needs playwright)
