// Module: mirror. The two-strand, haplotype-native view -- the syntenic HAP2 locus drawn
// flipped to face its HAP1 counterpart, with ribbons between allele pairs. Plan section 2.2:
// the only public resource that knows both phased haplotypes should show them together.
//
// No new data build: reuses the SAME locus tiles the Locus card fetches (which already
// carry each gene's allele-partner id, `al`, alongside its own position and structure) plus
// the ordinary per-gene shard (`getGene`) to resolve a partner's own position and Ks. Ribbon
// crossing (a local inversion) and copy-number asymmetry are not detected specially -- they
// fall out for free from mapping each side's genes by its OWN true coordinate, per the same
// "let the data draw itself" approach as the rest of this project's figures.
//
// Deliberately NOT drawn yet: tandem-array brackets grouping array members into one visual
// unit. The ribbon-only view already shows a size mismatch as an uneven number of ribbons
// landing in a shorter span; a dedicated bracket is a follow-up, not silently pretended here.
import { el } from '../core/dom.js';
import { getGene, loadLocusTile } from '../core/data.js';
import { palette, fillFor } from '../core/palette.js';

const MB = 1_000_000;
const MAX_DPR = 2;
const H = 210;
const PAD_X = 10;
const isNarrow = () => window.matchMedia('(max-width: 640px)').matches;
const defaultFlank = () => (isNarrow() ? 4 : 8);
const short = (id) => id.split('.')[1] || id;

/** Tiles covering a gene's own neighbourhood, same approach as the Locus card. */
async function loadWindow(hap, chr, start, geneId, flank) {
  const mb = Math.floor(start / MB);
  const tiles = [await loadLocusTile(hap, chr, mb)];
  let genes = tiles[0];
  let i = genes.findIndex((r) => r.g === geneId);
  if (i < 0) return null;
  const need = [];
  if (i < flank && mb > 0) need.push(mb - 1);
  if (i > genes.length - 1 - flank) need.push(mb + 1);
  for (const m of need) {
    try { tiles.push(await loadLocusTile(hap, chr, m)); } catch { /* chromosome edge */ }
  }
  genes = tiles.flat().sort((a, b) => a.s - b.s);
  i = genes.findIndex((r) => r.g === geneId);
  const lo = Math.max(0, i - flank), hi = Math.min(genes.length - 1, i + flank);
  return genes.slice(lo, hi + 1);
}

/** A partner's own tile record (position + structure) plus its Ks against THIS gene,
 *  read from the partner's full shard (tiles do not carry Ks, only the partner id). */
async function resolvePartner(partnerId) {
  const partnerGene = await getGene(partnerId);
  if (!partnerGene) return null;
  const mb = Math.floor(partnerGene.start / MB);
  let tile;
  try { tile = await loadLocusTile(partnerGene.hap, partnerGene.chr, mb); }
  catch { return null; }
  const rec = tile.find((r) => r.g === partnerId);
  if (!rec) return null;
  return { rec, ks: (partnerGene.allele || {}).ks };
}

function draw(ctx, view, top, bottom, pairs, focalId) {
  const { w, h, dpr } = view;
  const P = palette();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = P.panel;
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cssW = w / dpr, cssH = h / dpr;

  const topY = 34, botY = cssH - 34;
  const xFor = (genes) => {
    if (!genes.length) return () => PAD_X;
    const lo = genes[0].s, hi = Math.max(genes[genes.length - 1].e, lo + 1);
    return (bp) => PAD_X + ((bp - lo) / (hi - lo)) * (cssW - PAD_X * 2);
  };
  const xTop = xFor(top), xBot = xFor(bottom);
  const boxes = [];

  function strip(genes, xf, y, faceDown) {
    ctx.strokeStyle = P.line;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cssW, y); ctx.stroke();
    for (const r of genes) {
      const x0 = xf(r.s), x1 = Math.max(xf(r.e), x0 + 1.5);
      const focal = r.g === focalId;
      const boxY = faceDown ? y + 4 : y - 4 - 13;
      ctx.fillStyle = fillFor(r.c);
      for (const [off, len, kind] of r.f) {
        const bx = xf(r.s + off), bw = Math.max(xf(r.s + off + len) - bx, 1);
        const bh = kind ? 13 : 7;
        ctx.fillRect(bx, faceDown ? y + 4 : y - 4 - bh, bw, bh);
      }
      if (focal) {
        ctx.strokeStyle = P.accent; ctx.lineWidth = 1.4;
        ctx.strokeRect(Math.round(x0 - 3) + 0.5, Math.round(boxY) + 0.5,
                       Math.round(x1 - x0 + 6), 13);
      }
      ctx.fillStyle = focal ? P.ink : P.ink3;
      ctx.font = `${focal ? '600 ' : ''}10px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(short(r.g), Math.min(cssW - 20, Math.max(20, (x0 + x1) / 2)),
        faceDown ? y + 26 : y - 20);
      boxes.push({ g: r.g, x0, x1, y: faceDown ? y + 10 : y - 10 });
    }
  }
  strip(top, xTop, topY, true);
  strip(bottom, xBot, botY, false);

  // Ribbons: opacity from Ks (capped -- Ks approaches saturation well before 1.0, and the
  // point is relative divergence within this view, not an absolute calibrated scale).
  for (const { a, b, ks } of pairs) {
    const ax0 = xTop(a.s), ax1 = xTop(a.e);
    const bx0 = xBot(b.s), bx1 = xBot(b.e);
    const ax = (ax0 + ax1) / 2, bx = (bx0 + bx1) / 2;
    const alpha = ks == null ? 0.18 : 0.15 + 0.65 * Math.min(1, ks / 0.5);
    ctx.strokeStyle = P.accent;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ax, topY + 17);
    ctx.bezierCurveTo(ax, (topY + botY) / 2, bx, (topY + botY) / 2, bx, botY - 17);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  return boxes;
}

function geneCard(g) {
  if (!g.allele) return null;
  const otherLabel = g.hap === 'hap1' ? 'HAP2 (AlbH)' : 'HAP1 (TreH)';
  const thisLabel = g.hap === 'hap1' ? 'HAP1 (TreH)' : 'HAP2 (AlbH)';

  const card = el('div', { class: 'card' },
    el('h2', {}, 'Mirror', el('span', { class: 'tag' }, 'both haplotypes')));
  const stage = el('div', { class: 'locus-stage', style: `height:${H}px` });
  const canvas = el('canvas', { class: 'locus-canvas' });
  stage.append(canvas);
  const readout = el('div', { class: 'locus-readout muted' }, ' ');
  const caption = el('p', { class: 'muted', style: 'font-size:11.5px;margin:8px 0 0' },
    'Loading the syntenic neighbourhood…');
  const legend = el('p', { class: 'muted', style: 'font-size:11px;margin:4px 0 0' },
    `${thisLabel} above, ${otherLabel} below, facing each other. Ribbon shade is Ks `
    + '(darker = more diverged); no ribbon means no allele on the other side, a candidate '
    + 'hemizygous locus. Tap a gene on either strand to open its page.');
  card.append(stage, readout, caption, legend);

  const ctx = canvas.getContext('2d', { alpha: false });
  let view = { w: 0, h: 0, dpr: 0 };
  const state = { top: null, bottom: null, pairs: null, boxes: [] };

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const r = stage.getBoundingClientRect();
    if (!r.width) return false;
    const w = Math.round(r.width * dpr), h = Math.round(H * dpr);
    if (w === view.w && h === view.h && dpr === view.dpr) return false;
    canvas.width = w; canvas.height = h;
    canvas.style.width = (w / dpr) + 'px';
    canvas.style.height = (h / dpr) + 'px';
    view = { w, h, dpr };
    return true;
  }
  function redraw() {
    if (!state.top) return;
    state.boxes = draw(ctx, view, state.top, state.bottom, state.pairs, g.id);
  }
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

  const pick = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    const cx = (clientX - r.left) * (canvas.width / r.width) / view.dpr;
    const cy = (clientY - r.top) * (canvas.height / r.height) / view.dpr;
    let best = null, bd = Infinity;
    for (const b of state.boxes) {
      if (Math.abs(cy - b.y) > 14) continue;
      const d = (cx >= b.x0 && cx <= b.x1) ? 0 : Math.min(Math.abs(cx - b.x0), Math.abs(cx - b.x1));
      if (d < bd) { bd = d; best = b; }
    }
    return bd <= 20 ? best : null;
  };
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const b = pick(ev.clientX, ev.clientY);
    canvas.style.cursor = b ? 'pointer' : 'default';
    readout.textContent = b ? b.g : ' ';
  });
  canvas.addEventListener('pointerleave', () => { readout.textContent = ' '; });
  canvas.addEventListener('click', (ev) => {
    const b = pick(ev.clientX, ev.clientY);
    if (b) location.hash = `#/gene/${b.g}`;
  });
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse') return;
    const b = pick(ev.clientX, ev.clientY);
    if (b) readout.textContent = b.g;
  });

  (async () => {
    const top = await loadWindow(g.hap, g.chr, g.start, g.id, defaultFlank());
    if (!top) { caption.textContent = 'No locus tile for this gene.'; return; }

    const partners = await Promise.all(
      top.filter((r) => r.al).map(async (r) => ({ topRec: r, partner: await resolvePartner(r.al) })));
    const resolved = partners.filter((p) => p.partner);

    const bottom = resolved.map((p) => p.partner.rec).sort((a, b) => a.s - b.s);
    const pairs = resolved.map((p) => ({ a: p.topRec, b: p.partner.rec, ks: p.partner.ks }));

    state.top = top; state.bottom = bottom; state.pairs = pairs;
    const noPartner = top.length - resolved.length;
    caption.textContent = `${top.length} genes in this neighbourhood, ${resolved.length} with `
      + `an allele on ${otherLabel}${noPartner ? `, ${noPartner} with none` : ''}.`;
    refresh();
  })().catch((e) => { caption.textContent = `Mirror unavailable: ${e.message}`; });

  return card;
}

export default { id: 'mirror', label: 'Mirror', geneCard };
