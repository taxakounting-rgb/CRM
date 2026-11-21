// Opens the built file and fails on any console/page error. Needs: npm i -D playwright
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '../dist/Universal_CRM.html');
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(pathToFileURL(file).href);
await page.waitForTimeout(800);
const title = await page.title();
console.log('Title:', title);
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Smoke test passed: no console errors.');
