// Module: locus. The gene in its neighbourhood, drawn the way a manuscript figure
// draws a locus -- exon boxes on a strand line -- rather than as a stack of tracks.
//
// Mobile is a first-class target here, not a media query. Two rules drive the design:
//
//   1. Genes are tap targets. WCAG 2.2 SC 2.5.8 wants 24 CSS px; where targets are
//      smaller the spacing allowance applies, so what this enforces is that adjacent
//      gene CENTRES stay >= 24 px apart. When they cannot, the window SHRINKS (fewer
//      genes) rather than silently clamping -- a clamped view looks fine in a
//      screenshot and fails in the hand.
//   2. SC 2.5.1 Pointer Gestures is Level A. Panning has always-visible step buttons
//      and arrow-key equivalents; no interaction here is gesture-only.
//
// Canvas discipline follows the DPR/ResizeObserver rules in references/canvas-fitting:
// observe the CONTAINER (canvas is absolutely positioned, so it cannot feed back),
// device-pixel-content-box with a Safari try/catch, guard the width assignment because
// it resets all 2D context state, redraw synchronously, and re-arm a dpr watcher.
import { el, clear } from '../core/dom.js';
import { loadLocusTile } from '../core/data.js';

const MB = 1_000_000;
const MIN_CENTRE_GAP = 24;   // CSS px, SC 2.5.8 spacing allowance
const MAX_DPR = 2;           // cap fill rate on phones
const H = 168;               // CSS px, drawing height
const PAD_X = 10;

const short = (id) => id.split('.')[1] || id;
const isNarrow = () => window.matchMedia('(max-width: 640px)').matches;
const defaultFlank = () => (isNarrow() ? 4 : 10);

// Canvas fillStyle does NOT resolve CSS custom properties -- assigning
// 'var(--c-tandem)' is silently invalid and leaves the previous colour. So the
// tokens are read off the document and cached, and re-read when the theme flips.
const CLASS_VAR = {
  T: '--c-tandem', A: '--c-priv', S: '--c-core', D: '--c-disp', C: '--c-nonsyn',
};
let PALETTE = null;
function palette() {
  if (PALETTE) return PALETTE;
  const cs = getComputedStyle(document.documentElement);
  const g = (v, fb) => (cs.getPropertyValue(v).trim() || fb);
  PALETTE = {
    T: g('--c-tandem', '#e87ba4'), A: g('--c-priv', '#eda100'),
    S: g('--c-core', '#2a78d6'), D: g('--c-disp', '#eb6834'),
    C: g('--c-nonsyn', '#1baf7a'),
    ink: g('--ink', '#111'), ink3: g('--ink-3', '#888'),
    line: g('--line-2', '#ccc'), accent: g('--accent', '#2a78d6'),
    panel: g('--panel', '#fff'),
  };
  return PALETTE;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { PALETTE = null; });

// A gene's letters are concatenated (e.g. "ADS"); colour by the first structural one.
const fillFor = (c) => {
  const p = palette();
  if (!c) return p.ink3;
  for (const k of ['T', 'A', 'S', 'D', 'C']) if (c.includes(k)) return p[k];
  return p.ink3;
};

/** Tiles covering a gene's neighbourhood. Usually 1, at a tile edge 2. */
async function loadWindow(gene, flank) {
  const mb = Math.floor(gene.start / MB);
  const tiles = [await loadLocusTile(gene.hap, gene.chr, mb)];
  let genes = tiles[0];
  let i = genes.findIndex((r) => r.g === gene.id);
  if (i < 0) return null;
  const need = [];
  if (i < flank && mb > 0) need.push(mb - 1);
  if (i > genes.length - 1 - flank) need.push(mb + 1);
  for (const m of need) {
    try { tiles.push(await loadLocusTile(gene.hap, gene.chr, m)); } catch { /* chromosome edge */ }
  }
  genes = tiles.flat().sort((a, b) => a.s - b.s);
  i = genes.findIndex((r) => r.g === gene.id);
  return { genes, i };
}

function geneCard(g) {
  const card = el('div', { class: 'card' },
    el('h2', {}, 'Locus', el('span', { class: 'tag' }, 'v5.1 structure')));
  const stage = el('div', { class: 'locus-stage' });
  const canvas = el('canvas', { class: 'locus-canvas' });
  stage.append(canvas);
  const caption = el('p', { class: 'muted', style: 'font-size:11.5px;margin:8px 0 0' },
    'Loading the neighbourhood…');
  const readout = el('div', { class: 'locus-readout muted' }, ' ');

  // Step controls exist so panning is never gesture-only (SC 2.5.1, Level A).
  const mkBtn = (label, aria, fn) => el('button', {
    class: 'locus-btn', type: 'button', 'aria-label': aria, onclick: fn,
  }, label);

  const state = { flank: defaultFlank(), genes: null, i: 0, offset: 0, boxes: [], view: null };

  const controls = el('div', { class: 'locus-controls' },
    mkBtn('←', 'Pan to earlier genes', () => { state.offset -= 1; refresh(); }),
    mkBtn('→', 'Pan to later genes', () => { state.offset += 1; refresh(); }),
    el('span', { class: 'locus-spacer' }),
    mkBtn('−', 'Show fewer genes', () => { state.flank = Math.max(1, state.flank - 2); refresh(); }),
    mkBtn('+', 'Show more genes', () => { state.flank = Math.min(30, state.flank + 2); refresh(); }),
  );

  card.append(stage, readout, controls, caption);

  // ---- rendering ---------------------------------------------------------------
  const ctx = canvas.getContext('2d', { alpha: false });
  let view = { w: 0, h: 0, dpr: 0 };

  function layout() {
    // Which genes are visible, after honouring the 24px centre-gap rule by shrinking.
    if (!state.genes) return null;
    const n = state.genes.length;
    const centre = Math.min(n - 1, Math.max(0, state.i + state.offset));
    const cssW = Math.max(240, stage.getBoundingClientRect().width) - PAD_X * 2;
    let flank = state.flank;
    let lo, hi, span, clamped = false;
    for (;;) {
      lo = Math.max(0, centre - flank);
      hi = Math.min(n - 1, centre + flank);
      const vis = state.genes.slice(lo, hi + 1);
      span = Math.max(1, vis[vis.length - 1].e - vis[0].s);
      const gap = cssW / Math.max(1, vis.length - 1);
      if (gap >= MIN_CENTRE_GAP || flank <= 1) { clamped = gap < MIN_CENTRE_GAP; break; }
      flank -= 1;
    }
    return { lo, hi, span, start: state.genes[lo].s, cssW, flank, clamped };
  }

  function draw() {
    const L = layout();
    if (!L) return;
    const { w, h, dpr } = view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = palette().panel;
    ctx.fillRect(0, 0, w, h);
    // setTransform OVERRIDES; ctx.scale() multiplies and would compound across redraws.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cssW = w / dpr, cssH = h / dpr;
    const x = (bp) => PAD_X + ((bp - L.start) / L.span) * (cssW - PAD_X * 2);
    const midY = Math.round(cssH * 0.52) + 0.5;   // half-pixel: a 1px line stays 1 physical px

    const P = palette();
    const { ink, ink3, line, accent } = P;

    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(cssW, midY); ctx.stroke();

    state.boxes = [];
    for (let k = L.lo; k <= L.hi; k++) {
      const r = state.genes[k];
      const x0 = x(r.s), x1 = Math.max(x(r.e), x(r.s) + 1.5);
      const fwd = r.d > 0;
      const yBase = fwd ? midY - 26 : midY + 26;      // + strand above, - strand below
      const focal = r.g === g.id;

      // intron line
      ctx.strokeStyle = focal ? accent : ink3;
      ctx.lineWidth = focal ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(x0, yBase); ctx.lineTo(x1, yBase); ctx.stroke();

      // exon boxes: CDS thick, UTR thin -- the manuscript convention
      ctx.fillStyle = fillFor(r.c);
      for (const [off, len, kind] of r.f) {
        const bx = x(r.s + off), bw = Math.max(x(r.s + off + len) - bx, 1);
        const bh = kind ? 13 : 7;
        ctx.fillRect(bx, yBase - bh / 2, bw, bh);
      }
      // strand arrowhead at the 3' end
      ctx.fillStyle = focal ? accent : ink3;
      const ax = fwd ? x1 : x0, dir = fwd ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(ax + dir * 6, yBase);
      ctx.lineTo(ax, yBase - 4.5);
      ctx.lineTo(ax, yBase + 4.5);
      ctx.closePath(); ctx.fill();

      if (focal) {
        ctx.strokeStyle = accent; ctx.lineWidth = 1;
        const pad = 9;
        ctx.strokeRect(Math.round(x0 - 4) + 0.5, Math.round(yBase - pad - 6) + 0.5,
                       Math.round(x1 - x0 + 8), Math.round(pad * 2 + 12));
      }

      // label, only where it fits without colliding
      const w0 = x1 - x0;
      const gap = (L.cssW - PAD_X * 2) / Math.max(1, L.hi - L.lo);
      if (focal || gap > 46) {
        ctx.fillStyle = focal ? ink : ink3;
        ctx.font = `${focal ? '600 ' : ''}10.5px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textAlign = 'center';
        const label = short(r.g);
        const ly = fwd ? yBase - 18 : yBase + 24;
        ctx.fillText(label, Math.min(cssW - 24, Math.max(24, (x0 + x1) / 2)), ly);
      }
      state.boxes.push({ r, x0, x1, cx: (x0 + x1) / 2, y: yBase });
    }

    // scale bar
    const kb = (L.span / 1000).toFixed(L.span > 50000 ? 0 : 1);
    ctx.fillStyle = ink3;
    ctx.font = '10.5px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${kb} kb`, PAD_X, cssH - 5);
    ctx.textAlign = 'right';
    ctx.fillText(`${L.hi - L.lo + 1} genes`, cssW - PAD_X, cssH - 5);

    caption.textContent =
      `${state.genes[L.lo].g} to ${state.genes[L.hi].g}. Forward strand above the line, reverse below. `
      + `Thick blocks are coding, thin are UTR. Colour is duplication class. Tap a gene to open it.`
      + (L.clamped ? ' Genes are packed tighter than the 24 px target guideline here; use − to widen.' : '');
  }

  // ---- canvas fitting ----------------------------------------------------------
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const r = stage.getBoundingClientRect();
    if (!r.width) return false;
    const w = Math.round(r.width * dpr), h = Math.round(H * dpr);
    // Assigning width/height wipes the bitmap AND resets every 2D context property,
    // even when set to the value it already has. Guard on a real change.
    if (w === view.w && h === view.h && dpr === view.dpr) return false;
    canvas.width = w; canvas.height = h;
    canvas.style.width = (w / dpr) + 'px';   // fractional is correct; rounding reintroduces blur
    canvas.style.height = (h / dpr) + 'px';
    view = { w, h, dpr };
    return true;
  }
  function refresh() { fit(); draw(); }

  const ro = new ResizeObserver(() => { fit(); draw(); });   // redraw SYNCHRONOUSLY
  try { ro.observe(stage, { box: 'device-pixel-content-box' }); }  // throws in Safari
  catch { ro.observe(stage, { box: 'content-box' }); }

  // A content-box observer does not fire when only dpr changes (zoom, monitor swap).
  let dropDpr = null;
  (function watchDpr() {
    dropDpr?.();
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', watchDpr, { once: true });
    dropDpr = () => mq.removeEventListener('change', watchDpr);
    refresh();
  })();

  // ---- interaction -------------------------------------------------------------
  // getBoundingClientRect is post-transform and post-zoom, so this hit test stays
  // correct under browser zoom and buffer resize without separate bookkeeping.
  const pick = (clientX) => {
    const r = canvas.getBoundingClientRect();
    const cx = (clientX - r.left) * (canvas.width / r.width) / view.dpr;
    let best = null, bd = Infinity;
    for (const b of state.boxes) {
      const d = (cx >= b.x0 && cx <= b.x1) ? 0 : Math.min(Math.abs(cx - b.x0), Math.abs(cx - b.x1));
      if (d < bd) { bd = d; best = b; }
    }
    return bd <= MIN_CENTRE_GAP / 2 ? best : null;   // generous target, per the spacing rule
  };

  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const b = pick(ev.clientX);
    canvas.style.cursor = b ? 'pointer' : 'default';
    readout.textContent = b
      ? `${b.r.g}${b.r.n ? ' · ' + b.r.n : ''}${b.r.p ? ' · peaks in ' + b.r.p : ''}`
      : ' ';
  });
  canvas.addEventListener('pointerleave', () => { readout.textContent = ' '; });
  canvas.addEventListener('click', (ev) => {
    const b = pick(ev.clientX);
    if (b && b.r.g !== g.id) location.hash = `#/gene/${b.r.g}`;
    else if (b) readout.textContent = `${b.r.g} · this gene`;
  });
  // Touch: first tap reads out, so a phone user can inspect without navigating away.
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse') return;
    const b = pick(ev.clientX);
    if (b) readout.textContent = `${b.r.g}${b.r.n ? ' · ' + b.r.n : ''}`;
  });

  stage.tabIndex = 0;
  stage.setAttribute('role', 'group');
  stage.setAttribute('aria-label', 'Gene neighbourhood. Left and right arrows pan.');
  stage.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft') { state.offset -= 1; refresh(); ev.preventDefault(); }
    if (ev.key === 'ArrowRight') { state.offset += 1; refresh(); ev.preventDefault(); }
  });

  // ---- data --------------------------------------------------------------------
  loadWindow(g, 12).then((res) => {
    if (!res) { caption.textContent = 'No locus tile for this gene.'; return; }
    state.genes = res.genes; state.i = res.i;
    refresh();
  }).catch((e) => { caption.textContent = `Locus unavailable: ${e.message}`; });

  return card;
}

export default { id: 'locus', label: 'Locus', geneCard };
