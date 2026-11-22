// Cloud backend for Universal CRM (Vercel serverless function, no npm dependencies).
// Multi-company: every company has its own account (company username + password) and its own private data.
// Storage: Upstash Redis (Vercel Marketplace -> Storage). Env vars:
//   KV_REST_API_URL + KV_REST_API_TOKEN   (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
//   CRM_SECRET  (any long random text; signs login tokens)
// The browser never sends a plain password: only a salted PBKDF2 hash.
import { createHmac, createHash, timingSafeEqual, randomUUID } from 'node:crypto';

const URL_ = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOK_ = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const SECRET = () => process.env.CRM_SECRET || createHash('sha256').update('crm|' + TOK_()).digest('hex');
const TOKEN_DAYS = 30;
const MAX_STATE = 3.8 * 1024 * 1024;
const MAX_BLOB = 4.2 * 1024 * 1024; // base64 characters (~3 MB file)

async function redis(...cmd) {
  const r = await fetch(URL_(), { method: 'POST', headers: { Authorization: 'Bearer ' + TOK_(), 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const getJ = async (k) => { const v = await redis('GET', k); return v ? JSON.parse(v) : null; };
const setJ = (k, v) => redis('SET', k, JSON.stringify(v));

const norm = (s) => String(s || '').trim().toLowerCase();
const okId = (s) => /^[a-z0-9._-]{3,30}$/.test(s);
const okVid = (s) => /^[A-Za-z0-9_-]{3,80}$/.test(String(s || ''));
const h2 = (hash) => createHmac('sha256', SECRET()).update('pw|' + hash).digest('hex');
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const fakeSalt = (id) => createHmac('sha256', SECRET()).update('salt|' + id).digest().subarray(0, 16).toString('base64');

function sign(ws) {
  const p = Buffer.from(JSON.stringify({ ws, exp: Date.now() + TOKEN_DAYS * 864e5 })).toString('base64url');
  return p + '.' + createHmac('sha256', SECRET()).update(p).digest('base64url');
}
function verify(t) {
  const [p, s] = String(t || '').split('.');
  if (!p || !s || !eq(createHmac('sha256', SECRET()).update(p).digest('base64url'), s)) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() ? o.ws : null; } catch { return null; }
}
async function limited(id) {
  const k = 'crm:rl:' + id; const n = await redis('INCR', k);
  if (n === 1) await redis('EXPIRE', k, 300);
  return n > 10;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const configured = !!(URL_() && TOK_());
  if (req.method === 'GET') return res.status(200).json({ ok: true, configured });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!configured) return res.status(503).json({ error: 'Cloud storage is not configured on the server.' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  try {
    const authed = () => verify(b.token);
    switch (b.action) {
      case 'available': { const id = norm(b.id); if (!okId(id)) return res.status(400).json({ error: 'Company username: 3-30 letters, numbers, dot, dash or underscore.' }); return res.json({ free: !(await getJ('crm:co:' + id)) }); }

      case 'signup': { // create a new company
        const id = norm(b.id); if (!okId(id)) return res.status(400).json({ error: 'Company username: 3-30 letters, numbers, dot, dash or underscore.' });
        if (!b.salt || !b.hash) return res.status(400).json({ error: 'Missing password.' });
        if (await getJ('crm:co:' + id)) return res.status(409).json({ error: 'This company username is already taken.' });
        const json = JSON.stringify(b.state || {}); if (!b.state || json.length > MAX_STATE) return res.status(413).json({ error: 'Data is too large for cloud sync.' });
        const ws = randomUUID();
        await setJ('crm:state:' + ws, b.state); await setJ('crm:meta:' + ws, { ver: 1, savedAt: Date.now(), co: id });
        await setJ('crm:co:' + id, { ws, salt: b.salt, h2: h2(b.hash) });
        return res.json({ ok: true, token: sign(ws), ver: 1, ws });
      }

      case 'challenge': { const id = norm(b.id); const e = okId(id) ? await getJ('crm:co:' + id) : null; return res.json({ salt: e ? e.salt : fakeSalt(id) }); }

      case 'login': { // company sign in
        const id = norm(b.id); if (!okId(id)) return res.status(401).json({ error: 'Invalid company username or password.' });
        if (await limited(id)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
        const e = await getJ('crm:co:' + id);
        if (!e || !eq(e.h2, h2(b.hash))) return res.status(401).json({ error: 'Invalid company username or password.' });
        const meta = await getJ('crm:meta:' + e.ws) || { ver: 0, savedAt: 0 };
        return res.json({ ok: true, token: sign(e.ws), ver: meta.ver, savedAt: meta.savedAt, ws: e.ws });
      }

      case 'meta': { const ws = authed(); if (!ws) return res.status(401).json({ error: 'Session expired.' }); const m = await getJ('crm:meta:' + ws) || { ver: 0, savedAt: 0 }; return res.json({ ver: m.ver, savedAt: m.savedAt, ws }); }

      case 'pull': { const ws = authed(); if (!ws) return res.status(401).json({ error: 'Session expired.' }); const m = await getJ('crm:meta:' + ws); const state = await getJ('crm:state:' + ws); return res.json({ ver: m ? m.ver : 0, savedAt: m ? m.savedAt : 0, ws, state }); }

      case 'push': {
        const ws = authed(); if (!ws) return res.status(401).json({ error: 'Session expired.' });
        const json = JSON.stringify(b.state || {}); if (!b.state || json.length > MAX_STATE) return res.status(413).json({ error: 'Data is too large for cloud sync (max ~3.8 MB). Remove big photos/logos.' });
        const m = await getJ('crm:meta:' + ws) || { ver: 0, savedAt: 0 };
        if (Number(b.ver) !== m.ver) return res.status(409).json({ error: 'conflict', ver: m.ver, savedAt: m.savedAt });
        await setJ('crm:state:' + ws, b.state);
        const next = Object.assign({}, m, { ver: m.ver + 1, savedAt: Date.now() });
        await setJ('crm:meta:' + ws, next);
        return res.json({ ok: true, ver: next.ver, savedAt: next.savedAt });
      }

      /* Uploaded document files (kept per company) */
      case 'blob_put': { const ws = authed(); if (!ws) return res.status(401).json({ error: 'Session expired.' }); if (!okVid(b.vid)) return res.status(400).json({ error: 'Bad file id.' }); if (typeof b.data !== 'string' || b.data.length > MAX_BLOB) return res.status(413).json({ error: 'File is too large for cloud storage (max about 3 MB).' }); await redis('SET', `crm:blob:${ws}:${b.vid}`, JSON.stringify({ type: String(b.type || '').slice(0, 100), data: b.data })); return res.json({ ok: true }); }
      case 'blob_get': { const ws = authed(); if (!ws) return res.status(401).json({ error: 'Session expired.' }); if (!okVid(b.vid)) return res.status(400).json({ error: 'Bad file id.' }); const v = await redis('GET', `crm:blob:${ws}:${b.vid}`); return res.json(v ? JSON.parse(v) : { data: null }); }
      case 'blob_del': { const ws = authed(); if (!ws) return res.status(401).json({ error: 'Session expired.' }); if (!okVid(b.vid)) return res.status(400).json({ error: 'Bad file id.' }); await redis('DEL', `crm:blob:${ws}:${b.vid}`); return res.json({ ok: true }); }
      default: return res.status(400).json({ error: 'Unknown action.' });
    }
  } catch (e) { return res.status(500).json({ error: 'Server error: ' + e.message }); }
}
