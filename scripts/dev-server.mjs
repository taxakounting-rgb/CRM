// Local test server: serves dist/ and /api/sync with an in-memory fake database.  node scripts/dev-server.mjs  (then python3 scripts/e2e-cloud.py)
import http from 'node:http'; import { readFileSync } from 'node:fs';
const mem = new Map();
globalThis.__realfetch = globalThis.fetch;
globalThis.fetch = async (u, o) => { const [c, k, v] = JSON.parse(o.body); let r = null; if (c === 'GET') r = mem.get(k) ?? null; else if (c === 'SET') { mem.set(k, v); r = 'OK'; } else if (c === 'DEL') r = mem.delete(k) ? 1 : 0; else if (c === 'INCR') { const n = (+mem.get(k) || 0) + 1; mem.set(k, String(n)); r = n; } else if (c === 'EXPIRE') r = 1; return { json: async () => ({ result: r }) }; };
process.env.KV_REST_API_URL = 'http://fake'; process.env.KV_REST_API_TOKEN = 't'; process.env.CRM_SECRET = 's';
const { default: handler } = await import(new URL('../api/sync.js', import.meta.url).href);
http.createServer((req, res) => {
  if (req.url.startsWith('/api/sync')) { let d = ''; req.on('data', (c) => d += c); req.on('end', () => { const rs = { setHeader: (k, v) => res.setHeader(k, v), status(c) { res.statusCode = c; return this; }, json(j) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(j)); } }; handler({ method: req.method, body: d ? JSON.parse(d) : null }, rs); }); return; }
  res.setHeader('Content-Type', 'text/html'); res.end(readFileSync(new URL('../dist/index.html', import.meta.url)));
}).listen(4173);
