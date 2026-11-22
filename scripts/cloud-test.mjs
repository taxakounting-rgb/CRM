// Tests api/sync.js against an in-memory fake of the Upstash REST API (no network needed).
const mem = new Map(); const ttl = new Map();
globalThis.fetch = async (_url, o) => {
  const [c, k, v] = JSON.parse(o.body); let result = null;
  if (c === 'GET') result = mem.has(k) ? mem.get(k) : null;
  else if (c === 'SET') { mem.set(k, v); result = 'OK'; }
  else if (c === 'DEL') { result = mem.delete(k) ? 1 : 0; }
  else if (c === 'INCR') { const n = (Number(mem.get(k)) || 0) + 1; mem.set(k, String(n)); result = n; }
  else if (c === 'EXPIRE') { ttl.set(k, v); result = 1; }
  return { json: async () => ({ result }) };
};
process.env.KV_REST_API_URL = 'http://fake'; process.env.KV_REST_API_TOKEN = 'tok'; process.env.CRM_SECRET = 'secret';
const { default: handler } = await import('../api/sync.js');
const call = async (body, method = 'POST') => { let code = 200, out; const res = { setHeader() {}, status(c) { code = c; return this; }, json(j) { out = j; return this; } }; await handler({ method, body }, res); return { code, ...out }; };
let fails = 0; const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

ok('GET reports configured', (await call(null, 'GET')).configured === true);
ok('company username free', (await call({ action: 'available', id: 'acme' })).free === true);
ok('bad company username rejected', (await call({ action: 'available', id: 'a b' })).code === 400);
const su = await call({ action: 'signup', id: 'Acme', salt: 'SALT1', hash: 'HASH1', state: { users: [], clients: [] } });
ok('company signup ok + token', su.ok && su.token && su.ver === 1 && su.ws);
ok('company username now taken', (await call({ action: 'available', id: 'acme' })).free === false);
ok('duplicate company rejected', (await call({ action: 'signup', id: 'acme', salt: 'x', hash: 'y', state: {} })).code === 409);
const su2 = await call({ action: 'signup', id: 'beta', salt: 'SB', hash: 'HB', state: { users: [{ username: 'x' }], secret: 'beta-data' } });
ok('second company created', su2.ok && su2.ws !== su.ws);
ok('challenge returns real salt', (await call({ action: 'challenge', id: 'ACME' })).salt === 'SALT1');
const fake = await call({ action: 'challenge', id: 'nobody' });
ok('unknown company gets stable fake salt', fake.salt && fake.salt === (await call({ action: 'challenge', id: 'nobody' })).salt);
ok('wrong password rejected', (await call({ action: 'login', id: 'acme', hash: 'BAD' })).code === 401);
const lg = await call({ action: 'login', id: 'acme', hash: 'HASH1' });
ok('company login ok', lg.ok && lg.token && lg.ver === 1 && lg.ws === su.ws);
const lgB = await call({ action: 'login', id: 'beta', hash: 'HB' });
const pullA = await call({ action: 'pull', token: lg.token });
ok('company A pulls only its own data', pullA.state.users.length === 0 && !pullA.state.secret);
ok('company B pulls its own data', (await call({ action: 'pull', token: lgB.token })).state.secret === 'beta-data');
ok('bad token rejected', (await call({ action: 'pull', token: 'abc.def' })).code === 401);
const push = await call({ action: 'push', token: lg.token, ver: 1, state: { users: [{ username: 'admin' }], clients: [{ id: 1 }] } });
ok('push ok -> ver 2', push.ok && push.ver === 2);
ok('stale push -> conflict 409', (await call({ action: 'push', token: lg.token, ver: 1, state: { users: [] } })).code === 409);
ok('tampered token rejected', (await call({ action: 'pull', token: lg.token.slice(0, -2) + 'xx' })).code === 401);
ok('file upload ok', (await call({ action: 'blob_put', token: lg.token, vid: 'v123abc', type: 'image/png', data: 'AAAA' })).ok);
ok('file download ok', (await call({ action: 'blob_get', token: lg.token, vid: 'v123abc' })).data === 'AAAA');
ok('other company cannot read the file', (await call({ action: 'blob_get', token: lgB.token, vid: 'v123abc' })).data === null);
ok('oversized file rejected', (await call({ action: 'blob_put', token: lg.token, vid: 'v999abc', data: 'A'.repeat(4.5 * 1024 * 1024) })).code === 413);
ok('file delete ok', (await call({ action: 'blob_del', token: lg.token, vid: 'v123abc' })).ok && (await call({ action: 'blob_get', token: lg.token, vid: 'v123abc' })).data === null);
let limited = false; for (let i = 0; i < 12; i++) if ((await call({ action: 'login', id: 'acme', hash: 'BAD' })).code === 429) limited = true;
ok('brute-force rate limit', limited);
console.log(fails ? `${fails} FAILED` : 'All cloud API tests passed'); process.exit(fails ? 1 : 0);
