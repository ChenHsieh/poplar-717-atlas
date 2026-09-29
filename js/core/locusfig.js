// Shared drawing for the array and pair pages: genes from the locus tiles drawn to scale on
// one or two haplotype tracks, with lines joining allele pairs. No colour is set here; every
// mark carries a class and css/arrays.css paints it from the theme tokens.
//
// Tile records (data/locus/tile/<hap>/<chr>/<Mb>.json) carry, per gene: g id, s/e coordinates,
// d strand (+1/-1), al allele id, y synteny class, and f = [[offset, length, isCDS], ...]
// relative to s in genomic orientation. f is the only exon structure in the release.
import { loadLocusTile, getGene } from './data.js';

const NS = 'http://www.w3.org/2000/svg';
export function svgEl(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}

/** Tile genes overlapping [from, to] on one chromosome, sorted by start. Missing tiles
 *  (chromosome ends, scaffolds without tiles) are skipped, not errors. */
export async function genesIn(hap, chr, from, to) {
  const a = Math.max(0, Math.floor(from / 1e6));
  const b = Math.floor(to / 1e6);
  const out = new Map();
  for (let m = a; m <= b; m += 1) {
    try {
      const t = await loadLocusTile(hap, chr, m);
      for (const r of t || []) if (r.e >= from && r.s <= to) out.set(r.g, r);
    } catch { /* no tile for this Mb */ }
  }
  return [...out.values()].sort((x, y) => x.s - y.s || (x.g < y.g ? -1 : 1));
}

/** One tile record for a gene (with its exon features), or null. */
export async function tileRecord(g) {
  const rows = await genesIn(g.hap, g.chr, g.start, g.end);
  return rows.find((r) => r.g === g.id) || null;
}

/** The region on the OTHER haplotype that matches a set of genes. Uses the genes' own alleles
 *  first; if none has one, the alleles of up to `flank` flanking genes on each side. Returns
 *  {hap, chr, from, to, via: 'members'|'flanks', anchors: [[ownId, otherId]]} or null. */
export async function matchingRegion(own, ownRows, focusIds, flank = 12) {
  const focus = new Set(focusIds);
  let anchors = ownRows.filter((r) => focus.has(r.g) && r.al).map((r) => [r.g, r.al]);
  let via = 'members';
  if (!anchors.length) {
    via = 'flanks';
    const idx = ownRows.map((r, i) => (focus.has(r.g) ? i : -1)).filter((i) => i >= 0);
    const lo = Math.min(...idx);
    const hi = Math.max(...idx);
    anchors = ownRows.filter((r, i) => r.al && ((i < lo && i >= lo - flank) || (i > hi && i <= hi + flank)))
      .map((r) => [r.g, r.al]);
  }
  if (!anchors.length) return null;
  const others = (await Promise.all(anchors.map(([, id]) => getGene(id).catch(() => null)))).filter(Boolean);
  if (!others.length) return null;
  // Majority chromosome: a stray allele call on another chromosome must not stretch the window.
  const count = new Map();
  others.forEach((o) => count.set(o.chr, (count.get(o.chr) || 0) + 1));
  const chr = [...count.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0][0];
  const on = others.filter((o) => o.chr === chr);
  const from = Math.min(...on.map((o) => o.start));
  const to = Math.max(...on.map((o) => o.end));
  // Median coordinate distance, to reject one far-away allele from spanning megabases.
  const mids = on.map((o) => (o.start + o.end) / 2).sort((x, y) => x - y);
  const med = mids[Math.floor(mids.length / 2)];
  const keep = on.filter((o) => Math.abs((o.start + o.end) / 2 - med) < 2e6);
  const f2 = Math.min(...keep.map((o) => o.start));
  const t2 = Math.max(...keep.map((o) => o.end));
  return { hap: on[0].hap, chr, from: f2, to: t2, via,
    anchors: anchors.filter(([, id]) => keep.some((o) => o.id === id)), spanAll: [from, to] };
}

/** Draw tracks to scale. tracks: [{label, from, to, rows, mark: Set, hapClass}], links: [[idA, idB]]
 *  between track 0 and track 1. Returns an <svg> sized by viewBox (width 1000). */
export function drawTracks(tracks, links = [], { width = 1000, onGene } = {}) {
  const padL = 96;
  const padR = 16;
  const trackH = 64;
  const gap = links.length ? 70 : 26;
  const H = 24 + tracks.length * trackH + (tracks.length - 1) * gap + 22;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${H}`, class: 'lf-svg', role: 'img' });
  const pos = new Map();
  tracks.forEach((t, ti) => {
    const y0 = 24 + ti * (trackH + gap);
    const span = Math.max(1, t.to - t.from);
    const X = (v) => padL + ((v - t.from) / span) * (width - padL - padR);
    const mid = y0 + trackH / 2;
    svg.append(svgEl('text', { x: 4, y: mid - 4, class: `lf-lab ${t.hapClass || ''}` }, t.label));
    svg.append(svgEl('text', { x: 4, y: mid + 12, class: 'lf-sub' }, t.chr || ''));
    svg.append(svgEl('line', { x1: padL, x2: width - padR, y1: mid, y2: mid, class: 'lf-axis' }));
    // scale bar: kb ticks at the ends
    svg.append(svgEl('text', { x: padL, y: y0 + trackH + 14, class: 'lf-tick' }, `${(t.from / 1e6).toFixed(3)} Mb`));
    svg.append(svgEl('text', { x: width - padR, y: y0 + trackH + 14, class: 'lf-tick', 'text-anchor': 'end' },
      `${(t.to / 1e6).toFixed(3)} Mb · ${((t.to - t.from) / 1000).toFixed(1)} kb shown`));
    for (const r of t.rows) {
      const x1 = Math.max(padL, X(r.s));
      const x2 = Math.min(width - padR, X(r.e));
      const on = t.mark && t.mark.has(r.g);
      const up = r.d >= 0;
      const yb = up ? mid - 20 : mid + 4;         // + strand above the axis, - strand below
      const g = svgEl('g', { class: `lf-gene${on ? ' on' : ''}${t.hi && t.hi.has(r.g) ? ' hi' : ''}`,
        'data-gene': r.g, tabindex: onGene ? 0 : null });
      g.append(svgEl('title', {}, `${r.g} (${up ? '+' : '−'} strand, ${((r.e - r.s) / 1000).toFixed(2)} kb)`));
      g.append(svgEl('line', { x1, x2, y1: yb + 8, y2: yb + 8, class: 'lf-intron' }));
      const feats = r.f && r.f.length ? r.f : [[0, r.e - r.s, 1]];
      for (const [off, len, cds] of feats) {
        const fx1 = Math.max(padL, X(r.s + off));
        const fx2 = Math.min(width - padR, X(r.s + off + len));
        g.append(svgEl('rect', { x: fx1, y: cds ? yb + 2 : yb + 5, width: Math.max(1, fx2 - fx1),
          height: cds ? 12 : 6, class: cds ? 'lf-cds' : 'lf-utr' }));
      }
      // strand chevron at the 3' end
      const tip = up ? x2 : x1;
      const dir = up ? 1 : -1;
      g.append(svgEl('path', { d: `M${tip} ${yb + 2} l${4 * dir} 6 l${-4 * dir} 6`, class: 'lf-chev' }));
      if (onGene) g.addEventListener('click', () => onGene(r.g));
      svg.append(g);
      pos.set(r.g, { x: (x1 + x2) / 2, y: up ? yb : yb + 16, top: up ? yb : yb, bot: yb + 16, ti });
    }
  });
  for (const [a, b] of links) {
    const p = pos.get(a);
    const q = pos.get(b);
    if (!p || !q) continue;
    const top = p.ti < q.ti ? p : q;
    const bot = p.ti < q.ti ? q : p;
    svg.insertBefore(svgEl('path', {
      d: `M${top.x} ${top.bot + 2} C${top.x} ${top.bot + 40} ${bot.x} ${bot.top - 40} ${bot.x} ${bot.top - 2}`,
      class: 'lf-link' }), svg.firstChild);
  }
  return svg;
}

/** Tissue order shared by both expression figures: fixed, never alphabetical by value. */
export const TISSUES = ['leaf_young', 'leaf', 'leaf_old', 'bud', 'stem', 'bark', 'xylem', 'root', 'catkin', 'callus'];
export function tissueList(genes) {
  const seen = new Set();
  genes.forEach((g) => Object.keys(((g && g.x) || {}).t || {}).forEach((k) => seen.add(k)));
  return [...TISSUES.filter((t) => seen.has(t)), ...[...seen].filter((t) => !TISSUES.includes(t)).sort()];
}
/** Per-tissue sample n, from the records; returns {tissue: n} and whether records disagree. */
export function tissueN(genes, tissues) {
  const n = {};
  let disagree = false;
  for (const t of tissues) {
    const vals = [...new Set(genes.map((g) => (((g || {}).x || {}).n || {})[t]).filter((v) => v != null))];
    n[t] = vals.length ? vals[0] : null;
    if (vals.length > 1) disagree = true;
  }
  return { n, disagree };
}
