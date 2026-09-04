// Headless render check. Loads real pages over HTTP (the site fetches JSON, so file:// is
// not a valid test) and fails on any console error or missing expected content.
import { chromium } from '/scratch/ch29576/tools/webcheck/node_modules/playwright-core/index.mjs';
import fs from 'fs';

const base = process.argv[2] || 'http://127.0.0.1:8931';
const outdir = process.argv[3] || '/scratch/ch29576/poplar-717-atlas/shots';
fs.mkdirSync(outdir, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/scratch/ch29576/tools/webcheck/browsers/chromium-1234/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
let failures = 0;

async function check(name, hash, { expect = [], theme = null, wait = 700 } = {}) {
  const p = await browser.newPage({
    viewport: { width: 1180, height: 900 },
    colorScheme: theme === 'dark' ? 'dark' : 'light',
  });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('requestfailed', (r) => errs.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

  await p.goto(base + '/' + hash, { waitUntil: 'networkidle' });
  await p.waitForTimeout(wait);
  await p.screenshot({ path: `${outdir}/${name}.png`, fullPage: true });

  const text = await p.evaluate(() => document.getElementById('view').innerText);
  const missing = expect.filter((e) => !text.includes(e));
  const ok = !errs.length && !missing.length;
  if (!ok) failures++;
  console.log(`\n### ${name}  ${ok ? 'OK' : 'FAIL'}`);
  errs.forEach((e) => console.log('   !! ' + e));
  missing.forEach((m) => console.log(`   !! expected text not found: "${m}"`));
  if (ok) console.log(`   rendered ${text.length} chars`);
  await p.close();
}

await check('home', '#/', { expect: ['63,960', 'Modules', 'LSG pool'] });
await check('gene-lsg4', '#/gene/PtXaTreH.05G120200',
  { expect: ['PtXaTreH.05G120200', 'Chr05', 'Synteny', 'Populus', 'Dispensable'] });
await check('gene-private', '#/gene/PtXaTreH.01G006100',
  { expect: ['Private', 'P. alba'] });
await check('gene-hap2', '#/gene/PtXaAlbH.14G133000', { expect: ['HAP2', 'Chr14'] });
await check('gene-missing', '#/gene/PtXaTreH.99G999999', { expect: ['No such gene'] });
await check('module-synteny', '#/module/synteny',
  { expect: ['Class distribution', 'Core syntenic', 'Private', 'Tandem array'] });
await check('module-expression', '#/module/expression',
  { expect: ['652', 'Studies', 'WT-control samples per tissue'] });
await check('study-1', '#/study/1',
  { expect: ['Study 1', 'PRJEB22956', 'Georgii'] });
await check('gene-expr-lsg4', '#/gene/PtXaTreH.05G120200',
  { expect: ['Expression', 'Median TPM', 'catkin', 'Show all 652 samples'], wait: 900 });
await check('gene-annotated', '#/gene/PtXaTreH.01G000300',
  { expect: ['Function', 'Allele', 'Panel presence', 'AT1G55570'], wait: 1000 });
// 27,004 HAP2 genes have annotation but no Pfam (release gap); this gene is one of them.
await check('gene-hap2-pfam-gap', '#/gene/PtXaAlbH.01G000200',
  { expect: ['Function', 'Domain coverage is thinner on HAP2', 'AT1G55570'], wait: 1000 });
await check('home-dark', '#/', { expect: ['63,960'], theme: 'dark' });

// Search is the one interaction that has no index file behind it -- prove it resolves.
const p = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const serrs = [];
p.on('pageerror', (e) => serrs.push(e.message));
await p.goto(base + '/#/', { waitUntil: 'networkidle' });
await p.fill('#q', 'PtXaTreH.05G1202');
await p.waitForTimeout(900);
const hits = await p.$$eval('#hits a', (as) => as.map((a) => a.textContent.trim()).slice(0, 3));
await p.screenshot({ path: `${outdir}/search.png` });
let searchOk = hits.some((h) => h.includes('PtXaTreH.05G120200')) && !serrs.length;
console.log(`\n### search:id  ${searchOk ? 'OK' : 'FAIL'}\n   hits: ${JSON.stringify(hits)}`);
if (!searchOk) failures++;

for (const [label, q, want] of [['keyword', 'dehydrin', null], ['at-locus', 'AT1G55570', null]]) {
  await p.fill('#q', '');
  await p.fill('#q', q);
  await p.waitForTimeout(1100);
  const h = await p.$$eval('#hits a', (as) => as.map((a) => a.textContent.trim()).slice(0, 3));
  const ok = h.length > 0 && !h[0].startsWith('Nothing matches') && !serrs.length;
  if (!ok) failures++;
  console.log(`### search:${label} "${q}"  ${ok ? 'OK' : 'FAIL'}\n   hits: ${JSON.stringify(h)}`);
}
await p.screenshot({ path: `${outdir}/search-text.png` });
serrs.forEach((e) => console.log('   !! ' + e));
await p.close();

await browser.close();
console.log(`\n${failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED'}`);
process.exit(failures ? 1 : 0);
