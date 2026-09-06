// Headless render check. Loads real pages over HTTP (the site fetches JSON, so file:// is
// not a valid test) and fails on any console error or missing expected content.
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { chromium } = process.env.CI_CHROME
  ? require_('playwright-core')
  : await import('/scratch/ch29576/tools/webcheck/node_modules/playwright-core/index.mjs');
import fs from 'fs';

const base = process.argv[2] || 'http://127.0.0.1:8931';
const outdir = process.argv[3] || 'shots';   // relative, so CI can write it too
fs.mkdirSync(outdir, { recursive: true });

// Sapelo2 has no bundled browser download, so the path is pinned there; CI passes its own.
const SAPELO_CHROME = '/scratch/ch29576/tools/webcheck/browsers/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({
  executablePath: process.env.CI_CHROME || SAPELO_CHROME,
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
  // Case-insensitive: innerText returns RENDERED text, and `table.data th` is
  // text-transform:uppercase, so a header asserted as "% aligned" arrives as "% ALIGNED".
  // Styling should not decide whether a content assertion passes.
  const hay = text.toLowerCase();
  const missing = expect.filter((e) => !hay.includes(e.toLowerCase()));
  const ok = !errs.length && !missing.length;
  if (!ok) failures++;
  console.log(`\n### ${name}  ${ok ? 'OK' : 'FAIL'}`);
  errs.forEach((e) => console.log('   !! ' + e));
  missing.forEach((m) => console.log(`   !! expected text not found: "${m}"`));
  if (ok) console.log(`   rendered ${text.length} chars`);
  await p.close();
}

await check('home', '#/',
  { expect: ['63,960', 'Start here', 'Browse all genes', 'Modules', 'Before you cite anything',
             'lineage-specific candidates'] });
await check('gene-lsg4', '#/gene/PtXaTreH.05G120200',
  { expect: ['PtXaTreH.05G120200', 'Chr05', 'Synteny', 'Populus', 'Dispensable'] });
await check('gene-private', '#/gene/PtXaTreH.01G006100',
  { expect: ['Private', 'P. alba'] });
await check('gene-hap2', '#/gene/PtXaAlbH.14G133000', { expect: ['HAP2', 'Chr14'] });
await check('gene-missing', '#/gene/PtXaTreH.99G999999', { expect: ['No such gene'] });
await check('module-synteny', '#/module/synteny',
  { expect: ['Class distribution', 'Core syntenic', 'Private', 'Tandem array'] });
await check('module-expression', '#/module/expression',
  { expect: ['652', 'Studies', 'WT-control samples per tissue', 'leaf_young', 'leaf_old'] });
// Study 1 is the leaf_young/leaf_old case: if this ever again shows plain 'leaf' for
// every row, the tissue_analysis join (sources/sample_tissue_analysis.tsv) has regressed.
await check('study-1', '#/study/1',
  { expect: ['Study 1', 'PRJEB22956', 'Georgii', 'Tissue', 'Aligned %', 'control', 'leaf_old', 'leaf_young'], wait: 1000 });
// Study 29 carries the "prefer counts over TPM" flag (it has no per-sample notes).
await check('study-29', '#/study/29',
  { expect: ['Study 29', 'prefer est_counts'], wait: 1000 });
// Study 10 (Gerttula tension wood) is one of ten studies with per-sample processing notes;
// its note is the documented below-typical alignment rate, surfaced per row.
await check('study-10-notes', '#/study/10',
  { expect: ['Study 10', 'Notes', 'below-typical alignment rate'], wait: 1000 });
// This gene is the manually-verified leaf_young/leaf_old case (13.74 vs 4.52 TPM, was
// pooled to a single 8.12 before the 2026-09-05 fix) -- assert the split is visible.
await check('gene-expr-lsg4', '#/gene/PtXaTreH.05G120200',
  { expect: ['Expression', 'Median TPM', 'catkin', 'Show all 652 samples', 'leaf_young', 'leaf_old'], wait: 900 });
await check('gene-annotated', '#/gene/PtXaTreH.01G000300',
  { expect: ['Function', 'Allele', 'Panel presence', 'AT1G55570'], wait: 1000 });
// A gene with a reciprocal 1:1 P. trichocarpa syntenic ortholog (11,490 genes have none).
await check('gene-crossspecies', '#/gene/PtXaTreH.01G000600',
  { expect: ['P. trichocarpa ortholog', 'Potri.', 'reciprocal 1:1'], wait: 1000 });
// 27,004 HAP2 genes have annotation but no Pfam (release gap); this gene is one of them.
await check('gene-hap2-pfam-gap', '#/gene/PtXaAlbH.01G000200',
  { expect: ['Function', 'Domain coverage is thinner on HAP2', 'AT1G55570'], wait: 1000 });
await check('browse', '#/browse',
  { expect: ['Browse', 'Filters', 'Synteny class', '63,960', 'Export TSV', 'Saved sets'], wait: 1400 });
await check('module-phylostrat', '#/module/phylostrat',
  { expect: ['Genes per stratum', 'LSG pool', 'ambiguous', 'cellular organisms', 'log-scaled'] });
await check('gene-ambiguous-ps', '#/gene/PtXaTreH.06G037000',
  { expect: ['genEra flagged this gene as ambiguous'], wait: 900 });
await check('module-duplication', '#/module/duplication',
  { expect: ['Duplication', 'not genome-wide', 'phylostratum', 'Duplication class',
             'salicoid WGD', 'dispersed'] });
await check('gene-paralog', '#/gene/PtXaTreH.01G330600',
  { expect: ['Duplication', 'Paralog pairs'], wait: 900 });
// A curated tandem-array member: array identity, size, age bin and member links.
await check('gene-tandem-array', '#/gene/PtXaTreH.01G330700',
  { expect: ['Tandem array', 'Array members', 'neighbours on the chromosome'], wait: 1400 });
await check('module-protein', '#/module/protein',
  { expect: ['Protein', 'ESMFold', 'pLDDT proxy', 'never pooled', 'peptide',
             'r = −0.49', 'run length'] });
await check('gene-protein', '#/gene/PtXaTreH.01G000100',
  { expect: ['Protein', 'Predicted disorder', 'Duplication class'], wait: 1000 });
await check('module-about', '#/module/about',
  { expect: ['About & provenance', 'Known limitations', 'HAP2 domain annotation is thin',
             'audited out', 'derived here, not imported', 'Sources'] });
await check('home-dark', '#/', { expect: ['63,960', 'Start here'], theme: 'dark' });

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

// The condition view is the expression module's analytical payoff -- drive it.
{
  const cp = await browser.newPage({ viewport: { width: 1180, height: 1200 } });
  const cerrs = [];
  cp.on('pageerror', (e) => cerrs.push(e.message));
  cp.on('console', (m) => { if (m.type() === 'error') cerrs.push('console: ' + m.text()); });
  await cp.goto(base + '/#/gene/PtXaTreH.05G120200', { waitUntil: 'networkidle' });
  await cp.click('button:has-text("Show all 652 samples")');
  await cp.waitForTimeout(1500);
  const rows = await cp.$$eval('#view tbody tr', (ns) => ns.length);
  const txt = await cp.evaluate(() => document.getElementById('view').innerText.toLowerCase());
  await cp.click('button:has-text("By sample")');
  await cp.waitForTimeout(700);
  const sampleView = await cp.evaluate(() => document.getElementById('view').innerText.toLowerCase());
  const ok = rows > 150 && txt.includes('conditions across') && txt.includes('mean tpm')
    && sampleView.includes('every sample') && !cerrs.length;
  if (!ok) failures++;
  console.log(`\n### expression:conditions  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   condition rows=${rows}  sample-view toggle=${sampleView.includes('every sample')}`);
  cerrs.forEach((e) => console.log('   !! ' + e));
  await cp.close();
}

// The cross-module query is the whole point of browse -- drive it, don't just render it.
{
  const bp = await browser.newPage({ viewport: { width: 1180, height: 1200 } });
  const berrs = [];
  bp.on('pageerror', (e) => berrs.push(e.message));
  bp.on('console', (m) => { if (m.type() === 'error') berrs.push('console: ' + m.text()); });
  await bp.goto(base + '/#/browse', { waitUntil: 'networkidle' });
  await bp.waitForTimeout(1500);
  const readCount = () => bp.$eval('.stat .n', (n) => n.textContent.trim());
  const all = await readCount();
  await bp.selectOption('select >> nth=1', 'private_no_ortholog');   // synteny class
  await bp.waitForTimeout(400);
  const priv = await readCount();
  await bp.fill('input[type=number] >> nth=0', '18');                // phylostratum >= 18
  await bp.waitForTimeout(500);
  const privLsg = await readCount();
  await bp.screenshot({ path: `${outdir}/browse-query.png`, fullPage: true });
  const n = (s) => parseInt(s.replace(/,/g, ''), 10);
  const ok = n(all) === 63960 && n(priv) > 0 && n(priv) < n(all)
    && n(privLsg) > 0 && n(privLsg) < n(priv) && !berrs.length;
  if (!ok) failures++;
  console.log(`\n### browse:query  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   all=${all}  private=${priv}  private+PS>=18=${privLsg}`);
  berrs.forEach((e) => console.log('   !! ' + e));
  await bp.close();
}
serrs.forEach((e) => console.log('   !! ' + e));
await p.close();

await browser.close();
console.log(`\n${failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED'}`);
process.exit(failures ? 1 : 0);
