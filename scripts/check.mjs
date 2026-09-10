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
// PAV (TODO 21): a DIAMOND-confirmed hemizygous gene, and a "not confirmed" one whose
// contradicting hit is named -- so a wrong-branch bug (the confirmed/not-confirmed text
// swapped) can't hide behind whichever branch happens to render.
await check('gene-pav-confirmed', '#/gene/PtXaTreH.12G001400',
  { expect: ['Presence', 'HAP1-only', 'confirmed', 'DIAMOND PAV'], wait: 900 });
await check('gene-pav-not-confirmed', '#/gene/PtXaTreH.T006000',
  { expect: ['Presence', 'not confirmed', 'detection gap', 'PtXaAlbH.14G167700'], wait: 900 });
// LSG evidence-quality (TODO 23): a flagged pool gene and a clean one, and -- because the
// forbidden fields are a real publication risk -- assert neither ever appears in the
// rendered page, not just that the two intended checks pass.
await check('gene-lsg-qc-flagged', '#/gene/PtXaTreH.12G056600',
  { expect: ['Evidence quality', 'tblastn', 'retracts the young call', 'Flags, not filters'], wait: 900 });
await check('gene-lsg-qc-clean', '#/gene/PtXaTreH.01G001500',
  { expect: ['Evidence quality', 'No evidence-quality flag raised'], wait: 900 });
{
  const fp = await browser.newPage();
  const ferrs = [];
  fp.on('pageerror', (e) => ferrs.push(e.message));
  await fp.goto(base + '/#/gene/PtXaTreH.12G056600', { waitUntil: 'networkidle' });
  await fp.waitForTimeout(900);
  const ftext = await fp.evaluate(() => document.getElementById('view').innerText);
  const clean = !/qc_survivor|in_idesia_corrected_pool/i.test(ftext) && !ferrs.length;
  if (!clean) failures++;
  console.log(`\n### lsg-qc:no-forbidden-fields  ${clean ? 'OK' : 'FAIL'}`);
  await fp.close();
}
// --- v0.6: the pool correction (TODO 26/27), the re-search (28) and Ka/Ks (29) ---------
// Each of these renders something the site did not say before, so each gets a case. The
// pool one matters most: the site published the withdrawn pool for four days, and a check
// that only asserts "a pool number renders" would have passed throughout.
await check('gene-left-the-pool', '#/gene/PtXaTreH.05G120200',
  { expect: ['Changed in Sept 2026', 'PS18', 'left the pool',
             'lineage-specific candidate under the old panel'], wait: 900 });
await check('gene-ps19-to-ps18', '#/gene/PtXaAlbH.17G073600',
  { expect: ['Changed in Sept 2026', 'hybrid-only stratum to the Populus-wide one',
             '179 genes made exactly this move'], wait: 900 });
// The abSENSE calibration must travel with the flag, not sit in a doc nobody opens.
await check('gene-absense-calibration', '#/gene/PtXaTreH.12G056600',
  { expect: ['Evidence quality', 'Salix purpurea', '59 to 61%',
             'over-calls rather than under-calls'], wait: 900 });
await check('gene-peptide-detected', '#/gene/PtXaAlbH.17G050300',
  { expect: ['Peptide evidence', 'detected in', 'spectrum match',
             'tryptic peptide', 'P. tomentosa'], wait: 1000 });
// A gene that could not have been found is not the same as one that was looked for and
// missed. If these two ever render identically the layer has lost its point.
await check('gene-undetectable', '#/gene/PtXaAlbH.17G041200',
  { expect: ['Peptide evidence', 'undetectable',
             'could not have been found however abundant'], wait: 1000 });
await check('gene-selection', '#/gene/PtXaTreH.05G120200',
  { expect: ['Selection', 'vs P. trichocarpa', 'Potri.', 'codons', 'purifying selection',
             'Nei'], wait: 900 });
await check('gene-no-ortholog', '#/gene/PtXaAlbH.17G052200',
  { expect: ['Selection', 'not defined for this gene', 'structural rather than missing',
             'nothing to measure against'], wait: 900 });
await check('browse-omega-column', '#/browse',
  { expect: ['\u03c9', 'MS', 'Peptide-detected'], wait: 1200 });

// Chromatin (TODO 30). Two cases, and the second is the point of the layer: a gene whose
// ortholog is SILENT in leaf must not render four absent marks, which would read as an
// absence of regulation when it is an absence of relevant data.
await check('gene-chromatin', '#/gene/PtXaTreH.01G000700',
  { expect: ['Chromatin', 'P. trichocarpa leaf', 'Accessible chromatin', 'H3K4me3',
             'RPK', 'never where transcription starts'], wait: 1000 });
await check('gene-chromatin-silent', '#/gene/PtXaTreH.01G000100',
  { expect: ['Chromatin', 'not expressed in the leaf libraries',
             'would read as an absence of regulation'], wait: 1000 });

await check('module-protein', '#/module/protein',
  { expect: ['Protein', 'ESMFold', 'pLDDT proxy', 'never pooled', 'peptide',
             'r = −0.49', 'run length', 'monotonically with gene age',
             'undetectable this way', 'contain no 717 protein'] });
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

// Promoter card: text-based, so a plain content assertion is enough. Uses the known
// tata_core=True gene so the "canonical TATA box" sentence is exercised, not just the
// "no TATA" branch -- a wrong-branch bug (found once already: an inverted tata_pos
// distance) would otherwise hide behind whichever branch happened to render.
await check('gene-promoter-tata-true', '#/gene/PtXaTreH.01G000900',
  { expect: ['Promoter', 'Canonical TATA box', 'core promoter', 'bZIP', 'not comparable'] });
await check('gene-promoter-tata-false', '#/gene/PtXaTreH.05G120200',
  { expect: ['Promoter', 'No canonical core-promoter TATA box'] });

// Search results page: a broad query ("kinase") must produce more matches than the
// dropdown shows, land on the results page with the true total, and carry comparison
// columns a dropdown row cannot -- that is the entire point of the page.
{
  const sp = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const serrs = [];
  sp.on('pageerror', (e) => serrs.push(e.message));
  sp.on('console', (m) => { if (m.type() === 'error') serrs.push(m.text()); });
  await sp.goto(base + '/', { waitUntil: 'networkidle' });
  await sp.fill('#q', 'kinase');
  await sp.waitForTimeout(1200);
  const seeAll = await sp.$('#hits a:last-child');
  const seeAllText = seeAll ? await seeAll.textContent() : '';
  await sp.goto(base + '/#/search/kinase', { waitUntil: 'networkidle' });
  await sp.waitForTimeout(1000);
  const stext = await sp.evaluate(() => document.getElementById('view').innerText);
  const rows = await sp.$$eval('table.compare tbody tr', (trs) => trs.length);
  const ok = /compare them all/.test(seeAllText) && stext.includes('matches')
    && rows > 20 && stext.includes('page 1 of') && !serrs.length;
  if (!ok) failures++;
  console.log(`
### search-results-refinement  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   dropdown link: "${seeAllText}"  rows shown: ${rows}`);
  serrs.slice(0, 2).forEach((e) => console.log('   ERR ' + e.slice(0, 110)));
  await sp.screenshot({ path: `${outdir}/search-results.png` });
  await sp.close();
}

// The locus card is a canvas, so a text assertion cannot see it. Check that the
// canvas is actually PAINTED (more than one colour sampled), that the DPR backing
// buffer matches, and that a phone viewport neither scrolls horizontally nor
// shrinks a control below the 44px comfort target.
for (const [label, vw, vh, dpr] of [['locus-desktop', 1180, 900, 1], ['locus-phone', 375, 667, 2]]) {
  const lp = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  const lerrs = [];
  lp.on('pageerror', (e) => lerrs.push(e.message));
  lp.on('console', (m) => { if (m.type() === 'error') lerrs.push(m.text()); });
  await lp.goto(base + '/#/gene/PtXaTreH.05G120200', { waitUntil: 'networkidle' });
  await lp.waitForTimeout(1400);
  const r = await lp.evaluate(() => {
    const cv = document.querySelector('.locus-canvas');
    if (!cv) return { missing: true };
    const box = cv.getBoundingClientRect();
    const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const seen = new Set();
    for (let i = 0; i < px.length; i += 4 * 97) seen.add(px[i] + ',' + px[i + 1] + ',' + px[i + 2]);
    // Scoped to the SAME card as the canvas above -- .locus-btn is now also used by the
    // Expression scrubber card (added 2026-09-08), a legitimate second user of the same
    // touch-target-compliant class, not a regression. A page-wide count would conflate
    // the two cards' controls; per-card is what "the Locus card's 4 controls" ever meant.
    const btns = [...cv.closest('.card').querySelectorAll('.locus-btn')]
      .map((b) => b.getBoundingClientRect()).map((q) => Math.min(q.width, q.height));
    return {
      colours: seen.size, ratio: +(cv.width / box.width).toFixed(2),
      minBtn: btns.length ? Math.min(...btns) : 0, nBtn: btns.length,
      hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  const ok = !r.missing && r.colours > 3 && r.minBtn >= 44 && r.nBtn === 4
    && !r.hscroll && r.ratio === Math.min(dpr, 2) && !lerrs.length;
  if (!ok) failures++;
  console.log(`\n### ${label}  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   colours=${r.colours} dprRatio=${r.ratio} minBtn=${r.minBtn}px `
    + `buttons=${r.nBtn} h-scroll=${r.hscroll}`);
  lerrs.slice(0, 2).forEach((e) => console.log('   ERR ' + e.slice(0, 110)));
  await lp.screenshot({ path: `${outdir}/${label}.png` });
  await lp.close();
}

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

// ComBat-seq (TODO 18) is opt-in per gene: the toggle must appear on an eligible gene and
// switch the rendered numbers, and must be ABSENT on an ineligible one -- offering it with
// nothing behind it would be worse than not offering it at all.
{
  const gp = await browser.newPage({ viewport: { width: 1180, height: 1200 } });
  const gerrs = [];
  gp.on('pageerror', (e) => gerrs.push(e.message));
  gp.on('console', (m) => { if (m.type() === 'error') gerrs.push('console: ' + m.text()); });
  await gp.goto(base + '/#/gene/PtXaTreH.05G120200', { waitUntil: 'networkidle' }); // has x.cb
  await gp.click('button:has-text("Show all 652 samples")');
  await gp.waitForTimeout(1200);
  const rawFirstRow = await gp.$eval('#expr-profile tbody tr', (n) => n.innerText);
  await gp.click('button:has-text("ComBat-corrected")');
  await gp.waitForTimeout(900);
  const cbFirstRow = await gp.$eval('#expr-profile tbody tr', (n) => n.innerText);
  const cbText = await gp.evaluate(() => document.getElementById('view').innerText.toLowerCase());
  const eligibleOk = cbText.includes('cross-study') && rawFirstRow !== cbFirstRow && !gerrs.length;
  if (!eligibleOk) failures++;
  console.log(`
### combat:eligible  ${eligibleOk ? 'OK' : 'FAIL'}`);
  console.log(`   raw row="${rawFirstRow.replace(/\n/g, ' ')}"`);
  console.log(`   combat row="${cbFirstRow.replace(/\n/g, ' ')}"`);
  gerrs.forEach((e) => console.log('   !! ' + e));
  await gp.close();

  const ip = await browser.newPage({ viewport: { width: 1180, height: 1200 } });
  await ip.goto(base + '/#/gene/PtXaTreH.T000100', { waitUntil: 'networkidle' }); // no x.cb
  await ip.click('button:has-text("Show all 652 samples")');
  await ip.waitForTimeout(900);
  const hasToggle = (await ip.$('button:has-text("ComBat-corrected")')) !== null;
  const ineligibleOk = !hasToggle;
  if (!ineligibleOk) failures++;
  console.log(`### combat:ineligible  ${ineligibleOk ? 'OK' : 'FAIL'}  (toggle present: ${hasToggle})`);
  await ip.close();
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

// Genome map (section 2.4): the overview renders and is clickable through to a
// chromosome, and the chromosome view is clickable through to a real gene page --
// driven end to end, not just rendered, since the whole point is the click-through.
await check('map-overview', '#/map',
  { expect: ['Genome map', 'Colour by', 'Click a chromosome to zoom in'], wait: 900 });
await check('map-hap2', '#/map/hap2',
  { expect: ['Genome map', 'HAP2 (AlbH)'], wait: 900 });
{
  const mp = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const merrs = [];
  mp.on('pageerror', (e) => merrs.push(e.message));
  mp.on('console', (m) => { if (m.type() === 'error') merrs.push(m.text()); });
  await mp.goto(base + '/#/map/hap1/Chr19', { waitUntil: 'networkidle' });
  await mp.waitForTimeout(900);
  const chrText = await mp.evaluate(() => document.getElementById('view').innerText);
  // "genes" and "Mb" are drawn INSIDE the canvas (like the locus card's own captions),
  // invisible to innerText -- only assert on real DOM text here.
  const hasChr = chrText.includes('Chr19') && chrText.includes('HAP1 (TreH)')
    && chrText.includes('← genome');
  await mp.click('.locus-canvas', { position: { x: 400, y: 84 } });
  await mp.waitForTimeout(900);
  const afterClick = mp.url();
  const navigated = /#\/(gene\/PtXaTreH\.19|map\/hap1$)/.test(afterClick);
  const ok = hasChr && navigated && !merrs.length;
  if (!ok) failures++;
  console.log(`\n### map:chromosome-drilldown  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   chromosome view rendered: ${hasChr}   url after click: ${afterClick}`);
  merrs.forEach((e) => console.log('   !! ' + e));
  await mp.close();
}

// Phytozome links (fixed 2026-09-08): the previous constant had no genome segment at
// all and 404'd for every gene. Verify actual href values, not just that a link with
// some text exists -- a wrong destination renders identically to a right one.
{
  const lp = await browser.newPage();
  await lp.goto(base + '/#/gene/PtXaTreH.01G000600', { waitUntil: 'networkidle' });
  await lp.waitForTimeout(900);
  const hrefs = await lp.$$eval('a', (as) => as.map((a) => a.href));
  const hap1Report = hrefs.includes('https://phytozome-next.jgi.doe.gov/report/gene/PtremulaxPopulusalbaHAP1_v5_1/PtXaTreH.01G000600');
  const ptriReport = hrefs.some((h) => h.startsWith('https://phytozome-next.jgi.doe.gov/report/gene/Ptrichocarpa_v4_1/Potri.'));
  const browserLink = hrefs.some((h) => h.startsWith('https://phytozome-next.jgi.doe.gov/jbrowse/index.html?')
    && h.includes('data=genomes%2FPtremulaxPopulusalbaHAP1_v5_1') && h.includes('loc=Chr01%3A'));
  await lp.close();

  const lp2 = await browser.newPage();
  await lp2.goto(base + '/#/gene/PtXaAlbH.05G122300', { waitUntil: 'networkidle' });
  await lp2.waitForTimeout(900);
  const hrefs2 = await lp2.$$eval('a', (as) => as.map((a) => a.href));
  const hap2Report = hrefs2.includes('https://phytozome-next.jgi.doe.gov/report/gene/PtremulaxPopulusalbaHAP2_v5_1/PtXaAlbH.05G122300');
  await lp2.close();

  const ok = hap1Report && ptriReport && browserLink && hap2Report;
  if (!ok) failures++;
  console.log(`\n### phytozome-links  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   hap1 report=${hap1Report}  ptri report=${ptriReport}  jbrowse=${browserLink}  hap2 report=${hap2Report}`);
}

// Mirror (plan section 2.2): renders on a gene with a real allele partner, shows both a
// fully-resolved neighbourhood and one with genuine hemizygous gaps (no ribbon), and a
// click on the OTHER haplotype's strip actually navigates there -- driven, not just
// rendered, since the whole point is comparing two independently-coordinated genomes.
await check('mirror-full', '#/gene/PtXaTreH.05G120200',
  { expect: ['Mirror', 'both haplotypes', 'HAP1 (TreH) above', 'HAP2 (AlbH) below'], wait: 1200 });
// This gene's neighbourhood runs into a real HAP1-only stretch (verified against pav.confirmed
// directly): the card must say so in its own count, not just render silently.
await check('mirror-hemizygous-gap', '#/gene/PtXaTreH.12G001200',
  { expect: ['Mirror', 'with none'], wait: 1200 });
{
  const mp = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const merrs = [];
  mp.on('pageerror', (e) => merrs.push(e.message));
  mp.on('console', (m) => { if (m.type() === 'error') merrs.push(m.text()); });
  await mp.goto(base + '/#/gene/PtXaTreH.05G120200', { waitUntil: 'networkidle' });
  await mp.waitForTimeout(1200);
  const h = await mp.$('h2:has-text("Mirror")');
  await h.scrollIntoViewIfNeeded();
  await mp.waitForTimeout(500);
  const canvases = await mp.$$('.locus-canvas');
  const box = await canvases[1].boundingBox();  // [0] is the Locus card's own canvas
  await mp.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.8);
  await mp.waitForTimeout(700);
  const navigated = /#\/gene\/PtXaAlbH\./.test(mp.url());
  const ok = navigated && !merrs.length;
  if (!ok) failures++;
  console.log(`\n### mirror:cross-haplotype-click  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   url after click: ${mp.url()}`);
  merrs.forEach((e) => console.log('   !! ' + e));
  await mp.close();
}

// Expression scrubber (plan section 2.3): renders, defaults to the focal gene's own top
// tissue, and switching to contrast mode paints and captions correctly even with NO
// manual selection -- a real bug caught during development, where the <select> showed a
// value the browser auto-picks with no 'change' event to hook, while the caption and
// canvas still showed stale tissue-mode content. Checked here so it cannot silently
// return.
await check('scrubber-tissue-default', '#/gene/PtXaTreH.05G120200',
  { expect: ['Expression scrubber', 'By tissue', 'By contrast', 'Median TPM in catkin'], wait: 1200 });
{
  const sp = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const serrs2 = [];
  sp.on('pageerror', (e) => serrs2.push(e.message));
  sp.on('console', (m) => { if (m.type() === 'error') serrs2.push(m.text()); });
  await sp.goto(base + '/#/gene/PtXaTreH.05G120200', { waitUntil: 'networkidle' });
  await sp.waitForTimeout(1200);
  const h = await sp.$('h2:has-text("Expression scrubber")');
  await h.scrollIntoViewIfNeeded();
  await sp.waitForTimeout(500);
  // Switch mode WITHOUT ever touching the <select> -- the exact scenario that failed.
  await sp.click('button:has-text("By contrast")');
  await sp.waitForTimeout(700);
  const text = await sp.evaluate(() => document.getElementById('view').innerText);
  const ok = text.includes('log2((mean perturbation') && text.includes('Orange = higher') && !serrs2.length;
  if (!ok) failures++;
  console.log(`\n### scrubber:contrast-mode-no-manual-select  ${ok ? 'OK' : 'FAIL'}`);
  serrs2.forEach((e) => console.log('   !! ' + e));
  // Click-through still works from this card too.
  const canvases = await sp.$$('.locus-canvas');
  const box = await canvases[canvases.length - 1].boundingBox();
  await sp.mouse.click(box.x + box.width * 0.05, box.y + box.height * 0.5);
  await sp.waitForTimeout(600);
  const navigated = sp.url() !== base + '/#/gene/PtXaTreH.05G120200';
  if (!navigated) failures++;
  console.log(`### scrubber:click-through  ${navigated ? 'OK' : 'FAIL'}  url: ${sp.url()}`);
  await sp.close();
}

// The scrubber's own tissue chips and mode buttons are real tap targets (10 chips, easy
// to reach for on a phone) -- they must meet the same 44px floor as every other button
// on the site, not a smaller one because there happen to be more of them. Caught once
// already in development (an inline min-width:0 silently opted them out); asserted here
// so it cannot regress silently a second time.
{
  const tp = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  await tp.goto(base + '/#/gene/PtXaTreH.05G120200', { waitUntil: 'networkidle' });
  await tp.waitForTimeout(1200);
  const h = await tp.$('h2:has-text("Expression scrubber")');
  await h.scrollIntoViewIfNeeded();
  const r = await tp.evaluate(() => {
    const card = [...document.querySelectorAll('.card')]
      .find((c) => c.querySelector('h2')?.textContent.includes('Expression scrubber'));
    const btns = [...card.querySelectorAll('.locus-btn')]
      .map((b) => b.getBoundingClientRect()).map((q) => Math.min(q.width, q.height));
    return { n: btns.length, min: btns.length ? Math.min(...btns) : 0 };
  });
  const ok = r.n === 12 && r.min >= 44;  // 2 mode buttons + 10 tissue chips
  if (!ok) failures++;
  console.log(`\n### scrubber:touch-targets  ${ok ? 'OK' : 'FAIL'}  n=${r.n} min=${r.min}px`);
  await tp.close();
}

await browser.close();
console.log(`\n${failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED'}`);
process.exit(failures ? 1 : 0);
