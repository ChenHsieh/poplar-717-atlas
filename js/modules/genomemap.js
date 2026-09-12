// The genome map: semantic zoom from 19 chromosomes down to one chromosome's genes,
// then a click hands off to the already-built locus card (#/gene/<id>) for the final
// resolve. Two tiers here, not three -- see docs/PLAN_locus_map_and_experimental_ux.md
// section 2.4 and its own build-order note that WGD-block and syntenic-run overlays are
// a separate data layer, not yet built, so they are not drawn here.
//
// Same canvas discipline as locus.js: absolutely-positioned canvas inside a sized
// container, DPR-aware fitting, palette read off the DOM once and cached (canvas
// fillStyle does not resolve CSS custom properties).
import { el } from '../core/dom.js';
import { loadLocusOverview, loadLocusIndex } from '../core/data.js';
import { palette, fillFor } from '../core/palette.js';

const CHROMS = Array.from({ length: 19 }, (_, i) => `Chr${String(i + 1).padStart(2, '0')}`);
const MAX_DPR = 2;
const OVERVIEW_H = 420;
const CHR_H = 168;
const PAD_X = 10;
const ROW_GAP = 4;
const LABEL_W = 46;
const PICK_TOL = 6; // CSS px, chromosome-tier gene hit tolerance

// Positional: bins are [n, tandem, lsg, tau, omega, ms_frac, acr_frac] -- see
// scripts/patch_map_overlays.py, which recomputes them from the gene shards and gates the
// first four against the previously shipped file before adding the last three.
const METRICS = {
  genes: { label: 'Gene density', get: (b) => b[0] },
  tandem: { label: 'Tandem fraction', get: (b) => (b[0] ? b[1] / b[0] : null) },
  lsg: { label: 'LSG-pool fraction', get: (b) => (b[0] ? b[2] / b[0] : null) },
  tau: { label: 'Mean τ', get: (b) => b[3] },
  omega: { label: 'Mean ω vs P. trichocarpa', get: (b) => b[4] },
  ms: { label: 'Peptide-detected fraction', get: (b) => b[5] },
  acr: { label: 'Ortholog open chromatin', get: (b) => b[6] },
};

// Each overlay's denominator differs, and a colour ramp hides that, so the map says it.
const METRIC_NOTE = {
  genes: 'Genes per 100 kb bin.',
  tandem: 'Share of genes in the bin that belong to a tandem array.',
  lsg: 'Share in the lineage-specific pool (PS \u2265 18), on the Idesia-corrected panel.',
  tau: 'Mean tissue-specificity of genes in the bin that have a baseline at all.',
  omega: 'Mean Ka/Ks over the genes in the bin that HAVE a reciprocal-best P. trichocarpa '
    + 'ortholog \u2014 81.7% of genes, and the ones without are the youngest, so a bin\u2019s '
    + 'value describes its pairable genes.',
  ms: 'Share of genes with a peptide in any of five public Populus mass-spec datasets. '
    + 'Indirect: most such peptides are shared with P. trichocarpa and with other 717 genes.',
  acr: 'Share of leaf-expressed P. trichocarpa ORTHOLOGS with accessible chromatin. This is '
    + 'the ortholog\u2019s chromatin, not this genome\u2019s, and its denominator is only the '
    + 'genes with a 1:1 ortholog expressed in leaf \u2014 smaller than the bin.',
};

function metricRange(overview, hap, metricKey) {
  const get = METRICS[metricKey].get;
  let lo = Infinity, hi = -Infinity;
  for (const chr of CHROMS) {
    for (const b of overview.hap[hap][chr] || []) {
      const v = get(b);
      if (v == null) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return lo <= hi ? { lo, hi } : { lo: 0, hi: 1 };
}

/** A single canvas stage with the DPR-fitting discipline from locus.js. `onDraw(ctx, view)`
 *  must return the hit-test boxes for the current frame; stored so pointer handlers can
 *  read them without recomputing layout. Two redraw entry points on purpose: `refresh()`
 *  re-measures the container (resize, DPR change), `redraw()` repaints at the current size
 *  (hover, a control changed) -- a hover-only update has no reason to re-read layout. */
function makeStage(height) {
  const stage = el('div', { class: 'locus-stage', style: `height:${height}px` });
  const canvas = el('canvas', { class: 'locus-canvas' });
  stage.append(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  let view = { w: 0, h: 0, dpr: 0 };
  let onDraw = () => [];
  let boxes = [];

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const r = stage.getBoundingClientRect();
    if (!r.width) return false;
    const w = Math.round(r.width * dpr), h = Math.round(height * dpr);
    if (w === view.w && h === view.h && dpr === view.dpr) return false;
    canvas.width = w; canvas.height = h;
    canvas.style.width = (w / dpr) + 'px';
    canvas.style.height = (h / dpr) + 'px';
    view = { w, h, dpr };
    return true;
  }
  function redraw() { boxes = onDraw(ctx, view) || []; }
  function refresh() { fit(); redraw(); }

  const ro = new ResizeObserver(() => { fit(); redraw(); });
  try { ro.observe(stage, { box: 'device-pixel-content-box' }); }
  catch { ro.observe(stage, { box: 'content-box' }); }

  let dropDpr = null;
  (function watchDpr() {
    dropDpr?.();
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', watchDpr, { once: true });
    dropDpr = () => mq.removeEventListener('change', watchDpr);
    refresh();
  })();

  return {
    stage, canvas,
    setDraw(fn) { onDraw = fn; redraw(); },
    refresh, redraw,
    pointIn(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      return { x: (clientX - r.left) * (canvas.width / r.width) / view.dpr,
               y: (clientY - r.top) * (canvas.height / r.height) / view.dpr };
    },
    get boxes() { return boxes; },
  };
}

/** Overview tier: one horizontal strip per chromosome, width proportional to the
 *  chromosome's own length, colour intensity from the selected density metric. */
function drawOverview(ctx, view, overview, hap, metricKey, hoverChr) {
  const { w, h, dpr } = view;
  const P = palette();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = P.panel;
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cssW = w / dpr, cssH = h / dpr;

  const bin = overview.bin;
  const lengths = CHROMS.map((c) => (overview.hap[hap][c] || []).length * bin);
  const maxLen = Math.max(1, ...lengths);
  const trackW = cssW - PAD_X * 2 - LABEL_W;
  const rowH = Math.max(6, (cssH - PAD_X * 2) / CHROMS.length - ROW_GAP);
  const { lo, hi } = metricRange(overview, hap, metricKey);
  const get = METRICS[metricKey].get;
  const boxes = [];

  CHROMS.forEach((chr, i) => {
    const bins = overview.hap[hap][chr] || [];
    const rowW = (bins.length * bin / maxLen) * trackW;
    const y = PAD_X + i * (rowH + ROW_GAP);
    const x0 = PAD_X + LABEL_W;

    ctx.fillStyle = P.ink3;
    ctx.font = '10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(chr.replace('Chr', ''), x0 - 6, y + rowH * 0.72);

    bins.forEach((b, bi) => {
      const v = get(b);
      const t = v == null || hi <= lo ? 0.5 : (v - lo) / (hi - lo);
      ctx.globalAlpha = v == null ? 0.06 : 0.12 + 0.8 * t;
      ctx.fillStyle = P.accent;
      const bx = x0 + (bi * bin / maxLen) * trackW;
      const bw = Math.max(1, (bin / maxLen) * trackW);
      ctx.fillRect(bx, y, bw, rowH);
    });
    ctx.globalAlpha = 1;

    const focal = hoverChr === chr;
    ctx.strokeStyle = focal ? P.accent : P.line;
    ctx.lineWidth = focal ? 1.6 : 1;
    ctx.strokeRect(x0 + 0.5, y + 0.5, Math.max(1, rowW - 1), rowH - 1);

    boxes.push({ chr, x0, x1: x0 + rowW, y0: y, y1: y + rowH });
  });

  return boxes;
}

async function renderOverview(hap, onPickChr) {
  const overview = await loadLocusOverview();
  const state = { metric: 'genes', hoverChr: null };
  const s = makeStage(OVERVIEW_H);
  s.setDraw((ctx, view) => drawOverview(ctx, view, overview, hap, state.metric, state.hoverChr));

  const metricSel = el('select', { class: 'locus-btn', style: 'min-width:0;padding:0 10px' },
    ...Object.entries(METRICS).map(([k, v]) => el('option', { value: k }, v.label)));
  metricSel.value = state.metric;
  const metricNote = el('p', { class: 'muted', style: 'font-size:11.5px;margin:6px 0 0' },
    METRIC_NOTE[state.metric] || '');
  metricSel.addEventListener('change', () => {
    state.metric = metricSel.value;
    metricNote.textContent = METRIC_NOTE[state.metric] || '';
    s.redraw();
  });

  s.canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const { x, y } = s.pointIn(ev.clientX, ev.clientY);
    const hit = s.boxes.find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
    s.canvas.style.cursor = hit ? 'pointer' : 'default';
    const next = hit ? hit.chr : null;
    if (next !== state.hoverChr) { state.hoverChr = next; s.redraw(); }
  });
  s.canvas.addEventListener('click', (ev) => {
    const { x, y } = s.pointIn(ev.clientX, ev.clientY);
    const hit = s.boxes.find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
    if (hit) onPickChr(hit.chr);
  });

  return el('div', {},
    el('div', { style: 'display:flex;gap:10px;align-items:center;margin-bottom:4px' },
      el('label', { class: 'muted', style: 'font-size:12px' }, 'Colour by:'), metricSel),
    el('div', { style: 'margin-bottom:8px' }, metricNote),
    s.stage,
    el('p', { class: 'muted', style: 'font-size:11.5px;margin:8px 0 0' },
      'Each row is one chromosome, drawn to its own length. Click a chromosome to zoom in.'));
}

/** Chromosome tier: one tick per gene, positioned by its own coordinate, coloured by
 *  duplication class -- same convention, same palette, as the locus card. */
function drawChromosome(ctx, view, genes, chrLen, hoverGene) {
  const { w, h, dpr } = view;
  const P = palette();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = P.panel;
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cssW = w / dpr, cssH = h / dpr;
  const midY = Math.round(cssH * 0.5) + 0.5;
  const x = (bp) => PAD_X + (bp / chrLen) * (cssW - PAD_X * 2);

  ctx.strokeStyle = P.line;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(cssW, midY); ctx.stroke();

  const boxes = [];
  for (const g of genes) {
    const gx = x(g.s);
    const focal = hoverGene === g.g;
    ctx.strokeStyle = focal ? P.accent : fillFor(g.c);
    ctx.lineWidth = focal ? 2.4 : 1.2;
    ctx.globalAlpha = focal ? 1 : 0.75;
    ctx.beginPath();
    ctx.moveTo(gx, midY - 22);
    ctx.lineTo(gx, midY + 22);
    ctx.stroke();
    boxes.push({ g: g.g, x: gx, rec: g });
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = P.ink3;
  ctx.font = '10.5px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${(chrLen / 1e6).toFixed(1)} Mb`, PAD_X, cssH - 5);
  ctx.textAlign = 'right';
  ctx.fillText(`${genes.length} genes`, cssW - PAD_X, cssH - 5);

  return boxes;
}

function nearestGene(s, clientX, clientY) {
  const { x } = s.pointIn(clientX, clientY);
  let best = null, bd = Infinity;
  for (const b of s.boxes) {
    const d = Math.abs(b.x - x);
    if (d < bd) { bd = d; best = b; }
  }
  return bd <= PICK_TOL ? best : null;
}

async function renderChromosome(hap, chr, onBack) {
  const genes = await loadLocusIndex(hap, chr);
  const chrLen = Math.max(...genes.map((g) => g.e), 1);
  const state = { hoverGene: null };
  const s = makeStage(CHR_H);
  s.setDraw((ctx, view) => drawChromosome(ctx, view, genes, chrLen, state.hoverGene));

  const readout = el('div', { class: 'locus-readout muted' }, ' ');
  s.canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const hit = nearestGene(s, ev.clientX, ev.clientY);
    s.canvas.style.cursor = hit ? 'pointer' : 'default';
    readout.textContent = hit ? `${hit.g}${hit.rec.p ? ' · peaks in ' + hit.rec.p : ''}` : ' ';
    const next = hit ? hit.g : null;
    if (next !== state.hoverGene) { state.hoverGene = next; s.redraw(); }
  });
  s.canvas.addEventListener('click', (ev) => {
    const hit = nearestGene(s, ev.clientX, ev.clientY);
    if (hit) location.hash = `#/gene/${hit.g}`;
  });

  return el('div', {},
    el('div', { style: 'display:flex;gap:10px;align-items:center;margin-bottom:8px' },
      el('button', { class: 'locus-btn', type: 'button', onclick: onBack }, '← genome'),
      el('strong', {}, `${chr} · ${hap === 'hap1' ? 'HAP1 (TreH)' : 'HAP2 (AlbH)'}`)),
    s.stage, readout,
    el('p', { class: 'muted', style: 'font-size:11.5px;margin:8px 0 0' },
      'Each tick is one gene, coloured by duplication class (tandem, ancient WGD, salicoid '
      + 'WGD, dispersed, singleton). Click a gene to open its page. WGD-block and '
      + 'syntenic-run overlays are not built at this zoom yet -- see the locus card on the '
      + 'gene page for those relationships today.'));
}

/** Top-level entry, called from app.js's #/map route. `chr` is null for the whole-genome
 *  view. Returns a DOM node; the route handler owns the page chrome (title, hap toggle). */
export async function renderMap(hap, chr) {
  return chr
    ? renderChromosome(hap, chr, () => { location.hash = `#/map/${hap}`; })
    : renderOverview(hap, (pickedChr) => { location.hash = `#/map/${hap}/${pickedChr}`; });
}
