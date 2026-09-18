// Module: duplication layers. Every duplicate this gene has, on one axis, with the three
// layers kept APART -- tandem, salicoid WGD, gamma -- and each link carrying its own dS.
//
// It is the atlas's answer to the question the Duplication card could state but not show:
// the card says "salicoid + tandem" and names partners in a list, so a reader learns that a
// gene has three kinds of duplicate and never sees that two of them sit 40 kb away and the
// third is on another chromosome. This is the figure shape the manuscript uses for a family
// (ms1_talk_20260918/myb_case_20260917/myb_layered_locus_*.png): one short track per locus on
// a shared kilobase scale, anchors joined by labelled arcs.
//
// SVG, not canvas -- a deliberate departure from Locus/Mirror/Genome map, for three reasons
// that all come from this view specifically: the arcs must carry TEXT (a dS beside every
// link) and canvas text cannot be selected or scaled by the reader; the elements number in
// the tens rather than the thousands, so there is no fill-rate argument; and every gene here
// is a link, which as a real <a> gets keyboard focus, a visible focus ring and a 24 px tap
// target for free instead of hit-testing pointer coordinates by hand (WCAG 2.2 SC 2.5.8).
// The canvas modules keep canvas because they paint hundreds of genes and pan continuously.
//
// WHAT EACH NUMBER IS, because three different dS values live on this page and they are not
// interchangeable:
//   tandem link   td.pks[partner] -- the PER-PAIR dS from the TD union rebuild. Absent for
//                 about half of array members; those links are drawn without a number and the
//                 caption says how many were scored. NEVER substitute td.ks, the array MEDIAN.
//   WGD link      wgd[i].ks -- the anchor pair's own dS.
//   allele link   allele.ks -- HAP1 vs HAP2 of the same clone. Drawn in a different style
//                 because it is not a duplication at all; it is the same gene, twice phased.
import { el } from '../core/dom.js';
import { getGene, loadLocusTile } from '../core/data.js';
import { palette } from '../core/palette.js';

const SVG = 'http://www.w3.org/2000/svg';
const ROW_H = 84;          // px per locus track, label + genes + room for an arc to land
const PAD_X = 14;
const PAD_TOP = 8;
const GENE_H = 15;
const MAX_TD = 12;         // arrays reach 56 members; beyond a dozen the view stops being one
// Every track is padded by this much on each side. Without it a row holding ONE gene spans
// only that gene's 3 kb, which becomes the shared scale, and every gene on the card is then
// drawn the full width of the card -- a picture in which a 2 kb gene and a 90 kb array look
// identical. The manuscript figure pads by the same 12 kb for the same reason.
const TRACK_PAD = 12_000;
const MB = 1_000_000;
const CONTEXT = 3;         // flanking genes drawn either side of each anchor, per track
const short = (id) => id.split('.')[1] || id;
const kb = (bp) => `${(bp / 1000).toFixed(0)} kb`;
const LABEL_CH = 6.3;      // px per character at 10.5px in the mono face, measured
const LABEL_GAP = 6;       // minimum clear space between two neighbouring labels

// Layer order is chronological, youngest first, and the allele row sits directly under the
// focal locus because it is the same locus rather than an older event.
const LAYER = {
  F: { key: 'F', label: 'this gene', full: 'this gene' },
  T: { key: 'T', label: 'tandem', full: 'tandem duplication' },
  H: { key: 'H', label: 'other haplotype', full: 'the same locus on the other haplotype' },
  S: { key: 'S', label: 'salicoid WGD', full: 'salicoid whole-genome duplication (~60 Ma)' },
  A: { key: 'A', label: 'gamma', full: 'gamma whole-genome triplication (~120 Ma)' },
};

const svgEl = (name, attrs = {}, ...kids) => {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  n.append(...kids.filter(Boolean));
  return n;
};

/** Resolve a partner id to the little it needs to be drawn. One shard fetch each, cached. */
async function place(id) {
  const g = await getGene(id);
  if (!g) return null;
  return { id, hap: g.hap, chr: g.chr, start: g.start, end: g.end, strand: g.strand,
           td: g.td || null };
}

/** Rows to draw: one per (layer, haplotype, chromosome) group, chronological.
 *  Returns { rows, notes } where notes records what was capped or could not be resolved. */
async function buildRows(g) {
  const notes = [];
  const want = new Map();                       // id -> layer key, deduplicated
  const dsOf = new Map();                       // id -> dS on the link from the focal gene

  const td = g.td || {};
  const mem = (td.mem || []).map((m) => m[0]);
  const pks = td.pks || {};
  // Keep the members with a scored dS first, then fill by array order; a 56-member array
  // truncated to the first dozen by id would hide exactly the pairs that carry a number.
  const ranked = [...mem].sort((a, b) => (pks[b] != null) - (pks[a] != null));
  const tdShown = ranked.slice(0, MAX_TD);
  if (mem.length > tdShown.length) notes.push(`${mem.length - tdShown.length} further array members not drawn`);
  if (td.more) notes.push(`${td.more} more beyond the ${mem.length} the gene record carries`);
  for (const m of tdShown) { want.set(m, 'T'); if (pks[m] != null) dsOf.set(m, pks[m]); }

  for (const p of (g.wgd || [])) {
    if (want.has(p.id)) continue;
    want.set(p.id, p.e === 'A' ? 'A' : 'S');
    if (p.ks != null) dsOf.set(p.id, p.ks);
  }
  if (g.allele && !want.has(g.allele.id)) {
    want.set(g.allele.id, 'H');
    if (g.allele.ks != null) dsOf.set(g.allele.id, g.allele.ks);
  }

  const placed = await Promise.all([...want.keys()].map(place));
  const unresolved = placed.filter((p) => !p).length;
  if (unresolved) notes.push(`${unresolved} partner${unresolved === 1 ? '' : 's'} could not be resolved`);

  // The focal gene is a tandem member only when it actually has array members. Colouring it
  // tandem-pink on a gene with no array would assert a duplication the data does not call.
  const focal = { id: g.id, hap: g.hap, chr: g.chr, start: g.start, end: g.end,
                  strand: g.strand, focal: true, layer: tdShown.length ? 'T' : 'F' };
  const groups = new Map();
  const push = (layer, p) => {
    const key = `${layer}|${p.hap}|${p.chr}`;
    if (!groups.has(key)) groups.set(key, { layer, hap: p.hap, chr: p.chr, genes: [] });
    groups.get(key).genes.push(p);
  };
  // The focal gene's own row is a tandem row even when the gene is in no array -- it is
  // always the anchor every arc leaves from, and labelling it "tandem" when there is no
  // array would be a duplication claim the data does not make. Its label is fixed below.
  push(focal.layer, focal);
  for (const p of placed) {
    if (!p) continue;
    const layer = want.get(p.id);
    p.layer = layer;
    p.ds = dsOf.get(p.id);
    push(layer, p);
  }

  const order = ['F', 'T', 'H', 'S', 'A'];
  const rows = [...groups.values()].sort((a, b) => {
    const d = order.indexOf(a.layer) - order.indexOf(b.layer);
    return d || a.chr.localeCompare(b.chr);
  });
  // Genomic context. Without it every partner track holds ONE gene, that gene is centred by
  // construction, and every arc on the card lands at the same x -- a picture with no
  // horizontal information in it at all. A few real neighbours put each anchor where it
  // actually sits in its own neighbourhood, which is what makes the arcs mean something.
  await Promise.all(rows.map(async (r) => {
    const have = new Set(r.genes.map((x) => x.id));
    const extra = [];
    for (const anchor of [...r.genes]) {
      let tile;
      try { tile = await loadLocusTile(r.hap, r.chr, Math.floor(anchor.start / MB)); }
      catch { continue; }
      const i = tile.findIndex((t) => t.g === anchor.id);
      if (i < 0) continue;
      for (const t of tile.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1)) {
        if (have.has(t.g)) continue;
        have.add(t.g);
        extra.push({ id: t.g, hap: r.hap, chr: r.chr, start: t.s, end: t.e, layer: 'X' });
      }
    }
    r.genes.push(...extra);
    r.context = extra.length;
  }));

  for (const r of rows) {
    r.genes.sort((x, y) => x.start - y.start);
    // span is what the label reports: the genes themselves. lo/hi are the DRAWN window,
    // which is padded -- reporting the padded number would overstate every locus by 24 kb.
    const anchors = r.genes.filter((x) => x.layer !== 'X');
    r.span = Math.max(...anchors.map((x) => x.end)) - Math.min(...anchors.map((x) => x.start));
    r.lo = Math.min(...r.genes.map((x) => x.start)) - TRACK_PAD;
    r.hi = Math.max(...r.genes.map((x) => x.end)) + TRACK_PAD;
    r.self = r.genes.some((x) => x.focal);
  }
  return { rows, notes, tdScored: tdShown.filter((m) => pks[m] != null).length,
           tdShown: tdShown.length, memTotal: mem.length };
}

function rowLabel(r, g) {
  // Count ANCHORS, not drawn genes: the context flanks are not array members, and calling
  // them that turned a gene with no array into one with "6 array members".
  const n = r.genes.filter((x) => x.layer !== 'X' && !x.focal).length;
  if (r.self) return `${r.chr} · this gene${n ? ` + ${n} array member${n > 1 ? 's' : ''}` : ''}`;
  const hapTag = r.hap !== g.hap ? ` · ${r.hap === 'hap1' ? 'HAP1' : 'HAP2'}` : '';
  return `${LAYER[r.layer].label} · ${r.chr}${hapTag}`;
}

function drawDiagram(g, built, width) {
  const P = palette();
  const COLOUR = { F: P.accent, T: P.T, S: P.S, A: P.A, H: P.ink3, X: P.line };
  const { rows } = built;
  const height = PAD_TOP + rows.length * ROW_H + 8;
  const inner = Math.max(120, width - PAD_X * 2);
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`, width: '100%', height,
    role: 'img', 'aria-label': `Duplication layers for ${g.id}`,
    style: 'display:block;overflow:visible',
  });

  // Every row shares ONE kilobase scale -- the widest row's span -- so a 40 kb tandem array
  // and a 300 kb WGD neighbourhood are not silently drawn the same width. Rows narrower
  // than the widest are centred, exactly as the manuscript figure does it.
  const widest = Math.max(...rows.map((r) => r.hi - r.lo), 1);
  const at = (r, bp) => {
    const off = (widest - (r.hi - r.lo)) / 2;
    return PAD_X + ((bp - r.lo + off) / widest) * inner;
  };
  // 48 px of headroom above every track: a same-row arc rises at most 24, its dS pill adds
  // ~8, and the row label needs 14 above that. Measured against the rendered card, not guessed.
  const yOf = (i) => PAD_TOP + i * ROW_H + 48;

  const anchors = new Map();
  let suppressed = 0;
  const arcs = svgEl('g');
  const marks = svgEl('g');
  svg.append(arcs, marks);

  rows.forEach((r, i) => {
    const y = yOf(i);
    marks.append(svgEl('line', { x1: PAD_X, y1: y, x2: width - PAD_X, y2: y,
      stroke: P.line, 'stroke-width': 1 }));
    marks.append(svgEl('text', { x: PAD_X, y: y - 40, fill: P.ink3,
      'font-size': 11 }, rowLabel(r, g)));
    marks.append(svgEl('text', { x: width - PAD_X, y: y - 40, fill: P.ink3,
      'font-size': 11, 'text-anchor': 'end' }, kb(r.hi - r.lo)));

    // Which genes get a visible id. An 11-member array on a phone puts eleven 70 px labels
    // into 360 px and they render as one unreadable smear -- seen at 390 px wide, not
    // predicted. So: reserve the focal gene's label, then walk outwards placing a label only
    // where it clears the last one placed. Every gene stays clickable and keeps its
    // aria-label; the Duplication card's table lists all of them by name regardless.
    const labelled = new Set();
    {
      const cands = r.genes.filter((x) => x.layer !== 'X')
        .map((x) => ({ id: x.id, focal: !!x.focal,
                       cx: (at(r, x.start) + Math.max(at(r, x.end), at(r, x.start) + 4)) / 2,
                       w: short(x.id).length * LABEL_CH + LABEL_GAP }));
      const taken = [];
      const fits = (c) => taken.every((t) => Math.abs(t.cx - c.cx) >= (t.w + c.w) / 2);
      const focal = cands.find((c) => c.focal);
      if (focal) { taken.push(focal); labelled.add(focal.id); }
      for (const c of cands) {
        if (c.focal || !fits(c)) continue;
        taken.push(c);
        labelled.add(c.id);
      }
      if (labelled.size < cands.length) suppressed += cands.length - labelled.size;
    }

    for (const gene of r.genes) {
      const x0 = at(r, gene.start);
      const x1 = Math.max(at(r, gene.end), x0 + 4);
      const cx = (x0 + x1) / 2;
      if (gene.layer !== 'X') anchors.set(gene.id, { x: cx, y, layer: gene.layer, ds: gene.ds });
      const a = svgEl('a', { href: `#/gene/${gene.id}`, 'aria-label': gene.id });
      // Tap target: SC 2.5.8 wants 24 px, and a 2 kb gene on a 300 kb scale is 3 px wide.
      // A transparent 24 px rectangle carries the pointer and the focus ring; the visible
      // bar keeps the gene's TRUE width so the drawing does not lie about size.
      a.append(svgEl('rect', { x: cx - 12, y: y - 12, width: 24, height: 24,
        fill: 'transparent' }));
      a.append(svgEl('rect', {
        x: x0, y: y - (gene.layer === 'X' ? 7 : GENE_H) / 2,
        width: x1 - x0, height: gene.layer === 'X' ? 7 : GENE_H, rx: 2,
        fill: COLOUR[gene.layer] || P.ink3,
        stroke: gene.focal ? P.ink : 'none', 'stroke-width': gene.focal ? 1.6 : 0,
      }));
      if (labelled.has(gene.id)) a.append(svgEl('text', {
        x: cx, y: y + GENE_H / 2 + 13, 'text-anchor': 'middle',
        'font-size': 10.5, fill: gene.focal ? P.ink : P.ink3,
        'font-weight': gene.focal ? 600 : 400,
        'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }, short(gene.id)));
      marks.append(a);
    }
  });

  // Arcs leave the focal gene and land on each partner. Drawn first (behind the genes) and
  // in layer order so the oldest links do not sit on top of the youngest.
  const from = anchors.get(g.id);
  if (from) {
    for (const [id, a] of anchors) {
      if (id === g.id) continue;
      const dy = a.y - from.y;
      let d, mx, my;
      if (dy === 0) {
        // Same track -- a tandem partner a few kb away. A vertical bezier would collapse to a
        // zero-length path, so these bow ABOVE the track instead, height scaled to the
        // horizontal distance so neighbouring links do not sit on top of each other.
        const span = Math.abs(a.x - from.x);
        const h = Math.min(24, 8 + span * 0.18);
        const top = from.y - GENE_H / 2 - 2 - h;
        d = `M ${from.x} ${from.y - GENE_H / 2 - 2} C ${from.x} ${top}, ${a.x} ${top}, `
          + `${a.x} ${a.y - GENE_H / 2 - 2}`;
        mx = (from.x + a.x) / 2;
        my = from.y - GENE_H / 2 - 2 - h * 0.75;
      } else {
        const lift = Math.min(46, Math.abs(dy) * 0.45 + 12);
        d = `M ${from.x} ${from.y + Math.sign(dy) * (GENE_H / 2 + 2)} `
          + `C ${from.x} ${from.y + Math.sign(dy) * lift}, `
          + `${a.x} ${a.y - Math.sign(dy) * lift}, ${a.x} ${a.y - Math.sign(dy) * (GENE_H / 2 + 2)}`;
        mx = (from.x + a.x) / 2;
        my = (from.y + a.y) / 2;
      }
      arcs.append(svgEl('path', {
        d, fill: 'none', stroke: COLOUR[a.layer] || P.ink3,
        'stroke-width': 1.6, 'stroke-opacity': 0.85,
        'stroke-dasharray': a.layer === 'H' ? '4 3' : null,
      }));
      if (a.ds != null) {
        const label = `dS ${a.ds < 0.1 ? a.ds.toFixed(3) : a.ds.toFixed(2)}`;
        const w = label.length * 5.6 + 8;
        arcs.append(svgEl('rect', { x: mx - w / 2, y: my - 8, width: w, height: 15, rx: 3,
          fill: P.panel, stroke: COLOUR[a.layer] || P.ink3, 'stroke-opacity': 0.35 }));
        arcs.append(svgEl('text', { x: mx, y: my + 3.5, 'text-anchor': 'middle',
          'font-size': 10.5, fill: P.ink }, label));
      }
    }
  }
  return { svg, suppressed };
}

function legend(built, g) {
  const P = palette();
  const seen = new Set(built.rows.map((r) => r.layer));
  const LEG = { F: P.accent, T: P.T, S: P.S, A: P.A, H: P.ink3, X: P.line };
  const items = ['F', 'T', 'H', 'S', 'A'].filter((k) => seen.has(k)).map((k) => el('span',
    { style: 'display:inline-flex;align-items:center;gap:5px;margin-right:14px' },
    el('span', { style: `width:14px;height:10px;border-radius:2px;display:inline-block;background:${LEG[k]}` }),
    el('span', {}, LAYER[k].full)));
  if (built.rows.some((r) => r.context)) {
    items.push(el('span', { style: 'display:inline-flex;align-items:center;gap:5px;margin-right:14px' },
      el('span', { style: `width:14px;height:5px;border-radius:2px;display:inline-block;background:${P.line}` }),
      el('span', {}, 'neighbouring gene, for position only')));
  }
  return el('p', { class: 'muted', style: 'font-size:11.5px;margin:8px 0 0' }, ...items);
}

function caption(built, g, suppressed) {
  const bits = [];
  if (built.memTotal) {
    bits.push(`${built.tdScored} of the ${built.tdShown} tandem link${built.tdShown === 1 ? '' : 's'} drawn `
      + 'carr' + (built.tdScored === 1 ? 'ies' : 'y') + ' a per-pair dS; the rest were never scored as a pair '
      + '(the array is listed member-by-member, the dS table holds detected edges). A link '
      + 'without a number is not a link between identical copies.');
  }
  if ((g.td || {}).ks != null) {
    bits.push(`The array’s MEDIAN dS is ${g.td.ks.toFixed(3)} — a property of the array, not of any link here.`);
  }
  if (g.allele) bits.push('The dashed link is the same gene on the other haplotype, not a duplication.');
  // Suppressed labels are counted out loud. A gene silently losing its name in a dense array
  // is the same class of problem as a row silently leaving the heatmap: the reader cannot tell
  // an omission from an absence. Every gene here is still a link and still in the table below.
  if (suppressed) {
    bits.push(`${suppressed} gene name${suppressed === 1 ? ' is' : 's are'} not printed at this `
      + 'width because the labels would overlap; those genes are still links, and the '
      + 'Duplication card below names every one of them.');
  }
  if (built.notes.length) bits.push(built.notes.join('; ') + '.');
  return el('p', { class: 'muted', style: 'font-size:11.5px;margin:8px 0 0' }, bits.join(' '));
}

function geneCard(g) {
  const hasAny = (g.td && (g.td.mem || []).length) || (g.wgd || []).length || g.allele;
  if (!hasAny) return null;

  const card = el('div', { class: 'card' },
    el('h2', {}, 'Duplication layers',
      el('span', { class: 'tag' }, 'three layers, kept apart')));
  const stage = el('div', { style: 'margin-top:10px' });
  const status = el('p', { class: 'muted', style: 'font-size:11.5px;margin:8px 0 0' },
    'Resolving partners…');
  card.append(stage, status);

  (async () => {
    const built = await buildRows(g);
    // The guard counts GENES, not rows. A gene whose only duplicates are the other members of
    // its own tandem array produces exactly one row -- which is the commonest case on this
    // site and a perfectly good picture. Guarding on row count hid it.
    const nGenes = built.rows.reduce((n, r) => n + r.genes.length, 0);
    if (nGenes < 2) {
      status.textContent = 'No partner could be placed on the genome, so there is nothing to draw.';
      return;
    }
    // The caption's suppressed-label count is WIDTH-DEPENDENT, so it is rebuilt on every
    // redraw rather than written once: a card that says "3 names not printed" after the window
    // widened enough to print them all is a false statement about what is on screen.
    let width = 0;
    const leg = legend(built, g);
    let cap = caption(built, g, 0);
    const render = () => {
      const w = Math.round(stage.getBoundingClientRect().width);
      if (!w || w === width) return;
      width = w;
      const { svg, suppressed } = drawDiagram(g, built, w);
      stage.replaceChildren(svg);
      const next = caption(built, g, suppressed);
      cap.replaceWith(next);
      cap = next;
    };
    status.replaceWith(leg, cap);
    const ro = new ResizeObserver(render);
    ro.observe(stage);
    render();
  })().catch((e) => { status.textContent = `Duplication layers unavailable: ${e.message}`; });

  return card;
}

export default { id: 'duplayers', label: 'Duplication layers', geneCard };
