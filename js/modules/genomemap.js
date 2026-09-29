// The genome map: semantic zoom from 19 chromosomes down to single genes, then a click
// hands off to the locus card (#/gene/<id>). See docs/PLAN_locus_map_and_experimental_ux.md
// section 2.4.
//
// Tier 1 (overview): one row per chromosome, 100 kb bins coloured by a chosen metric, with a
// Mb axis, a legend that states its range and n, and a hover readout.
// Tier 2 (chromosome): a two-haplotype track browser. The route's haplotype is drawn on top,
// the other haplotype below it, mirrored so the two gene rows face each other and the allele
// links between them stay short. Every track is computed in the browser from files already
// shipped: data/locus/index/<hap>/<chr>.json (position, strand, duplication class, tau, peak
// tissue, LSG pool) and data/locus/tile/<hap>/<chr>/<Mb>.json (synteny class, allele id,
// exon structure). Nothing here derives a new number; counts in the legends are counts of
// genes in the current window.
//
// Canvas discipline as locus.js: absolutely-positioned canvas in a sized container,
// DPR-aware fitting. Colours are read from the CSS tokens at every draw (not cached), so a
// theme flip -- system or data-theme -- repaints correctly.
import { el } from '../core/dom.js';
import { loadLocusOverview, loadLocusIndex, loadLocusTile } from '../core/data.js';
import { onDispose } from '../core/lifecycle.js';
import { query, setQuery } from '../core/router.js';

const CHROMS = Array.from({ length: 19 }, (_, i) => `Chr${String(i + 1).padStart(2, '0')}`);
const HAP_LABEL = { hap1: 'HAP1 (TreH)', hap2: 'HAP2 (AlbH)' };
const MAX_DPR = 2;
const OVERVIEW_H = 470;
const PAD_X = 10;
const ROW_GAP = 4;
const LABEL_W = 46;
const AXIS_H = 30;
const MIN_SPAN = 20000; // bp; about four average genes -- labels are readable well before this

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const g = (v) => cs.getPropertyValue(v).trim();
  return {
    panel: g('--panel'), panel2: g('--panel-2'), line: g('--line'), line2: g('--line-2'),
    ink: g('--ink'), ink2: g('--ink-2'), ink3: g('--ink-3'),
    accent: g('--accent'), accentInk: g('--accent-ink'), accentSoft: g('--accent-soft'),
    hap1: g('--hap1'), hap2: g('--hap2'),
    core: g('--c-core'), disp: g('--c-disp'), nonsyn: g('--c-nonsyn'),
    priv: g('--c-priv'), tandem: g('--c-tandem'),
    mono: g('--mono') || 'monospace', sans: g('--sans') || 'sans-serif',
  };
}

// ---------------------------------------------------------------------------------------
// Overview metrics. Bins are [n, tandem, lsg, tau, omega, ms_frac, acr_frac] -- see
// scripts/patch_map_overlays.py.
const METRICS = {
  genes: { label: 'Gene density', get: (b) => b[0], fmt: (v) => `${Math.round(v)} genes` },
  tandem: { label: 'Tandem fraction', get: (b) => (b[0] ? b[1] / b[0] : null), fmt: pctF },
  lsg: { label: 'LSG-pool fraction', get: (b) => (b[0] ? b[2] / b[0] : null), fmt: pctF },
  tau: { label: 'Mean τ', get: (b) => b[3], fmt: (v) => v.toFixed(2) },
  omega: { label: 'Mean ω vs P. trichocarpa', get: (b) => b[4], fmt: (v) => v.toFixed(2) },
  ms: { label: 'Peptide-detected fraction', get: (b) => b[5], fmt: pctF },
  acr: { label: 'Ortholog open chromatin', get: (b) => b[6], fmt: pctF },
};
function pctF(v) { return `${(v * 100).toFixed(1)}%`; }

// Each overlay's denominator differs, and a colour ramp hides that, so the map says it.
const METRIC_NOTE = {
  genes: 'Genes per 100 kb bin.',
  tandem: 'Share of genes in the bin that belong to a tandem array.',
  lsg: 'Share in the lineage-specific pool (PS ≥ 18 in the genEra rerun that added Idesia).',
  tau: 'Mean tissue-specificity of genes in the bin that have a baseline at all.',
  omega: 'Mean Ka/Ks over the genes in the bin that HAVE a reciprocal-best P. trichocarpa '
    + 'ortholog — 81.7% of genes, and the ones without are the youngest, so a bin’s '
    + 'value describes its pairable genes.',
  ms: 'Share of genes with a peptide in any of five public Populus mass-spec datasets. '
    + 'Indirect: most such peptides are shared with P. trichocarpa and with other 717 genes.',
  acr: 'Share of leaf-expressed P. trichocarpa ORTHOLOGS with accessible chromatin. This is '
    + 'the ortholog’s chromatin, not this genome’s, and its denominator is only the '
    + 'genes with a 1:1 ortholog expressed in leaf — smaller than the bin.',
};

function metricRange(overview, hap, metricKey) {
  const get = METRICS[metricKey].get;
  let lo = Infinity, hi = -Infinity, n = 0, total = 0;
  for (const chr of CHROMS) {
    for (const b of overview.hap[hap][chr] || []) {
      total++;
      const v = get(b);
      if (v == null) continue;
      n++;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return lo <= hi ? { lo, hi, n, total } : { lo: 0, hi: 1, n, total };
}

/** A single canvas stage. `onDraw(ctx, view)` returns hit-test boxes for the frame.
 *  `refresh()` re-measures (resize, DPR); `redraw()` repaints at the current size. */
function makeStage(height, extraClass = '') {
  const stage = el('div', { class: `locus-stage map-stage ${extraClass}`, style: `height:${height}px` });
  const canvas = el('canvas', { class: 'locus-canvas map-canvas' });
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
  function redraw() { if (view.w) boxes = onDraw(ctx, view) || []; }
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
  // Theme flips: system preference, or the site's own data-theme toggle.
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  const onTheme = () => redraw();
  mqDark.addEventListener('change', onTheme);
  const mo = new MutationObserver(onTheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  onDispose(stage, () => {
    ro.disconnect(); dropDpr?.(); mo.disconnect(); mqDark.removeEventListener('change', onTheme);
  });

  return {
    stage, canvas,
    setDraw(fn) { onDraw = fn; redraw(); },
    refresh, redraw,
    get cssW() { return view.dpr ? view.w / view.dpr : stage.getBoundingClientRect().width; },
    pointIn(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      return { x: (clientX - r.left) * (canvas.width / r.width) / view.dpr,
               y: (clientY - r.top) * (canvas.height / r.height) / view.dpr };
    },
    get boxes() { return boxes; },
  };
}

/** "Nice" tick step for a span in bp, aiming at roughly `target` ticks. */
function tickStep(span, target) {
  const raw = span / Math.max(1, target);
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}
function fmtBp(bp, step) {
  if (step >= 1e6) return `${(bp / 1e6).toFixed(0)} Mb`;
  if (step >= 1e5) return `${(bp / 1e6).toFixed(1)} Mb`;
  if (step >= 1e4) return `${(bp / 1e6).toFixed(2)} Mb`;
  return `${(bp / 1e3).toFixed(0)} kb`;
}
const fmtMb = (bp, d = 2) => `${(bp / 1e6).toFixed(d)}`;

// ---------------------------------------------------------------------------------------
// Overview tier
function drawOverview(ctx, view, overview, hap, metricKey, hover) {
  const { w, h, dpr } = view;
  const T = tokens();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = T.panel;
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cssW = w / dpr, cssH = h / dpr;

  const bin = overview.bin;
  const lengths = CHROMS.map((c) => (overview.hap[hap][c] || []).length * bin);
  const maxLen = Math.max(1, ...lengths);
  const trackW = cssW - PAD_X * 2 - LABEL_W;
  const rowH = Math.max(6, (cssH - PAD_X - AXIS_H) / CHROMS.length - ROW_GAP);
  const { lo, hi } = metricRange(overview, hap, metricKey);
  const get = METRICS[metricKey].get;
  const x0 = PAD_X + LABEL_W;
  const boxes = [];

  CHROMS.forEach((chr, i) => {
    const bins = overview.hap[hap][chr] || [];
    const rowW = (bins.length * bin / maxLen) * trackW;
    const y = PAD_X + i * (rowH + ROW_GAP);
    const focal = hover && hover.chr === chr;

    ctx.fillStyle = focal ? T.accentInk : T.ink2;
    ctx.font = `11px ${T.mono}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(chr, x0 - 6, y + rowH / 2);

    bins.forEach((b, bi) => {
      const v = get(b);
      const t = v == null || hi <= lo ? 0.5 : (v - lo) / (hi - lo);
      ctx.globalAlpha = v == null ? 0.06 : 0.12 + 0.8 * t;
      ctx.fillStyle = T.accent;
      const bx = x0 + (bi * bin / maxLen) * trackW;
      const bw = Math.max(1, (bin / maxLen) * trackW);
      ctx.fillRect(bx, y, bw, rowH);
    });
    ctx.globalAlpha = 1;

    ctx.strokeStyle = focal ? T.ink : T.line2;
    ctx.lineWidth = focal ? 1.6 : 1;
    ctx.strokeRect(x0 + 0.5, y + 0.5, Math.max(1, rowW - 1), rowH - 1);
    if (focal && hover.bin != null) {
      const bx = x0 + (hover.bin * bin / maxLen) * trackW;
      ctx.strokeStyle = T.ink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, y - 1.5, Math.max(2, (bin / maxLen) * trackW), rowH + 3);
    }
    const nChr = bins.reduce((a, b) => a + b[0], 0).toLocaleString('en-US');
    ctx.font = `10.5px ${T.mono}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = T.ink3;
    if (x0 + rowW + 6 + ctx.measureText(nChr).width < cssW - 2) ctx.fillText(nChr, x0 + rowW + 6, y + rowH / 2);
    boxes.push({ chr, x0, x1: x0 + rowW, y0: y - ROW_GAP / 2, y1: y + rowH + ROW_GAP / 2, bins });
  });

  // Mb axis
  const axisY = PAD_X + CHROMS.length * (rowH + ROW_GAP) + 2;
  const step = tickStep(maxLen, cssW < 500 ? 4 : 10);
  ctx.strokeStyle = T.ink;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, axisY + 0.5); ctx.lineTo(x0 + trackW, axisY + 0.5); ctx.stroke();
  ctx.fillStyle = T.ink2;
  ctx.font = `10.5px ${T.mono}`;
  ctx.textBaseline = 'top';
  for (let bp = 0; bp <= maxLen; bp += step) {
    const tx = Math.round(x0 + (bp / maxLen) * trackW) + 0.5;
    ctx.beginPath(); ctx.moveTo(tx, axisY); ctx.lineTo(tx, axisY + 5); ctx.stroke();
    ctx.textAlign = bp === 0 ? 'left' : 'center';
    ctx.fillText(bp === 0 ? '0 Mb' : fmtBp(bp, step), tx, axisY + 8);
  }
  return boxes;
}

async function renderOverview(hap, onPickChr) {
  const overview = await loadLocusOverview();
  const state = { metric: 'genes', hover: null };
  const s = makeStage(OVERVIEW_H);
  s.setDraw((ctx, view) => drawOverview(ctx, view, overview, hap, state.metric, state.hover));

  const nGenes = CHROMS.reduce((a, c) => a + (overview.hap[hap][c] || []).reduce((x, b) => x + b[0], 0), 0);

  const metricBtns = Object.entries(METRICS).map(([k, v]) => el('button', {
    class: 'btn map-metric', type: 'button', 'data-metric': k, 'aria-pressed': String(k === state.metric),
    onclick: () => { state.metric = k; sync(); s.redraw(); },
  }, v.label));
  const metricNote = el('p', { class: 'muted map-note' });
  const rampLo = el('span', { class: 'mono' });
  const rampHi = el('span', { class: 'mono' });
  const rampN = el('span', { class: 'muted' });
  const legend = el('div', { class: 'map-ramp', 'data-map-legend': 'overview' },
    rampLo, el('span', { class: 'map-ramp-bar', 'aria-hidden': 'true' }), rampHi, rampN);
  const readout = el('div', { class: 'locus-readout map-readout muted', 'data-map-readout': '' }, ' ');

  function sync() {
    metricBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.metric === state.metric)));
    const m = METRICS[state.metric];
    const r = metricRange(overview, hap, state.metric);
    metricNote.textContent = METRIC_NOTE[state.metric] || '';
    rampLo.textContent = m.fmt(r.lo);
    rampHi.textContent = m.fmt(r.hi);
    rampN.textContent = `n = ${r.n.toLocaleString('en-US')} of ${r.total.toLocaleString('en-US')} `
      + `100 kb bins carry a value; pale = empty or no value.`;
  }
  sync();

  const hit = (ev) => {
    const { x, y } = s.pointIn(ev.clientX, ev.clientY);
    return s.boxes.find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)
      ? { box: s.boxes.find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1), x } : null;
  };
  s.canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const h = hit(ev);
    s.canvas.style.cursor = h ? 'pointer' : 'default';
    let next = null;
    if (h) {
      const { box } = h;
      const bi = Math.min(box.bins.length - 1,
        Math.max(0, Math.floor((h.x - box.x0) / (box.x1 - box.x0) * box.bins.length)));
      const b = box.bins[bi];
      const v = METRICS[state.metric].get(b);
      next = { chr: box.chr, bin: bi };
      readout.textContent = `${box.chr} · ${fmtMb(bi * overview.bin, 1)}–${fmtMb((bi + 1) * overview.bin, 1)} Mb`
        + ` · ${b[0]} genes · ${METRICS[state.metric].label}: ${v == null ? 'no value' : METRICS[state.metric].fmt(v)}`;
    } else readout.textContent = ' ';
    if (JSON.stringify(next) !== JSON.stringify(state.hover)) { state.hover = next; s.redraw(); }
  });
  s.canvas.addEventListener('click', (ev) => {
    const h = hit(ev);
    if (h) onPickChr(h.box.chr);
  });

  return el('div', { class: 'map-overview', 'data-map-view': 'overview' },
    el('div', { class: 'map-metrics', role: 'group', 'aria-label': 'Colour by' },
      el('label', { class: 'map-metrics-label' }, 'Colour by:'), ...metricBtns),
    metricNote,
    el('p', { class: 'map-count' },
      `${HAP_LABEL[hap]}: 19 chromosomes, ${nGenes.toLocaleString('en-US')} genes in ${overview.bin / 1000} kb bins.`),
    s.stage, readout,
    legend,
    el('p', { class: 'muted map-note' },
      'Each row is one chromosome, drawn to its own length, with its gene count at the end '
      + 'where it fits; darker = higher value. '
      + 'Click a chromosome to zoom in.'));
}

// ---------------------------------------------------------------------------------------
// Chromosome tier: two-haplotype track browser

// Duplication class letters, first match wins -- the same precedence as the locus card.
const DUP = [
  { k: 'T', label: 'tandem', tok: 'tandem' },
  { k: 'A', label: 'gamma WGD', tok: 'priv' },
  { k: 'S', label: 'salicoid WGD', tok: 'core' },
  { k: 'D', label: 'dispersed', tok: 'disp' },
  { k: 'C', label: 'none detected', tok: 'nonsyn' },
];
const dupOf = (c) => (c ? DUP.find((d) => c.includes(d.k)) : null);

const SYN = [
  { k: 'core_syntenic', label: 'core syntenic', tok: 'core' },
  { k: 'dispensable_syntenic', label: 'dispensable', tok: 'disp' },
  { k: 'non_syntenic_ortholog', label: 'non-syntenic', tok: 'nonsyn' },
  { k: 'private_no_ortholog', label: 'private', tok: 'priv' },
  { k: 'tandem_array_member', label: 'tandem array', tok: 'tandem' },
];

const TRACKS = [
  { id: 'plus', label: 'genes +', h: 24 },
  { id: 'minus', label: 'genes −', h: 24 },
  { id: 'dup', label: 'duplication', h: 12 },
  { id: 'syn', label: 'synteny', h: 12 },
  { id: 'tau', label: 'τ', h: 20 },
  { id: 'lsg', label: 'LSG pool', h: 10 },
];
const TRACK_GAP = 3;
const HEAD_H = 16, RULER_H = 22, LINK_H = 46, GUTTER = 80, PAD_R = 10;
const BLOCK_H = HEAD_H + RULER_H + TRACKS.reduce((a, t) => a + t.h + TRACK_GAP, 0);
const CHR_H = BLOCK_H * 2 + LINK_H + 8;

const inWin = (g, a, b) => g.e >= a && g.s <= b;

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Lay out one haplotype block. `dir` = +1 draws top-down (header, ruler, then tracks
 *  from LSG down to the gene rows), -1 mirrors it so the gene rows face the link band. */
function blockLayout(top, dir) {
  const order = dir > 0 ? [...TRACKS].reverse() : TRACKS;
  const rows = {};
  let y;
  if (dir > 0) {
    const head = top, ruler = top + HEAD_H;
    y = ruler + RULER_H;
    for (const t of order) { rows[t.id] = { y, h: t.h, label: t.label }; y += t.h + TRACK_GAP; }
    return { head, ruler, rows, y0: top, y1: y };
  }
  y = top;
  for (const t of order) { rows[t.id] = { y, h: t.h, label: t.label }; y += t.h + TRACK_GAP; }
  const ruler = y, head = y + RULER_H;
  return { head, ruler, rows, y0: top, y1: head + HEAD_H };
}

function drawChrView(ctx, view, M) {
  const { w, h, dpr } = view;
  const T = tokens();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = T.panel;
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cssW = w / dpr;
  const plotW = cssW - GUTTER - PAD_R;
  const boxes = [];

  const A = blockLayout(4, +1);
  const B = blockLayout(A.y1 + LINK_H, -1);
  const blocks = [
    { hap: M.hap, L: A, win: M.win, genes: M.inView[M.hap], dir: +1 },
    { hap: M.other, L: B, win: M.otherWin, genes: M.inView[M.other], dir: -1 },
  ];
  const xOf = (win, bp) => GUTTER + ((bp - win.start) / (win.end - win.start)) * plotW;
  const pxPerBp = plotW / (M.win.end - M.win.start);
  const geneLevel = pxPerBp * 4000 >= (plotW < 400 ? 12 : 24); // an average 4 kb gene gets >= 24 px

  // allele links first, behind everything
  const linkTop = A.y1 - TRACK_GAP, linkBot = B.y0;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.45;
  for (const L of M.links) {
    const xa = xOf(M.win, (L.a.s + L.a.e) / 2), xb = xOf(M.otherWin, (L.b.s + L.b.e) / 2);
    const hovered = M.hover && (M.hover === L.a.g || M.hover === L.b.g);
    ctx.strokeStyle = hovered ? T.ink : T.line2;
    ctx.lineWidth = hovered ? 2 : 1;
    ctx.globalAlpha = hovered ? 1 : 0.6;
    ctx.beginPath();
    ctx.moveTo(xa, linkTop + 1);
    ctx.bezierCurveTo(xa, (linkTop + linkBot) / 2, xb, (linkTop + linkBot) / 2, xb, linkBot - 1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const blk of blocks) {
    const { L, win, genes, hap } = blk;
    const hapCol = hap === 'hap1' ? T.hap1 : T.hap2;
    // header
    ctx.textBaseline = 'middle';
    ctx.font = `600 11.5px ${T.sans}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = T.ink;
    ctx.fillText(`${HAP_LABEL[hap]} · ${M.chr}:${fmtMb(win.start)}–${fmtMb(win.end)} Mb · ${genes.length} genes`,
      GUTTER, L.head + HEAD_H / 2);
    ctx.fillStyle = hapCol;
    ctx.fillRect(PAD_X, L.head + 4, 8, HEAD_H - 8);

    // ruler
    const step = tickStep(win.end - win.start, plotW < 300 ? 3 : 8);
    const rTop = blk.dir > 0 ? L.ruler + RULER_H - 6 : L.ruler + 6;
    ctx.strokeStyle = T.ink;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(GUTTER, rTop + 0.5); ctx.lineTo(GUTTER + plotW, rTop + 0.5); ctx.stroke();
    ctx.font = `10px ${T.mono}`;
    ctx.fillStyle = T.ink2;
    ctx.textAlign = 'center';
    for (let bp = Math.ceil(win.start / step) * step; bp <= win.end; bp += step) {
      const tx = Math.round(xOf(win, bp)) + 0.5;
      const lab = fmtBp(bp, step);
      ctx.textAlign = tx + ctx.measureText(lab).width / 2 > cssW - 2 ? 'right'
        : tx - ctx.measureText(lab).width / 2 < GUTTER - 20 ? 'left' : 'center';
      ctx.beginPath();
      ctx.moveTo(tx, rTop); ctx.lineTo(tx, rTop + (blk.dir > 0 ? -4 : 4)); ctx.stroke();
      ctx.fillText(lab, ctx.textAlign === 'right' ? cssW - 2 : tx, blk.dir > 0 ? rTop - 10 : rTop + 11);
    }
    // track labels + baselines
    ctx.font = `10px ${T.mono}`;
    ctx.textAlign = 'right';
    for (const t of TRACKS) {
      const r = L.rows[t.id];
      ctx.fillStyle = T.ink2;
      ctx.fillText(r.label, GUTTER - 6, r.y + r.h / 2);
      ctx.fillStyle = T.panel2;
      ctx.fillRect(GUTTER, r.y, plotW, r.h);
    }

    // genes
    const lastLabelEnd = { plus: -Infinity, minus: -Infinity };
    for (const g of genes) {
      const x0 = Math.max(GUTTER, xOf(win, g.s)), x1 = Math.min(GUTTER + plotW, xOf(win, g.e));
      const gw = Math.max(1.2, x1 - x0);
      const hov = M.hover === g.g;
      const tile = M.tiles[hap].get(g.g);
      const rowId = g.d < 0 ? 'minus' : 'plus';
      const r = L.rows[rowId];
      const boxY = geneLevel ? r.y + r.h - 10 : r.y + 3;
      const boxH = geneLevel ? 8 : r.h - 6;
      ctx.fillStyle = hov ? T.ink : T.ink2;
      if (geneLevel && tile && tile.f && gw > 16) {
        // exon structure: thin intron line, UTR half-height, CDS full height
        ctx.fillRect(x0, boxY + boxH / 2 - 0.5, gw, 1);
        for (const [off, len, cds] of tile.f) {
          const ex0 = Math.max(GUTTER, xOf(win, g.s + off)), ex1 = Math.min(GUTTER + plotW, xOf(win, g.s + off + len));
          if (ex1 <= ex0) continue;
          const eh = cds ? boxH : boxH / 2;
          ctx.fillRect(ex0, boxY + (boxH - eh) / 2, Math.max(1, ex1 - ex0), eh);
        }
      } else {
        ctx.fillRect(x0, boxY, gw, boxH);
      }
      if (geneLevel) {
        const full = g.g, short = g.g.split('.')[1] || g.g;
        ctx.font = `10px ${T.mono}`;
        ctx.textAlign = 'left';
        const text = ctx.measureText(full).width + 6 < Math.max(gw, 90) ? full : short;
        const tw = ctx.measureText(text).width;
        const lx = Math.max(GUTTER, Math.min(x0, GUTTER + plotW - tw));
        if (lx > lastLabelEnd[rowId] + 4) {
          ctx.fillStyle = hov ? T.accentInk : T.ink;
          ctx.fillText(text, lx, r.y + 6);
          lastLabelEnd[rowId] = lx + tw;
        }
      }
      // dup class
      const d = dupOf(g.c);
      if (d) {
        const rr = L.rows.dup;
        ctx.fillStyle = T[d.tok];
        ctx.fillRect(x0, rr.y + 1, gw, rr.h - 2);
      }
      // synteny
      const sy = tile && SYN.find((x) => x.k === tile.y);
      if (sy) {
        const rr = L.rows.syn;
        ctx.fillStyle = T[sy.tok];
        ctx.fillRect(x0, rr.y + 1, gw, rr.h - 2);
      }
      // tau
      if (g.t != null) {
        const rr = L.rows.tau;
        const bh = Math.max(1, g.t * (rr.h - 2));
        ctx.fillStyle = T.ink3;
        ctx.fillRect(x0, rr.y + rr.h - 1 - bh, gw, bh);
      }
      // LSG
      if (g.l) {
        const rr = L.rows.lsg;
        ctx.fillStyle = T.accent;
        ctx.fillRect(x0, rr.y + 1, Math.max(3, gw), rr.h - 2);
      }
      const yTop = Math.min(...TRACKS.map((t) => L.rows[t.id].y));
      const yBot = Math.max(...TRACKS.map((t) => L.rows[t.id].y + L.rows[t.id].h));
      if (hov) {
        ctx.strokeStyle = T.ink;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x0 - 1.5, yTop - 1, gw + 3, yBot - yTop + 2);
      }
      boxes.push({ g: g.g, hap, x0, x1: x0 + gw, y0: yTop, y1: yBot, rec: g, rowY: r.y + r.h / 2 });
    }
  }

  // brush
  if (M.brush) {
    const a = Math.min(M.brush.x0, M.brush.x1), b = Math.max(M.brush.x0, M.brush.x1);
    ctx.fillStyle = T.accent;
    ctx.globalAlpha = 0.15;
    ctx.fillRect(a, A.y0, b - a, B.y1 - A.y0);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = T.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(a + 0.5, A.y0 + 0.5, b - a, B.y1 - A.y0 - 1);
  }
  return boxes;
}

// Tiles are keyed by floor(gene start / 1 Mb) (scripts/build_locus.py), so the set that
// exists is exactly the set the index's own starts imply -- no probing, no 404s.
async function loadTiles(hap, chr, genes) {
  const mbs = [...new Set(genes.map((g) => Math.floor(g.s / 1e6)))].sort((a, b) => a - b);
  const parts = await Promise.all(mbs.map((i) => loadLocusTile(hap, chr, i)));
  const m = new Map();
  for (const part of parts) for (const r of part || []) m.set(r.g, r);
  return m;
}

async function renderChromosome(hap, chr, onBack) {
  const other = hap === 'hap1' ? 'hap2' : 'hap1';
  const [idxA, idxB] = await Promise.all([loadLocusIndex(hap, chr), loadLocusIndex(other, chr)]);
  const idx = { [hap]: idxA, [other]: idxB };
  const len = { [hap]: Math.max(...idxA.map((g) => g.e), 1), [other]: Math.max(...idxB.map((g) => g.e), 1) };
  const byId = { [hap]: new Map(idxA.map((g) => [g.g, g])), [other]: new Map(idxB.map((g) => [g.g, g])) };
  const tiles = { [hap]: new Map(), [other]: new Map() };

  const q = query();
  let start = Number(q.start), end = Number(q.end);
  if (!(end > start)) { start = 0; end = len[hap]; }
  const M = {
    hap, other, chr, tiles, win: { start, end }, otherWin: { start, end },
    inView: {}, links: [], hover: null, brush: null, offset: 0,
  };

  const s = makeStage(CHR_H, 'map-chr-stage');
  const readout = el('div', { class: 'locus-readout map-readout muted', 'data-map-readout': '' }, ' ');
  const summary = el('p', { class: 'map-count', 'data-map-summary': '' });
  const legend = el('div', { class: 'map-legend', 'data-map-legend': 'chromosome' });
  const regionLabel = el('span', { class: 'mono map-region' });

  function clampWin(a, b) {
    let span = Math.max(MIN_SPAN, b - a);
    span = Math.min(span, len[hap]);
    let s0 = Math.round(a), s1 = Math.round(a + span);
    if (s0 < 0) { s0 = 0; s1 = span; }
    if (s1 > len[hap]) { s1 = len[hap]; s0 = Math.max(0, s1 - span); }
    return { start: s0, end: s1 };
  }

  function recompute() {
    const { start: a, end: b } = M.win;
    const genesA = idx[hap].filter((g) => inWin(g, a, b));
    // Other haplotype's window: same bp span, shifted by the median allele offset of the
    // genes in view (the two haplotypes are independently coordinated).
    const diffs = [];
    for (const g of genesA) {
      const t = tiles[hap].get(g.g);
      const o = t && t.al && byId[other].get(t.al);
      if (o) diffs.push(o.s - g.s);
    }
    const off = median(diffs);
    if (off != null) M.offset = off;
    else if (M.win.end - M.win.start >= len[hap] * 0.999) M.offset = 0;
    M.otherWin = { start: a + M.offset, end: b + M.offset };
    const genesB = idx[other].filter((g) => inWin(g, M.otherWin.start, M.otherWin.end));
    M.inView = { [hap]: genesA, [other]: genesB };
    const inB = new Set(genesB.map((g) => g.g));
    M.links = [];
    for (const g of genesA) {
      const t = tiles[hap].get(g.g);
      if (t && t.al && inB.has(t.al)) M.links.push({ a: g, b: byId[other].get(t.al) });
    }
    const allWhole = M.win.start === 0 && M.win.end === len[hap];
    regionLabel.textContent = `${chr}:${fmtMb(a)}–${fmtMb(b)} Mb`;
    summary.textContent = `${HAP_LABEL[hap]} ${chr}:${fmtMb(a)}–${fmtMb(b)} Mb, ${genesA.length} genes; `
      + `${HAP_LABEL[other]} ${fmtMb(Math.max(0, M.otherWin.start))}–${fmtMb(M.otherWin.end)} Mb, ${genesB.length} genes; `
      + `${M.links.length} allele links drawn${tilesReady ? '' : ' (loading allele and synteny tiles…)'}.`;
    zoomOut.disabled = allWhole;
    zoomIn.disabled = (b - a) <= MIN_SPAN;
    legend.replaceChildren(...legendRows());
    setProbe();
  }

  function legendRows() {
    const A = M.inView[hap], B = M.inView[other];
    const cnt = (arr, f) => arr.reduce((n, g) => n + (f(g) ? 1 : 0), 0);
    const nums = (f) => `${cnt(A, f)} / ${cnt(B, f)}`;
    const sw = (tok) => el('i', { class: `map-sw map-sw-${tok}`, 'aria-hidden': 'true' });
    const item = (tok, label, n) => el('span', { class: 'map-li' }, sw(tok), `${label} `, el('span', { class: 'mono' }, n));
    const synOf = (h) => (g) => (tiles[h].get(g.g) || {}).y;
    const row = (name, ...items) => el('div', { class: 'map-lrow' }, el('span', { class: 'map-lname' }, name), ...items);
    const synA = synOf(hap), synB = synOf(other);
    return [
      el('p', { class: 'muted map-note' },
        `Counts are genes in the current window, ${HAP_LABEL[hap]} / ${HAP_LABEL[other]}.`),
      row('Genes', item('ink', 'plus strand', nums((g) => g.d >= 0)), item('ink', 'minus strand', nums((g) => g.d < 0))),
      row('Duplication', ...DUP.map((d) => item(d.tok, d.label, nums((g) => dupOf(g.c) === d)))),
      row('Synteny', ...SYN.map((c) => item(c.tok, c.label,
        tilesReady ? `${cnt(A, (g) => synA(g) === c.k)} / ${cnt(B, (g) => synB(g) === c.k)}` : '…'))),
      row('τ', el('span', { class: 'map-li' }, 'bar height = tissue specificity, 0 to 1; with a value ',
        el('span', { class: 'mono' }, nums((g) => g.t != null)))),
      row('LSG pool', item('accent', 'in the lineage-specific pool (phylostratum ≥ 18)', nums((g) => g.l))),
      row('Alleles', el('span', { class: 'map-li' }, 'curves join a gene to its allele on the other haplotype; drawn ',
        el('span', { class: 'mono' }, String(M.links.length)))),
    ];
  }

  // A stable, test-readable point: the centre of the first gene in view on the focal row,
  // so a driven check clicks a real gene without knowing the layout.
  function setProbe() {
    requestAnimationFrame(() => {
      const b = s.boxes.find((x) => x.hap === hap && x.x1 - x.x0 >= 1);
      if (b) {
        s.stage.dataset.probeX = String(Math.round((b.x0 + b.x1) / 2));
        s.stage.dataset.probeY = String(Math.round(b.rowY));
        s.stage.dataset.probeGene = b.g;
      }
      s.stage.dataset.genesInView = String(M.inView[hap].length);
    });
  }

  function setWin(a, b) {
    M.win = clampWin(a, b);
    recompute();
    s.redraw();
    const whole = M.win.start === 0 && M.win.end === len[hap];
    setQuery(whole ? {} : { start: M.win.start, end: M.win.end });
  }
  const zoomBy = (f) => {
    const c = (M.win.start + M.win.end) / 2, half = (M.win.end - M.win.start) * f / 2;
    setWin(c - half, c + half);
  };
  const panBy = (f) => {
    const d = (M.win.end - M.win.start) * f;
    setWin(M.win.start + d, M.win.end + d);
  };

  const btn = (label, title, fn, attr) => el('button', {
    class: 'btn map-btn', type: 'button', title, 'aria-label': title, onclick: fn, ...attr,
  }, label);
  const zoomIn = btn('+', 'Zoom in', () => zoomBy(0.5), { 'data-map-zoom': 'in' });
  const zoomOut = btn('−', 'Zoom out', () => zoomBy(2), { 'data-map-zoom': 'out' });
  const controls = el('div', { class: 'map-controls' },
    btn('← genome', 'Back to the genome', onBack, { 'data-map-back': '' }),
    el('strong', { class: 'map-title' }, `${chr} · ${HAP_LABEL[hap]}`),
    el('span', { class: 'map-spacer' }),
    btn('◀', 'Pan left', () => panBy(-0.5), { 'data-map-pan': 'left' }),
    zoomOut, zoomIn,
    btn('▶', 'Pan right', () => panBy(0.5), { 'data-map-pan': 'right' }),
    btn('Whole', 'Show the whole chromosome', () => setWin(0, len[hap]), { 'data-map-zoom': 'reset' }),
    regionLabel);

  // pointer: mouse drag = brush-to-zoom; touch drag = pan; a tap/click = open the gene
  const xToBp = (x) => M.win.start + ((x - GUTTER) / (s.cssW - GUTTER - PAD_R)) * (M.win.end - M.win.start);
  let drag = null;
  const pick = (x, y) => {
    let best = null, bd = Infinity;
    for (const b of s.boxes) {
      if (y < b.y0 - 2 || y > b.y1 + 2) continue;
      const d = x < b.x0 ? b.x0 - x : x > b.x1 ? x - b.x1 : 0;
      if (d < bd) { bd = d; best = b; }
    }
    return bd <= 6 ? best : null;
  };
  s.canvas.addEventListener('pointerdown', (ev) => {
    const p = s.pointIn(ev.clientX, ev.clientY);
    drag = { x: p.x, y: p.y, type: ev.pointerType, win: { ...M.win }, moved: false };
    try { s.canvas.setPointerCapture(ev.pointerId); } catch { /* synthetic events */ }
  });
  s.canvas.addEventListener('pointermove', (ev) => {
    const p = s.pointIn(ev.clientX, ev.clientY);
    if (drag) {
      if (Math.abs(p.x - drag.x) > 6) drag.moved = true;
      if (!drag.moved) return;
      if (drag.type === 'mouse') {
        M.brush = { x0: Math.max(GUTTER, drag.x), x1: Math.max(GUTTER, Math.min(p.x, s.cssW - PAD_R)) };
        s.redraw();
      } else {
        const bpPerPx = (drag.win.end - drag.win.start) / (s.cssW - GUTTER - PAD_R);
        const d = (drag.x - p.x) * bpPerPx;
        M.win = clampWin(drag.win.start + d, drag.win.end + d);
        recompute(); s.redraw();
      }
      return;
    }
    if (ev.pointerType !== 'mouse') return;
    const hit = pick(p.x, p.y);
    s.canvas.style.cursor = hit ? 'pointer' : (p.x > GUTTER ? 'crosshair' : 'default');
    if (hit) {
      const g = hit.rec, t = tiles[hit.hap].get(g.g) || {};
      const d = dupOf(g.c), sy = SYN.find((x) => x.k === t.y);
      readout.textContent = `${g.g} · ${chr}:${g.s.toLocaleString('en-US')}–${g.e.toLocaleString('en-US')} `
        + `(${g.d < 0 ? '−' : '+'}) · ${d ? d.label : '—'} · ${sy ? sy.label : 'synteny —'} · `
        + `τ ${g.t == null ? '—' : g.t.toFixed(2)}${g.p ? ' · peaks in ' + g.p : ''}`
        + `${g.l ? ' · LSG pool' : ''}${t.al ? ' · allele ' + t.al : ''}`;
    } else {
      readout.textContent = p.x > GUTTER
        ? `${chr} ${(Math.max(0, xToBp(p.x)) / 1e6).toFixed(3)} Mb (${HAP_LABEL[hap]}) · drag to zoom` : ' ';
    }
    const next = hit ? hit.g : null;
    if (next !== M.hover) { M.hover = next; s.redraw(); }
  });
  const endDrag = (ev) => {
    if (!drag) return;
    const p = s.pointIn(ev.clientX, ev.clientY);
    const d = drag;
    drag = null;
    if (d.moved && d.type === 'mouse' && M.brush) {
      const a = xToBp(Math.min(M.brush.x0, M.brush.x1)), b = xToBp(Math.max(M.brush.x0, M.brush.x1));
      M.brush = null;
      setWin(a, b);
    } else if (d.moved) {
      setWin(M.win.start, M.win.end);
    } else if (ev.type === 'pointerup') {
      const hit = pick(p.x, p.y);
      if (hit) location.hash = `#/gene/${hit.g}`;
    }
  };
  s.canvas.addEventListener('pointerup', endDrag);
  s.canvas.addEventListener('pointercancel', (ev) => { M.brush = null; endDrag(ev); s.redraw(); });
  s.canvas.addEventListener('pointerleave', () => {
    if (M.hover && !drag) { M.hover = null; readout.textContent = ' '; s.redraw(); }
  });

  let tilesReady = false;
  M.win = clampWin(start, end);
  s.setDraw((ctx, view) => drawChrView(ctx, view, M));
  recompute();
  s.redraw();

  Promise.all([loadTiles(hap, chr, idxA), loadTiles(other, chr, idxB)]).then(([ta, tb]) => {
    tiles[hap] = ta; tiles[other] = tb; M.tiles = tiles;
    tilesReady = true;
    recompute(); s.redraw();
    s.stage.dataset.tiles = 'ready';
  });

  return el('div', { class: 'map-chr', 'data-map-view': 'chromosome' },
    controls,
    summary,
    el('div', { class: 'map-stage-wrap' }, s.stage),
    readout,
    legend,
    el('p', { class: 'muted map-note' },
      'Drag across the tracks to zoom (on a phone, drag to pan and use the buttons to zoom). '
      + 'Zoomed in far enough, each gene shows its exons (coding parts taller) and its ID; click or tap a gene to open '
      + 'its page. The lower haplotype is shifted by the median allele offset of the genes in '
      + 'view, because the two haplotypes are coordinated independently.'));
}

/** Top-level entry, called from app.js's #/map route. `chr` is null for the whole-genome
 *  view. Returns a DOM node; the route handler owns the page chrome (title, hap toggle). */
export async function renderMap(hap, chr) {
  return chr
    ? renderChromosome(hap, chr, () => { location.hash = `#/map/${hap}`; })
    : renderOverview(hap, (pickedChr) => { location.hash = `#/map/${hap}/${pickedChr}`; });
}
