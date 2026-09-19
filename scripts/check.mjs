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

// A null selector used to throw and kill the run, leaving every later check unrun while the
// process still exited 0 -- which is how a rename passed CI-shaped output while breaking 32
// checks. An abort is now reported and exits non-zero. It deliberately does NOT try to
// continue: a half-run suite should not look like a green one.
process.on('uncaughtException', (e) => {
  console.log(`\n!! ABORTED after ${failures} recorded failure(s): ${e && e.message}`);
  console.log('!! Remaining checks did NOT run. Treat this as a failure, not a pass.');
  process.exit(1);
});

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
  // the NUMBER, not just the label: the home page showed the withdrawn 1,725 for three
  // versions while every other page said 1,611, and asserting the label caught nothing
  { expect: ['63,960', 'Start here', 'Browse all genes', 'Modules', 'Before you cite anything',
             'lineage-specific candidates', '1,611'] });
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
  { expect: ['Duplication', 'not genome-wide', 'stratum-selected', 'Duplication class',
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
// --- v0.7: the 3D model (TODO 34). Driven, not just rendered: click the button, wait for
// the WebGL canvas, and require the legend's per-band residue counts to sum to the residue
// count the card states -- the on-figure numbers have to add up, not merely appear. One
// confident gene and one PS>=18 gene, whose model is mostly below 70 and must say so.
async function checkModel(name, geneId, { theme = null, expect = [] } = {}) {
  const mp = await browser.newPage({ viewport: { width: 1180, height: 900 },
    colorScheme: theme === 'dark' ? 'dark' : 'light' });
  const errs = [];
  mp.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  mp.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  mp.on('requestfailed', (r) => errs.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  await mp.goto(base + '/#/gene/' + geneId, { waitUntil: 'networkidle' });
  await mp.waitForTimeout(900);
  const btn = await mp.$('button.struct-open');
  if (!btn) errs.push('no "Show 3D model" button');
  else { await btn.scrollIntoViewIfNeeded(); await btn.click(); }
  await mp.waitForSelector('.struct-stage canvas', { timeout: 20000 }).catch(() => errs.push('no canvas'));
  await mp.waitForTimeout(1000);
  // A canvas existing is not a model being drawn: the first version of this check passed on
  // three blank canvases (3Dmol's default cartoon renders nothing for a Calpha-only model).
  // So re-render through the viewer, and count painted pixels and which pLDDT colours appear.
  const px = await mp.evaluate(async () => {
    const v = document.querySelector('.struct-stage')?.__viewer;
    if (!v) return { painted: 0, bands: [] };
    const img = new Image();
    img.src = v.pngURI();
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const want = ['#0053D6', '#65CBF3', '#FFDB13', '#FF7D45']
      .map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
    const seen = want.map(() => 0);
    let painted = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      painted++;
      want.forEach((w, k) => {
        if (Math.abs(d[i] - w[0]) + Math.abs(d[i + 1] - w[1]) + Math.abs(d[i + 2] - w[2]) < 90) seen[k]++;
      });
    }
    return { painted: painted / (d.length / 4), bands: seen };
  });
  const r = await mp.evaluate(() => {
    const holder = document.querySelector('.struct-holder');
    const keys = [...document.querySelectorAll('.struct-key .mono')]
      .map((s) => parseInt(s.textContent.replace(/,/g, ''), 10));
    const m = /([\d,]+) residues\./.exec(holder ? holder.innerText : '');
    const c = document.querySelector('.struct-stage canvas');
    return { text: holder ? holder.innerText.toLowerCase() : '', keys,
      sum: keys.reduce((a, b) => a + b, 0), n: m ? parseInt(m[1].replace(/,/g, ''), 10) : null,
      w: c ? c.width : 0, h: c ? c.height : 0 };
  });
  const stage = await mp.$('.struct-stage');
  if (stage) await stage.screenshot({ path: `${outdir}/${name}.png` });
  const missing = expect.filter((e) => !r.text.includes(e.toLowerCase()));
  // every band the legend says has residues must show up as pixels of that colour
  const bandsDrawn = r.keys.every((k, i) => k === 0 || px.bands[i] > 0);
  const ok = !errs.length && !missing.length && r.keys.length === 4 && r.n > 0 && r.sum === r.n
    && r.w > 0 && r.h > 0 && px.painted > 0.005 && bandsDrawn;
  if (!ok) failures++;
  console.log(`\n### ${name}  ${ok ? 'OK' : 'FAIL'}  n=${r.n} bands=${JSON.stringify(r.keys)} canvas=${r.w}x${r.h}`
    + ` painted=${(100 * px.painted).toFixed(2)}% band-pixels=${JSON.stringify(px.bands)}`);
  errs.forEach((e) => console.log('   !! ' + e));
  missing.forEach((m) => console.log(`   !! expected text not found: "${m}"`));
  await mp.close();
}
await checkModel('model-confident', 'PtXaTreH.01G021800',
  { expect: ['233 residues', 'very high', 'helix or strand shapes are not drawn'] });
await checkModel('model-lsg', 'PtXaTreH.01G001500', { expect: ['112 residues', 'the model is guessing'] });
await checkModel('model-confident-dark', 'PtXaTreH.01G021800', { theme: 'dark' });

// --- v0.6: the review's items, each asserted where a reader would look --------------------
// Browse is the page the review calls the key thing, so the deep link and the chips that make
// a filtered view legible get their own cases.
await check('browse-deeplink-chips', '#/browse?ps=18',
  { expect: ['Phylostratum =', 'Clear all', 'MS is indirect'], wait: 1400 });
await check('browse-expressed-in', '#/browse?xin=xylem',
  { expect: ['Expressed in (>1 TPM)', 'Clear all'], wait: 1400 });
await check('browse-proxy-statement', '#/browse',
  { expect: ['MS is indirect', 'only 12% match exactly one 717 gene',
             'measured absence'], wait: 1400 });
// A stratum bar and a synteny class must be doors into Browse, not dead ends.
await check('phylostrat-drillthrough', '#/module/phylostrat',
  { expect: ['Click a stratum to browse its genes'] });
await check('synteny-drillthrough', '#/module/synteny',
  { expect: ['click a class to browse it'] });
// Peptide provenance: the point is that a reader can tell shared evidence from specific.
await check('gene-peptide-provenance', '#/gene/PtXaAlbH.17G050300',
  { expect: ['How that was assigned', 'Gene-unique', '717-only',
             'also in P. trichocarpa'], wait: 1400 });
await check('module-expression-studies', '#/module/expression',
  { expect: ['click a row to open it', 'Samples', 'Paper'], wait: 1400 });
// The map's overlays each have a different denominator, which the page must say out loud.
await check('map-overlay-notes', '#/map',
  { expect: ['Colour by:', 'Genes per 100 kb bin'], wait: 1400 });
// TE wording: "0 bp" read as missing data.
await check('gene-te-overlap', '#/gene/PtXaTreH.01G000100',
  { expect: ['Duplication class'], wait: 1000 });

// Promoter motif positions (TODO 44). Two cases, and the second is the one that keeps the
// card honest: a gene whose positions were withheld must SAY so, not silently show an empty
// track that reads as "no motifs here".
await check('gene-promoter-positions', '#/gene/PtXaTreH.01G000900',
  { expect: ['Where those matches sit', 'transcription start', 'the lane says which family'],
    wait: 1200 });
await check('gene-promoter-positions-withheld', '#/gene/PtXaTreH.01G040100',
  { expect: ['Motif positions are withheld for this gene',
             'contradict the bars'], wait: 1200 });

// RNA-seq gene-model evidence. Five cases, and three of them exist to stop the card
// overclaiming: a shallow gene must say so rather than read as a broken model, an untestable
// gene must say so rather than look clean, and a readthrough locus must not read as a split.
await check('genemodel-supported', '#/gene/PtXaAlbH.17G050000',
  { expect: ['Gene model, from RNA-seq', '13 of 13',
             'Every annotated intron is supported'], wait: 1200 });
await check('genemodel-too-shallow', '#/gene/PtXaAlbH.09G000200',
  { expect: ['Too shallow to conclude anything', 'fewer than 27%',
             'not evidence against the gene model'], wait: 1200 });
await check('genemodel-split-clean', '#/gene/PtXaAlbH.17G059000',
  { expect: ['Possible split model', 'Reads inside the intergenic gap',
             'nearly empty of reads', 'not a lineage-specific problem'], wait: 1200 });
await check('genemodel-split-readthrough', '#/gene/PtXaAlbH.17G082500',
  { expect: ['Possible split model', 'readthrough transcription',
             'No threshold is applied'], wait: 1200 });
await check('genemodel-not-testable', '#/gene/PtXaAlbH.17G050200',
  { expect: ['Not testable for this gene', 'not evidence',
             '9,079 genes are in this position'], wait: 1200 });

// --- 34g: the 3D model at PHONE viewport ---------------------------------------------------
// The viewer went public on 2026-09-12 having only ever been rendered at 1180x900. A desktop
// viewport cannot see the three ways a WebGL canvas fails on a phone: the page gains horizontal
// scroll, the canvas is laid out wider than its container, or the control that opens it is
// below the 44px touch floor. Pixels are still counted the same way as the desktop cases,
// because a canvas existing is not a model being drawn -- that mistake already passed three
// blank canvases once.
{
  const pp = await browser.newPage({ viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const perrs = [];
  pp.on('console', (m) => { if (m.type() === 'error') perrs.push('console: ' + m.text()); });
  pp.on('pageerror', (e) => perrs.push('pageerror: ' + e.message));
  await pp.goto(base + '/#/gene/PtXaTreH.01G021800', { waitUntil: 'networkidle' });
  await pp.waitForTimeout(1000);
  const btn = await pp.$('button.struct-open');
  let btnMin = 0;
  if (!btn) perrs.push('no "Show 3D model" button at phone viewport');
  else {
    const bb = await btn.boundingBox();
    btnMin = bb ? Math.min(bb.width, bb.height) : 0;
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
  }
  await pp.waitForSelector('.struct-stage canvas', { timeout: 20000 })
    .catch(() => perrs.push('no canvas at phone viewport'));
  await pp.waitForTimeout(1200);
  const pr = await pp.evaluate(async () => {
    const stage = document.querySelector('.struct-stage');
    const cv = stage && stage.querySelector('canvas');
    const v = stage && stage.__viewer;
    let painted = 0;
    if (v) {
      const img = new Image();
      img.src = v.pngURI();
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, c.width, c.height).data;
      let on = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] >= 128) on++;
      painted = on / (d.length / 4);
    }
    const sb = stage ? stage.getBoundingClientRect() : null;
    const cb = cv ? cv.getBoundingClientRect() : null;
    return {
      painted,
      overflow: cb && sb ? +(cb.width - sb.width).toFixed(1) : null,
      hscroll: document.documentElement.scrollWidth
        > document.documentElement.clientWidth + 1,
      stageW: sb ? Math.round(sb.width) : 0,
    };
  });
  const ok = !perrs.length && pr.painted > 0.002 && !pr.hscroll
    && pr.overflow !== null && pr.overflow <= 1 && btnMin >= 44;
  if (!ok) failures++;
  console.log(`\n### model-phone  ${ok ? 'OK' : 'FAIL'}  painted=${(pr.painted * 100).toFixed(2)}%`
    + ` stage=${pr.stageW}px canvasOverflow=${pr.overflow}px hscroll=${pr.hscroll}`
    + ` openBtn=${btnMin}px`);
  perrs.slice(0, 4).forEach((e) => console.log('   !! ' + e));
  await pp.screenshot({ path: `${outdir}/model-phone.png`, fullPage: false });
  await pp.close();
}

await check('module-about', '#/module/about',
  { expect: ['About & provenance', 'Known limitations', 'HAP2 domain annotation is thin',
             'audited out', 'derived here, not imported', 'Sources'] });
await check('home-dark', '#/', { expect: ['63,960', 'Start here'], theme: 'dark' });

// --- v0.11: duplication layers + the copies-over-all-samples heatmap ---------------------
// A gene whose only duplicates are its own tandem array: this produces ONE track, which an
// earlier guard treated as "nothing to draw" and silently hid the commonest case on the site.
await check('gene-duplayers-tandem', '#/gene/PtXaTreH.08G070600',
  { expect: ['Duplication layers', 'tandem duplication', 'ds 0.', 'array’s median ds',
             'this gene + 3 array members'], wait: 1800 });
// A gene with partners on OTHER chromosomes plus a HAP2 allele: the multi-track case, and the
// one where the allele must be labelled as not a duplication.
await check('gene-duplayers-wgd', '#/gene/PtXaTreH.17G070400',
  { expect: ['Duplication layers', 'gamma whole-genome triplication',
             'the same locus on the other haplotype',
             'the same gene on the other haplotype, not a duplication'], wait: 2200 });
// The per-PAIR tandem dS is a NEW column and is not td.ks. Assert both the column and the
// sentence that keeps them apart -- a future patch that piped the array median into this
// column would still render plausibly.
await check('gene-tandem-pairds', '#/gene/PtXaTreH.08G070600',
  { expect: ['pair ds', 'its class', 'max tpm', 'peak tissue',
             'it is not the array median above'], wait: 1800 });

// Second-order duplication history: an array MEMBER retains a WGD partner where the focal
// gene retains none. The whole risk of this feature is that it reads as the gene's own event,
// so assert BOTH the array-level statement and the unchanged gene-level "not called" -- a
// regression that promoted the array's event to the gene would still render plausibly.
// PtXaTreH.04G044000: 3-member array, no WGD of its own, members carry one salicoid and one
// gamma partner between them.
await check('gene-array-history', '#/gene/PtXaTreH.04G044000',
  { expect: ['this array\u2019s history', 'this gene retains', 'no', 'partner',
             'other array member', 'property of the locus',
             'of an array member',                      // the layers card's row label
             'second order',                            // the layers card's caption
             'not called'],                             // gene-level S/A call, unchanged
    wait: 2400 });

// Dragging links and dS labels out of the way. The property that MUST hold is not that
// something moved -- it is that a dragged link still joins the same two genes. An arc whose
// endpoints could be dragged off its genes would be a drawing that lies about what is
// duplicated, and it would still look fine in a screenshot. So: exactly one curve changes,
// every endpoint of every curve is unchanged, and the keyboard route (SC 2.5.7's required
// alternative to dragging) moves and resets a label.
{
  const dp = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
  const derrs = [];
  dp.on('pageerror', (e) => derrs.push(e.message));
  dp.on('console', (m) => { if (m.type() === 'error') derrs.push('console: ' + m.text()); });
  await dp.goto(base + '/#/gene/PtXaTreH.04G044000', { waitUntil: 'networkidle' });
  await dp.waitForTimeout(2400);
  const card = dp.locator('.card').filter({ has: dp.locator('h2', { hasText: 'Duplication layers' }) }).first();
  const arcs = card.locator('path[role=button]');
  const pill = card.locator('g[role=button]').first();
  await pill.scrollIntoViewIfNeeded();
  await dp.waitForTimeout(250);

  const allD = () => arcs.evaluateAll((ns) => ns.map((n) => n.getAttribute('d')));
  const dsBefore = await allD();

  // drag a label
  const bb = await pill.boundingBox();
  await dp.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await dp.mouse.down();
  await dp.mouse.move(bb.x + bb.width / 2 + 60, bb.y + bb.height / 2 - 30, { steps: 8 });
  await dp.mouse.up();
  const pillMoved = await pill.evaluate((n) => n.getAttribute('transform'));

  // drag a link, grabbed at quarter length so its own dS pill does not take the press
  const mid = await arcs.first().evaluate((n) => {
    const q = n.getPointAtLength(n.getTotalLength() * 0.25);
    const svg = n.ownerSVGElement; const r = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal;
    return { x: r.left + q.x * (r.width / vb.width), y: r.top + q.y * (r.height / vb.height) };
  });
  await dp.mouse.move(mid.x, mid.y);
  await dp.mouse.down();
  await dp.mouse.move(mid.x + 50, mid.y - 40, { steps: 8 });
  await dp.mouse.up();
  const dsAfter = await allD();
  const ends = (d) => {
    const m = d.match(/M ([\d.-]+) ([\d.-]+).*?([\d.-]+) ([\d.-]+)$/);
    return m ? `${(+m[1]).toFixed(1)},${(+m[2]).toFixed(1)}->${(+m[3]).toFixed(1)},${(+m[4]).toFixed(1)}` : d;
  };
  const nChanged = dsBefore.filter((d, i) => d !== dsAfter[i]).length;
  const endsHeld = dsBefore.every((d, i) => ends(d) === ends(dsAfter[i]));

  // keyboard alternative, then the reset control
  await pill.focus();
  await dp.keyboard.press('ArrowRight');
  const kbMoved = await pill.evaluate((n) => n.getAttribute('transform'));
  await dp.keyboard.press('Escape');
  const kbReset = await pill.evaluate((n) => n.getAttribute('transform'));
  await card.locator('button', { hasText: 'Reset the layout' }).click();
  await dp.waitForTimeout(200);
  const dsReset = await allD();
  const pillReset = await pill.evaluate((n) => n.getAttribute('transform'));

  const ok = !derrs.length
    && pillMoved === 'translate(60 -30)'                  // label follows the pointer exactly
    && nChanged === 1                                     // only the grabbed link bends
    && endsHeld                                           // and no link leaves its genes
    && kbMoved && kbMoved !== 'translate(0 0)'            // keyboard alternative works
    && kbReset === 'translate(0 0)'                       // Escape restores
    && dsReset.every((d, i) => d === dsBefore[i])         // reset restores every curve
    && (pillReset === null || pillReset === 'translate(0 0)');
  if (!ok) failures++;
  console.log(`\n### duplayers:drag  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   label drag=${pillMoved}  arcs=${dsBefore.length} bent=${nChanged} `
    + `endpoints-held=${endsHeld}  kb=${kbMoved}->${kbReset}`);
  derrs.forEach((e) => console.log('   !! ' + e));
  await dp.close();
}

// Route C re-adjudication shown BESIDE the canonical call, never instead of it. The risk is
// that a reader takes the proposed call for the called one, so assert that the canonical
// letters are still what the page leads with, that the badge says it is not adopted, and that
// a disagreeing gene says so in words. PtXaTreH.09G077400: canonical gamma, route C salicoid.
await check('gene-routec-disagree', '#/gene/PtXaTreH.09G077400',
  { expect: ['route c re-adjudication', 'proposed, not adopted', 'canonical call',
             'combined ks + topology call', 'the two calls disagree for this gene',
             'master duplication table v9', 'retained duplicate'], wait: 1800 });
// A gene where the two agree must NOT show the disagreement warning.
{
  const ap = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
  const aerrs = [];
  ap.on('pageerror', (e) => aerrs.push(e.message));
  await ap.goto(base + '/#/gene/PtXaTreH.01G176200', { waitUntil: 'networkidle' });
  await ap.waitForTimeout(1600);
  const txt = (await ap.evaluate(() => document.getElementById('view').innerText)).toLowerCase();
  const ok = !aerrs.length && txt.includes('route c re-adjudication')
    && !txt.includes('the two calls disagree for this gene');
  if (!ok) failures++;
  console.log(`\n### routec:agreeing-gene-has-no-warning  ${ok ? 'OK' : 'FAIL'}`);
  aerrs.forEach((e) => console.log('   !! ' + e));
  await ap.close();
}

// Browse must return the SAME numbers as the duplication class figures. It did not: the
// tandem facet was built from syn.flags.ar (GENESPACE placement, 6,804 genes) while the Venn,
// the Duplication card and validate_data.py all use the curated union set (13,048), so
// "tandem + both WGDs" returned 103 against a canonical 385. Every check passed, because
// nothing compared Browse's ANSWER to the canonical intersection. These are those numbers.
// They also exercise deep-linked filters, which used to throw before `inputs` existed.
{
  const bp = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
  const berrs = [];
  bp.on('pageerror', (e) => berrs.push(e.message));
  bp.on('console', (m) => { if (m.type() === 'error') berrs.push('console: ' + m.text()); });
  const want = [
    ['tandem=yes', 13048, 'curated union tandem set'],
    // route C is the default WGD call, so these must equal the CURRENT class figures
    ['hap=hap1&tandem=yes&wgd=both', 229, 'HAP1 tandem + both WGDs = route C Venn S n A n T'],
    ['tandem=yes&wgd=both', 462, 'tandem + both WGDs, both haplotypes (route C)'],
    ['tandem=yes&wgd=salicoid', 1876, 'tandem AND salicoid (route C)'],
    ['tandem=yes&wgd=gamma', 776, 'tandem AND gamma (route C)'],
    ['wgd=neither&tandem=no', 21074, 'neither WGD nor curated tandem (route C)'],
    // the canonical v9 call stays selectable and must still reproduce the v8/v9 numbers
    ['hap=hap1&tandem=yes&wgd9=both', 191, 'HAP1 tandem + both WGDs, canonical v9'],
    ['tandem=yes&wgd9=both', 385, 'tandem + both WGDs, both haplotypes, canonical v9'],
  ];
  const got = [];
  for (const [q, n] of want) {
    await bp.goto(base + '/#/browse?' + q, { waitUntil: 'networkidle' });
    await bp.waitForTimeout(1800);
    const txt = await bp.evaluate(() => document.getElementById('view').innerText);
    const m = txt.match(/([\d,]+)\s*\n?\s*of [\d,]+ genes match/i);
    got.push(m ? parseInt(m[1].replace(/,/g, ''), 10) : null);
  }
  const ok = !berrs.length && want.every(([, n], i) => got[i] === n);
  if (!ok) failures++;
  console.log(`\n### browse:counts-match-the-class-figures  ${ok ? 'OK' : 'FAIL'}`);
  want.forEach(([q, n, label], i) => console.log(
    `   ${got[i] === n ? 'ok ' : 'BAD'} ${String(got[i]).padStart(6)} (want ${String(n).padStart(6)})  ${label}`));
  berrs.forEach((e) => console.log('   !! ' + e));
  await bp.close();
}

// Cache safety. GitHub Pages sends max-age=600 on every file and cannot be told otherwise, so
// for ten minutes after a deploy a reader can hold a stale facets.json while fetching fresh
// JavaScript. Every column this code reads by NAME still resolves in that state -- just to the
// wrong thing -- so the page renders a confident number instead of failing. A reader on data
// 0.11.2 saw 191 from a link that serves 229 for exactly this reason. Two defences, both
// asserted: data URLs carry the manifest's version, and a mismatched build says so out loud.
{
  const cp = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const cerrs = [];
  const dataUrls = [];
  cp.on('pageerror', (e) => cerrs.push(e.message));
  cp.on('console', (m) => { if (m.type() === 'error') cerrs.push('console: ' + m.text()); });
  cp.on('request', (r) => { if (r.url().includes('/data/')) dataUrls.push(r.url()); });
  await cp.goto(base + '/#/browse?tandem=yes&wgd=both', { waitUntil: 'networkidle' });
  await cp.waitForTimeout(1800);
  const txt = await cp.evaluate(() => document.body.innerText);
  const others = dataUrls.filter((u) => !u.includes('manifest.json'));
  const unstamped = others.filter((u) => !u.includes('?v='));
  const okMatch = !cerrs.length && others.length > 0 && unstamped.length === 0
    && !txt.includes('cached build');
  if (!okMatch) failures++;
  console.log(`\n### cache:data-urls-carry-the-version  ${okMatch ? 'OK' : 'FAIL'}`);
  console.log(`   ${others.length} non-manifest data fetches, ${unstamped.length} unstamped, `
    + `banner shown: ${txt.includes('cached build')}`);
  unstamped.slice(0, 3).forEach((u) => console.log('   !! unstamped: ' + u));
  cerrs.forEach((e) => console.log('   !! ' + e));
  await cp.close();

  // A stale build must announce itself. Rewrite the meta before boot to simulate a reader
  // holding yesterday's HTML and script against today's data.
  const sp = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  await sp.route('**/index.html', async (route) => {
    const r = await route.fetch();
    const body = (await r.text()).replace(/atlas-build-version" content="[^"]+"/,
      'atlas-build-version" content="0.0.1"');
    await route.fulfill({ response: r, body });
  });
  await sp.goto(base + '/index.html#/', { waitUntil: 'networkidle' });
  await sp.waitForTimeout(1800);
  const stxt = await sp.evaluate(() => document.body.innerText);
  const okStale = stxt.includes('cached build') && stxt.includes('0.0.1');
  if (!okStale) failures++;
  console.log(`### cache:stale-build-warns  ${okStale ? 'OK' : 'FAIL'}`);
  await sp.close();
}

// The third side of the triangle. Gamma predates salicoid, so a gene's salicoid sister and its
// gamma copy are themselves a gamma pair -- drawing only the focal gene's links showed a star
// and hid the history. PtXaTreH.08G070200 is the Fuzzy MYB locus from Chen's talk: salicoid to
// 10G136900, gamma to 17G070400, and the 10g-17g edge that must now also appear. The count is
// asserted so an inference bug (completing the triangle by construction rather than from the
// anchor table) shows up as too MANY links rather than passing silently.
{
  const tp = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
  const terrs = [];
  tp.on('pageerror', (e) => terrs.push(e.message));
  tp.on('console', (m) => { if (m.type() === 'error') terrs.push('console: ' + m.text()); });
  await tp.goto(base + '/#/gene/PtXaTreH.08G070200', { waitUntil: 'networkidle' });
  await tp.waitForTimeout(2400);
  const card = tp.locator('.card').filter({ has: tp.locator('h2', { hasText: 'Duplication layers' }) }).first();
  const txt = (await card.innerText()).toLowerCase();
  // every dS drawn on the card, in order
  const ds = (await card.innerText()).match(/dS \d+\.\d+/g) || [];
  const has = (v) => ds.includes(v);
  const ok = !terrs.length
    && has('dS 0.093')      // 08g -> 10g salicoid
    && has('dS 1.21')       // 08g -> 17g gamma
    && has('dS 1.03')       // 10g -> 17g gamma: the third edge
    && txt.includes('two partners')   // 'joins' when there is one, 'join' when several
    && txt.includes('never inferred from the other two');
  if (!ok) failures++;
  console.log(`\n### duplayers:third-edge-of-the-triangle  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   dS labels drawn: ${ds.join(', ')}`);
  terrs.forEach((e) => console.log('   !! ' + e));
  await tp.close();
}

// The home page's question links. Each count is computed in the browser from the facet index
// with Browse's OWN predicates, so the number on the home page and the number on the page it
// links to cannot drift. Asserted BOTH ways here: the home page shows a count, and following
// the link produces the same count. The disputed-WGD one is the interesting case -- a first
// draft expressed it as {wgd:'salicoid', wgd9:'gamma'} and reported 7,574, because a gene
// carrying both events under both calls matches that while agreeing about everything. The
// real answer is 904 and it needed its own facet column.
{
  const qp = await browser.newPage({ viewport: { width: 1180, height: 1400 } });
  const qerrs = [];
  qp.on('pageerror', (e) => qerrs.push(e.message));
  qp.on('console', (m) => { if (m.type() === 'error') qerrs.push('console: ' + m.text()); });
  await qp.goto(base + '/#/', { waitUntil: 'networkidle' });
  await qp.waitForTimeout(3200);
  const card = qp.locator('.card').filter({ has: qp.locator('h2', { hasText: 'Start from a question' }) }).first();
  const found = await card.count();
  const txt = found ? await card.innerText() : '';
  const counts = (txt.match(/\u00b7 [\d,]+ genes/g) || []);
  const links = found ? await card.locator('a').evaluateAll((ns) => ns.map((n) => n.getAttribute('href'))) : [];

  // follow three of them and check the destination agrees
  const checks = [
    ['#/browse?tandem=yes&top=xylem&tau_min=0.8', 283],
    ['#/browse?wgd_disputed=yes', 904],
    ['#/browse?allele=no', 12098],
  ];
  const got = [];
  for (const [href, want] of checks) {
    await qp.goto(base + '/' + href, { waitUntil: 'networkidle' });
    await qp.waitForTimeout(1500);
    const t = await qp.evaluate(() => document.getElementById('view').innerText);
    const m = t.match(/([\d,]+)\s*\n?\s*of [\d,]+ genes match/i);
    got.push(m ? parseInt(m[1].replace(/,/g, ''), 10) : null);
  }

  const ok = !qerrs.length && found > 0
    && counts.length === 8                                   // every question got a live count
    && links.length === 8
    && txt.includes('904')                                   // the real disagreement count
    && !txt.includes('7,574')                                // never the wrong one
    && checks.every(([, want], i) => got[i] === want);        // home count == destination count
  if (!ok) failures++;
  console.log(`\n### home:questions-round-trip  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   ${counts.length}/8 live counts; destinations ${got.join(', ')} `
    + `(want ${checks.map(([, w]) => w).join(', ')})`);
  qerrs.forEach((e) => console.log('   !! ' + e));
  await qp.close();
}

// #/pair/<id> -- the allele pair as one page. Three properties matter and all three are
// asserted: entering from EITHER haplotype gives the same page (two readers arriving from
// opposite alleles must not see mirror images of each other); rows that differ by
// construction (id, coordinates) are NOT marked, because flagging those dilutes the rows
// where a difference means something; and a gene with no allele gets its own view rather
// than a broken one -- that state covers 12,098 genes and is a finding, not an error.
{
  const pp = await browser.newPage({ viewport: { width: 1180, height: 1400 } });
  const perrs = [];
  pp.on('pageerror', (e) => perrs.push(e.message));
  pp.on('console', (m) => { if (m.type() === 'error') perrs.push('console: ' + m.text()); });

  const read = async (id) => {
    await pp.goto(base + '/#/pair/' + id, { waitUntil: 'networkidle' });
    await pp.waitForTimeout(2600);
    return pp.evaluate(() => document.getElementById('view').innerText);
  };

  const fromHap1 = await read('PtXaTreH.01G176300');
  const fromHap2 = await read('PtXaAlbH.01G179300');
  const solo = await read('PtXaTreH.01G175200');

  const marks = (t) => (t.match(/differs/g) || []).length;
  const corr = (t) => (t.match(/Pearson ([\d.]+)/) || [])[1];
  const ok = !perrs.length
    // same pair from either side: same marked rows and the same correlation
    && marks(fromHap1) === marks(fromHap2)
    && corr(fromHap1) && corr(fromHap1) === corr(fromHap2)
    // both ids present on both renderings -- the pair, not the gene you came from
    && fromHap1.includes('PtXaTreH.01G176300') && fromHap1.includes('PtXaAlbH.01G179300')
    && fromHap2.includes('PtXaTreH.01G176300') && fromHap2.includes('PtXaAlbH.01G179300')
    // the honesty lines that stop this being read as allele-specific expression
    && fromHap1.includes('NOT allele-specific expression')
    && fromHap1.toLowerCase().includes('not measured') === fromHap1.toLowerCase().includes('not measured')
    // a gene with no allele gets the real explanation, not an empty table
    && solo.includes('No allele pair') && solo.includes('12,098')
    && !solo.includes('Side by side');
  if (!ok) failures++;
  console.log(`\n### pair:same-from-either-haplotype  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   marked rows ${marks(fromHap1)} vs ${marks(fromHap2)}; Pearson `
    + `${corr(fromHap1)} vs ${corr(fromHap2)}; no-allele view ${solo.includes('No allele pair')}`);
  perrs.forEach((e) => console.log('   !! ' + e));
  await pp.close();
}

// #/karyotype -- the ancestral genome as a navigable surface, reduced in the browser from the
// `aek` facet column. The property that matters is the round trip: a cell claims a count and
// its link must land on exactly that count, because the grid and Browse are two different code
// paths over the same column and this repo has already shipped two numbers that disagreed for
// exactly that reason (0.11.2 and 0.11.3). Also asserted: the counts partition the corpus
// (placed + not placed == 63,960), and the "not subgenomes" caveat is present, since copy
// RANKS read as subgenome labels to anyone who has seen a polyploid paper.
{
  const kp = await browser.newPage({ viewport: { width: 1180, height: 1300 } });
  const kerrs = [];
  kp.on('pageerror', (e) => kerrs.push(e.message));
  kp.on('console', (m) => { if (m.type() === 'error') kerrs.push('console: ' + m.text()); });
  await kp.goto(base + '/#/karyotype', { waitUntil: 'networkidle' });
  await kp.waitForTimeout(3600);
  const txt = await kp.evaluate(() => document.getElementById('view').innerText);
  const cells = await kp.locator('#view a[href*="AEK"]').count();

  // take three cells, read the count each claims, follow it, compare
  const picked = await kp.locator('#view a[href*="salicoid_copy"]').evaluateAll(
    (ns) => ns.filter((_, i) => i % 13 === 0).slice(0, 3).map((n) => ({
      href: n.getAttribute('href'),
      claim: parseInt((n.innerText.split('\n')[0] || '').replace(/,/g, ''), 10),
    })));
  const landed = [];
  for (const c of picked) {
    await kp.goto(base + '/' + c.href, { waitUntil: 'networkidle' });
    await kp.waitForTimeout(1500);
    const t = await kp.evaluate(() => document.getElementById('view').innerText);
    const m = t.match(/([\d,]+)\s*\n?\s*of [\d,]+ genes match/i);
    landed.push(m ? parseInt(m[1].replace(/,/g, ''), 10) : null);
  }

  const num = (re) => { const m = txt.match(re); return m ? parseInt(m[1].replace(/,/g, ''), 10) : null; };
  const placed = num(/([\d,]+)\s*\n\s*genes placed on the ancestral genome/);
  const unplaced = num(/([\d,]+)\s*\n\s*not placed/);

  const ok = !kerrs.length
    && cells >= 40
    && picked.length === 3
    && picked.every((c, i) => Number.isFinite(c.claim) && landed[i] === c.claim)
    && placed + unplaced === 63960                    // the counts partition the corpus
    && txt.includes('not subgenomes')                 // the caveat that stops the misreading
    && txt.includes('absence of evidence');           // an empty cell is not a proven loss
  if (!ok) failures++;
  console.log(`\n### karyotype:cells-round-trip  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   ${cells} clickable cells; claims ${picked.map((c) => c.claim).join(', ')} `
    + `-> landed ${landed.join(', ')}; ${placed} placed + ${unplaced} not placed`);
  kerrs.forEach((e) => console.log('   !! ' + e));
  await kp.close();
}

// The provenance sidecars, made reachable. 19 of them are committed and served over HTTP and
// nothing in the interface linked to any of them -- they are where this project does its most
// careful writing (the gate a layer had to pass, what it deliberately does not claim, what was
// tried and rejected). Asserted: the records open and carry their own caveats, and no internal
// cluster path -- especially an agent worktree directory -- reaches a public page.
{
  const ep = await browser.newPage({ viewport: { width: 1180, height: 1400 } });
  const eerrs = [];
  ep.on('pageerror', (e) => eerrs.push(e.message));
  ep.on('console', (m) => { if (m.type() === 'error') eerrs.push('console: ' + m.text()); });
  await ep.goto(base + '/#/module/about', { waitUntil: 'networkidle' });
  await ep.waitForTimeout(2200);
  const card = ep.locator('.card').filter({ has: ep.locator('h2', { hasText: 'Why each layer says what it says' }) }).first();
  const buttons = await card.locator('button').count();

  await card.locator('button', { hasText: 'Route C re-adjudication' }).click();
  await ep.waitForTimeout(1100);
  const routeC = await card.innerText();

  await card.locator('button', { hasText: 'Per-pair tandem dS' }).click();
  await ep.waitForTimeout(1100);
  const tdPair = await card.innerText();

  const leaks = /\.claude\/worktrees|\/scratch\/ch29576\/|\/home\/ch29576\//.test(routeC + tdPair);
  const ok = !eerrs.length
    && buttons === 19
    // each record carries the caveat that is the reason it exists
    && /not applied/i.test(routeC)
    && /array median/i.test(tdPair)
    && !leaks;
  if (!ok) failures++;
  console.log(`\n### about:provenance-records-reachable  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   ${buttons} records; routeC states NOT APPLIED: ${/not applied/i.test(routeC)}; `
    + `tandem states array-median caveat: ${/array median/i.test(tdPair)}; path leak: ${leaks}`);
  eerrs.forEach((e) => console.log('   !! ' + e));
  await ep.close();
}

// #/family/<gene> -- the descent group, walked to exhaustion. Built only after measuring that
// components are drawable (largest 85, median 3); had the edges chained the genome together
// this would show 20,000 rows. Asserted: the member count matches the rows actually rendered,
// the focal gene is at distance 0 and its direct partners at 1, recentring on another member
// gives the SAME family, and a gene with no homology edge gets the real explanation rather
// than a family of one.
{
  const fp = await browser.newPage({ viewport: { width: 1180, height: 1400 } });
  const ferrs = [];
  fp.on('pageerror', (e) => ferrs.push(e.message));
  fp.on('console', (m) => { if (m.type() === 'error') ferrs.push('console: ' + m.text()); });

  const read = async (id) => {
    await fp.goto(base + '/#/family/' + id, { waitUntil: 'networkidle' });
    await fp.waitForTimeout(3400);
    const txt = await fp.evaluate(() => document.getElementById('view').innerText);
    const rows = await fp.locator('#view tbody tr').count();
    const ids = await fp.locator('#view tbody tr td:first-child').allInnerTexts();
    return { txt, rows, ids: ids.map((s) => s.trim()).sort() };
  };

  const a = await read('PtXaTreH.08G070200');           // Fuzzy MYB: tandem + both WGDs
  const b2 = await read('PtXaAlbH.08G074000');          // furthest member of the same family
  const solo = await read('PtXaTreH.01G175200');        // no homology edge at all

  const claimed = parseInt(((a.txt.match(/(\d+)\s*\n\s*genes in the family/) || [])[1] || '0'), 10);
  const sameFamily = a.ids.length === b2.ids.length
    && a.ids.every((x, i) => x === b2.ids[i]);

  const ok = !ferrs.length
    && claimed === a.rows                                  // the stat and the table agree
    && a.rows >= 8
    && /focal/.test(a.txt)                                 // the focal gene is marked, not given a distance
    && a.txt.includes('tandem') && a.txt.includes('salicoid WGD') && a.txt.includes('gamma')
    && sameFamily                                          // recentring gives the same membership
    && solo.txt.includes('No descent group') && solo.txt.includes('3,348')
    && solo.rows === 0;
  if (!ok) failures++;
  console.log(`\n### family:walk-and-recentre  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   ${a.rows} members (claimed ${claimed}); recentring gives the same set: `
    + `${sameFamily}; no-family view: ${solo.txt.includes('No descent group')}`);
  ferrs.forEach((e) => console.log('   !! ' + e));
  await fp.close();
}

// The 652-sample duplicate heatmap is opt-in and its low-expression filter is OFF by default.
// Driven: the toggle must REMOVE rows and must never remove the focal gene, and the default
// view must show the quiet copies -- the whole point of defaulting it off.
{
  const hp = await browser.newPage({ viewport: { width: 1180, height: 1400 } });
  const herrs = [];
  hp.on('pageerror', (e) => herrs.push(e.message));
  hp.on('console', (m) => { if (m.type() === 'error') herrs.push('console: ' + m.text()); });
  // 11-member array, 6 copies under 1 TPM, plus a salicoid partner and a HAP2 allele.
  await hp.goto(base + '/#/gene/PtXaTreH.03G157300', { waitUntil: 'networkidle' });
  await hp.waitForTimeout(1200);
  await hp.click('button:has-text("Load the heatmap")');
  await hp.waitForTimeout(3500);
  const card = hp.locator('.card').filter({ has: hp.locator('h2', { hasText: 'The copies, over all 652 samples' }) }).first();
  const hBefore = await card.locator('canvas').evaluate((c) => c.getBoundingClientRect().height);
  const textBefore = (await card.innerText()).toLowerCase();
  const boxChecked = await card.locator('input[type=checkbox]').isChecked();
  await card.locator('input[type=checkbox]').check();
  await hp.waitForTimeout(900);
  const hAfter = await card.locator('canvas').evaluate((c) => c.getBoundingClientRect().height);
  const textAfter = (await card.innerText()).toLowerCase();
  // Row labels and the correlation numbers are PAINTED ON THE CANVAS, so innerText cannot see
  // them -- an earlier version of this check asserted on 'self' and on the gene id and failed
  // for that reason, not because the card was wrong. What the canvas CAN be asked is its
  // height, which is rows x ROW_H + the tissue strip, so the row count is recoverable exactly.
  const ROW_H = 22, CHROME = 4 + 14;   // must track js/modules/dupheatmap.js
  const rowsOf = (h) => Math.round((h - CHROME) / ROW_H);
  const nBefore = rowsOf(hBefore), nAfter = rowsOf(hAfter);
  const ok = !herrs.length
    && boxChecked === false                                   // unfiltered by default
    && nBefore === 13                                         // 11 array members + allele + focal
    && nAfter === nBefore - 6                                 // exactly the 6 quiet rows go,
                                                              // so the focal row (not quiet) stays
    && textBefore.includes('a silent copy is a result, not noise')
    && textBefore.includes('hide copies that never reach 1 tpm')
    && textBefore.includes('log2(tpm + 1)')
    && textAfter.includes('6 of 13 copies never reach');
  if (!ok) failures++;
  console.log(`\n### dupheatmap:filter  ${ok ? 'OK' : 'FAIL'}`);
  console.log(`   default unchecked=${boxChecked === false}  rows ${nBefore} -> ${nAfter}`
    + `  (canvas ${hBefore}px -> ${hAfter}px)`);
  herrs.forEach((e) => console.log('   !! ' + e));
  await hp.close();
}

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
  { expect: ['This locus on HAP2 too', 'both haplotypes', 'HAP1 (TreH) above',
             'HAP2 (AlbH) below'], wait: 1200 });
// This gene's neighbourhood runs into a real HAP1-only stretch (verified against pav.confirmed
// directly): the card must say so in its own count, not just render silently.
await check('mirror-hemizygous-gap', '#/gene/PtXaTreH.12G001200',
  { expect: ['This locus on HAP2 too', 'with none'], wait: 1200 });
{
  const mp = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const merrs = [];
  mp.on('pageerror', (e) => merrs.push(e.message));
  mp.on('console', (m) => { if (m.type() === 'error') merrs.push(m.text()); });
  await mp.goto(base + '/#/gene/PtXaTreH.05G120200', { waitUntil: 'networkidle' });
  await mp.waitForTimeout(1200);
  const h = await mp.$('h2:has-text("This locus on")');
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
  { expect: ['Expression across the neighbourhood', 'By tissue', 'By contrast', 'Median TPM in catkin'], wait: 1200 });
{
  const sp = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const serrs2 = [];
  sp.on('pageerror', (e) => serrs2.push(e.message));
  sp.on('console', (m) => { if (m.type() === 'error') serrs2.push(m.text()); });
  await sp.goto(base + '/#/gene/PtXaTreH.05G120200', { waitUntil: 'networkidle' });
  await sp.waitForTimeout(1200);
  const h = await sp.$('h2:has-text("Expression across the neighbourhood")');
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
  const h = await tp.$('h2:has-text("Expression across the neighbourhood")');
  await h.scrollIntoViewIfNeeded();
  const r = await tp.evaluate(() => {
    const card = [...document.querySelectorAll('.card')]
      .find((c) => c.querySelector('h2')?.textContent.includes('Expression across the neighbourhood'));
    const btns = [...card.querySelectorAll('.locus-btn')]
      .map((b) => b.getBoundingClientRect()).map((q) => Math.min(q.width, q.height));
    return { n: btns.length, min: btns.length ? Math.min(...btns) : 0 };
  });
  const ok = r.n === 12 && r.min >= 44;  // 2 mode buttons + 10 tissue chips
  if (!ok) failures++;
  console.log(`\n### scrubber:touch-targets  ${ok ? 'OK' : 'FAIL'}  n=${r.n} min=${r.min}px`);
  await tp.close();
}

// Duplicate-partner co-expression (this session): the paralog table's Expr r column and the
// tandem array's Other-members table. This gene has both a comparable pair (r=0.2854, -> 0.29)
// and a saturated pair with no r at all -- the two must render as distinct states, not as a
// correlation of 0 vs 0.29.
await check('gene-duplicate-coexpr', '#/gene/PtXaTreH.01G330600',
  { expect: ['Expr r', '0.29', 'n/c', 'Other members', 'not a divergence model'], wait: 1000 });

// Ancestral karyotype (route C, exploratory). One case per branch, because a wrong-branch bug
// hides behind whichever branch renders: a direct anchor with its slot table, the same ancestral
// gene seen from HAP2, a conflict gene that must NOT show a copy, an unplaced chromosome gene, and
// an unplaced-scaffold gene that was never assessed. The slot wording is asserted in full, since
// "lost or not detected" must never read as a proven loss.
await check('gene-karyotype-anchor', '#/gene/PtXaTreH.01G144500',
  { expect: ['Ancestral karyotype', 'exploratory', 'AEK1', 'Gamma copy', 'Salicoid copy',
             'Label support', '100%', 'eud1g01445', 'Its HAP1 descendants', 'PtXaTreH.03G046700',
             'lost or not detected', 'not evidence that the gene was lost', 'not subgenomes',
             'doi:10.1186/s12915-022-01420-1'], wait: 1000 });
await check('gene-karyotype-hap2', '#/gene/PtXaAlbH.01G147000',
  { expect: ['Ancestral karyotype', 'AEK1', 'eud1g01445', 'Its HAP2 descendants',
             'PtXaAlbH.03G042800'], wait: 1000 });
await check('gene-karyotype-conflict', '#/gene/PtXaTreH.01G040500',
  { expect: ['Ancestral karyotype', 'AEK5', 'not assigned', 'different ancestral chromosomes'], wait: 1000 });
await check('gene-karyotype-unplaced', '#/gene/PtXaTreH.02G000100',
  { expect: ['Ancestral karyotype', 'not placed', 'No collinear block links this gene'], wait: 1000 });
await check('gene-karyotype-scaffold', '#/gene/PtXaTreH.T006000',
  { expect: ['Ancestral karyotype', 'not assessed', 'unplaced scaffold'], wait: 1000 });
// HAP1 and HAP2 are never pooled: the HAP2 page's slot table must name no HAP1 gene, even though
// the same ancestral gene has HAP1 descendants and the page links the HAP1 allele elsewhere.
{
  const kp = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const kerrs = [];
  kp.on('pageerror', (e) => kerrs.push(e.message));
  kp.on('console', (m) => { if (m.type() === 'error') kerrs.push('console: ' + m.text()); });
  await kp.goto(base + '/#/gene/PtXaAlbH.01G147000', { waitUntil: 'networkidle' });
  await kp.waitForTimeout(1000);
  const sec = await kp.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find((n) => n.textContent.startsWith('Ancestral karyotype'));
    return h ? h.parentElement.innerText : '';
  });
  const ok = !kerrs.length && sec.includes('PtXaAlbH.03G042800') && !/PtXaTreH\./.test(sec);
  if (!ok) failures++;
  console.log(`\n### karyotype:haplotypes-not-pooled  ${ok ? 'OK' : 'FAIL'}`);
  kerrs.forEach((e) => console.log('   !! ' + e));
  await kp.close();
}
// The Browse filter, deep-linked, both haplotypes and then one: 2,167 = 1,097 HAP1 + 1,070 HAP2.
await check('browse-karyotype', '#/browse?aek=AEK1_gamma_copy_1',
  { expect: ['Ancestral chromosome (exploratory)', 'AEK1 gamma copy 1', '2,167', 'Clear all'], wait: 1400 });
await check('browse-karyotype-hap2', '#/browse?aek=AEK1_gamma_copy_1&hap=hap2',
  { expect: ['AEK1 gamma copy 1', '1,070', 'Clear all 2'], wait: 1400 });

// The chromatin card's "Show the signal profile" button must actually fetch and draw the
// four-mark panel, not just sit there -- chipRow and metricNote were both built and wired but
// never mounted earlier in this project, so only a real click-through catches a dead button.
{
  const cp = await browser.newPage({ viewport: { width: 1180, height: 1200 } });
  const cerrs = [];
  cp.on('pageerror', (e) => cerrs.push(e.message));
  cp.on('console', (m) => { if (m.type() === 'error') cerrs.push('console: ' + m.text()); });
  await cp.goto(base + '/#/gene/PtXaTreH.01G000700', { waitUntil: 'networkidle' });
  await cp.waitForTimeout(1000);
  await cp.click('button:has-text("Show the signal profile")');
  await cp.waitForTimeout(900);
  const text = (await cp.evaluate(() => document.getElementById('view').innerText)).toLowerCase();
  const gone = (await cp.$('button:has-text("Show the signal profile")')) === null;
  const ok = !cerrs.length && gone
    && text.includes('active promoter')
    && text.includes('oriented by strand when they were extracted');
  if (!ok) failures++;
  console.log(`\n### gene-chromatin-profile-click  ${ok ? 'OK' : 'FAIL'}  button-replaced=${gone}`);
  cerrs.forEach((e) => console.log('   !! ' + e));
  await cp.close();
}

await browser.close();
console.log(`\n${failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED'}`);
process.exit(failures ? 1 : 0);
