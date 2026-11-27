// Bundles src/ (css + js in order.json order) into one offline HTML file in dist/.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

const order = JSON.parse(read(src, 'order.json'));
const css = fs.readdirSync(path.join(src, 'css')).filter((f) => f.endsWith('.css')).sort().map((f) => read(src, 'css', f)).join('\n');
const js = order.map((f) => read(src, 'js', f)).join('\n');

// Syntax check the bundled script before writing anything.
const tmp = path.join(os.tmpdir(), 'crm-bundle-check.js');
fs.writeFileSync(tmp, js);
execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' });

const page = read(src, 'index.html').replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'Universal_CRM.html'), page);
fs.writeFileSync(path.join(root, 'dist', 'index.html'), page);
console.log(`Built dist/Universal_CRM.html (${(page.length / 1024).toFixed(0)} KB)`);
