// Bundles src/ into one offline HTML file: dist/Universal_CRM.html
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const cssFiles = readdirSync(join(root, 'src/css')).filter((f) => f.endsWith('.css')).sort();
const order = JSON.parse(read('src/order.json'));
const missing = order.filter((f) => !existsSync(join(root, 'src/js', f)));
if (missing.length) { console.error('Missing JS files listed in order.json:', missing.join(', ')); process.exit(1); }

const css = cssFiles.map((f) => read('src/css/' + f)).join('\n');
const js = order.map((f) => `/* ---- ${f} ---- */\n` + read('src/js/' + f)).join('\n');

// Syntax check before writing
const tmp = join(root, 'dist', '.bundle-check.js');
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(tmp, js);
try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' }); }
catch { console.error('JS syntax error in bundle'); process.exit(1); }

// Escape closing script tags inside the bundle
const safeJs = js.replace(/<\/script/gi, '<\\/script');
const html = read('src/index.html').replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => safeJs);
writeFileSync(join(root, 'dist/Universal_CRM.html'), html);
writeFileSync(join(root, 'dist/index.html'), html); // Vercel / static hosting entry point
console.log(`Built dist/Universal_CRM.html (${(html.length / 1024).toFixed(0)} KB)`);

rmSync(join(root, 'dist', '.bundle-check.js'), { force: true });
