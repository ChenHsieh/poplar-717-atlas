// Module: promoter / cis-regulatory element scan. Source: ms2-lsg's genome-wide JASPAR
// scan, reviewed 2026-09-06 (see sources/cre_promoter_hits.provenance.json).
//
// WHY THIS CARD IS WORDED THE WAY IT IS, not just what it shows:
//
//   1. Every family column is a TF-FAMILY grouping by JASPAR matrix name (bZIP, WRKY,
//      MYB...), never a cis-element name (ABRE, DRE/CRT, W-box). The source data's own
//      column names read as cis-elements in two cases (ABRE_bZIP, DREB_ERF); those were
//      renamed to bZIP / AP2_ERF at ingestion (build_cre.py) precisely so nothing here
//      can claim "this promoter has an ABRE" when what was actually measured is "this
//      promoter has a hit to a bZIP-family binding-site model". A hit to a family's PWM
//      is evidence a binding site COULD exist, not that one does.
//   2. Families are represented by very uneven numbers of matrices (17 for MADS-box, 73
//      for AP2/ERF in this scan) and the hit threshold is a FRACTION of a matrix's own
//      max score, so a family with more/longer matrices racks up more hits for reasons
//      that are about the matrix library, not the gene. Raw counts are therefore never
//      shown as the primary comparison; bars are normalized per matrix
//      (hits / matrices_per_family) and the raw n is always alongside, never alone.
//   3. TATA is two DIFFERENT facts, kept visually and textually separate: whether the
//      canonical core-promoter TATA box was found in the standard -45..-20 window
//      (tata.core), versus the position of the nearest TATA-like hexamer anywhere in the
//      promoter (tata.pos), which can be far upstream and is not a core-promoter TATA box
//      just because the same 6-letter pattern matched there.
import { el } from '../core/dom.js';

function tataLine(t) {
  // tata_pos is ALREADY "bp upstream of the TSS" (verified against the source data: rows
  // with tata_core=True cluster their tata_pos in [8,51], i.e. right at the -45..-20 core
  // window -- not the inverse). No arithmetic needed; a subtraction here was tried first
  // and was wrong, caught by checking a known-true case rather than trusting the label.
  if (t.core) {
    return el('span', {},
      el('strong', {}, 'Canonical TATA box'), ' in the core promoter (−45 to −20 bp from the TSS).');
  }
  if (t.pos != null) {
    return el('span', {},
      'No canonical core-promoter TATA box. A TATA-like sequence occurs ',
      el('strong', {}, `${t.pos.toLocaleString()} bp upstream`),
      ' of the TSS — outside the −45..−20 core window, so this is not a core promoter TATA box.');
  }
  return el('span', {}, 'No TATA-like sequence found anywhere in the scanned promoter.');
}

function familyStrip(cre, cm) {
  const order = ['bZIP', 'AP2_ERF', 'WRKY', 'MYB', 'NAC', 'MADS', 'SPL', 'TCP', 'ARF', 'other'];
  const labels = cm.family_labels, mats = cm.matrices_per_family;
  const norm = order.map((k) => (cre.fam[k] || 0) / (mats[k] || 1));
  const max = Math.max(...norm, 0.01);
  const rows = order.map((k, i) => el('tr', {},
    el('td', {}, labels[k]),
    el('td', { class: 'num mono' }, cre.fam[k]),
    el('td', { class: 'muted num', style: 'font-size:10.5px' }, `/${mats[k]} matrices`),
    el('td', { style: 'width:44%' },
      el('div', { class: 'bar', style: `width:${Math.max((norm[i] / max) * 100, cre.fam[k] > 0 ? 1.5 : 0)}%;background:var(--accent)`,
        title: `${cre.fam[k]} hit(s) across ${mats[k]} ${labels[k]}-family matrices` }))));
  return el('table', { class: 'data' },
    el('thead', {}, el('tr', {}, el('th', {}, 'TF family'), el('th', { class: 'num' }, 'hits'),
      el('th', {}, ''), el('th', {}, 'hits per matrix, normalized'))),
    el('tbody', {}, ...rows));
}

// The chromatin card. Everything on it is a property of the P. TRICHOCARPA ORTHOLOG, not of
// this gene -- the peaks were called on trichocarpa leaf nuclei and scored against trichocarpa
// gene starts, and no chromatin data exists for 717 or for either parent. The wording says so
// each time rather than once at the bottom, because a reader who lands mid-card is the reader
// who would otherwise take it for 717's own promoter.
//
// `ex` gates the rest, and that is the whole reason the card is trustworthy. The data is LEAF
// ONLY: a gene silent in leaf correctly carries no promoter mark there, so showing "no ATAC
// peak" for a silent gene would read as an absence of regulation when it is an absence of
// relevant data. The source analysis's first run failed its own gate for exactly this reason.
function chromatinCard(g) {
  const a = g.atac;
  const p = g.ptri;
  if (!a || !p || !p.id) return null;
  const link = el('a', {
    href: `https://phytozome-next.jgi.doe.gov/report/gene/Ptrichocarpa_v4_1/${p.id}`,
    target: '_blank', rel: 'noopener', class: 'mono' }, p.id);

  if (!a.ex) {
    return el('div', { class: 'card' },
      el('h2', {}, 'Chromatin', el('span', { class: 'tag' }, 'ortholog, P. trichocarpa leaf')),
      el('p', { class: 'muted', style: 'margin:0;font-size:13px' },
        'This gene\u2019s P. trichocarpa ortholog ', link, ' is not expressed in the leaf '
        + 'libraries these chromatin data come from, so its promoter marks are not '
        + 'interpretable. A silent gene correctly carries no active-promoter mark, which says '
        + 'nothing about whether the gene has a promoter. Nothing is shown rather than showing '
        + 'four zeros that would read as an absence of regulation.'));
  }

  const rows = [
    ['Accessible chromatin', a.acr, 'an ATAC-seq accessible region that is genic or within 2 kb'],
    ['H3K4me3', a.k4, 'the active-promoter mark, at this gene\u2019s own start'],
    ['Own promoter', a.own, 'both of the above, so the promoter signal is this locus\u2019s own'],
    ['H3K36me3 over the body', a.k36, 'the elongation signature, across the gene body'],
  ];
  return el('div', { class: 'card' },
    el('h2', {}, 'Chromatin', el('span', { class: 'tag' }, 'ortholog, P. trichocarpa leaf')),
    el('p', { class: 'sub', style: 'margin:0 0 10px' },
      'Measured on the ortholog ', link, ', which is expressed in leaf at ',
      el('span', { class: 'mono' }, a.rpk.toFixed(1)), ' RPK.'),
    el('table', { class: 'data' },
      el('tbody', {}, ...rows.map(([label, v, note]) => el('tr', {},
        el('td', {}, label),
        el('td', {}, v
          ? el('span', { class: 'badge' },
              el('i', { class: 'dot', style: 'background:var(--c-nonsyn)' }), 'present')
          : el('span', { class: 'muted' }, 'absent')),
        el('td', { class: 'muted', style: 'font-size:11.5px' }, note))))),
    el('p', { class: 'muted', style: 'font-size:11px;margin:8px 0 0' },
      'From GSE128434, a 13-species comparative chromatin atlas (Lu, Marand, Schmitz and '
      + 'colleagues, 2019), reprocessed here. Three limits, all of which matter for reading a '
      + 'single row. It is the ORTHOLOG\u2019s chromatin: nothing here was measured on 717, and '
      + 'no chromatin data exists for this hybrid or for either parent species. It is LEAF '
      + 'only, so a mark absent here may be present in another tissue. And accessibility and '
      + 'H3K4me3 establish that a locus has a promoter, never where transcription starts \u2014 '
      + 'only a method that sequences 5\u2032 ends can do that, and none exists for any Populus.'));
}

// ---- where the motifs actually sit (TODO 44) ---------------------------------------------
// The card showed how MANY matches each family had and nothing about WHERE, so a proximal
// TATA-adjacent site and one 900 bp upstream looked identical. `cre.pos` is bp from the
// transcription start to each motif's 5' edge, within the 1 kb window, so the TSS is the
// RIGHT edge here and upstream runs leftwards -- the orientation a promoter diagram is
// normally drawn in.
//
// One hue for every tick, with the family named on its own lane. Families do not have a
// fixed colour anywhere else in this atlas and inventing one here would start a palette that
// nothing else honours.
const WIN = 1000;

function positionTrack(cre, cm) {
  if (cre.posx) {
    return el('p', { class: 'muted', style: 'font-size:12px;margin:10px 0 0' },
      el('strong', {}, 'Motif positions are withheld for this gene. '),
      'The position rescan disagreed with the published family counts here, by finding one or '
      + 'two more matches than the counts above. Rather than draw positions that contradict '
      + 'the bars directly above them, this gene shows none. 45 of 63,960 genes are in that '
      + 'state, all for the same reason.');
  }
  const pos = cre.pos;
  if (!pos || !Object.keys(pos).length) return null;
  const fams = Object.keys(pos).sort((a, b) => pos[b].length - pos[a].length);
  const W = 100;                       // percentage space; the SVG scales to the card
  const LANE = 15, TOP = 16;
  const h = TOP + fams.length * LANE + 16;
  const xOf = (dist) => ((WIN - dist) / WIN) * W;

  const svgNS = 'http://www.w3.org/2000/svg';
  const mk = (name, attrs) => {
    const n = document.createElementNS(svgNS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const svg = mk('svg', { viewBox: `0 0 ${W} ${h}`, width: '100%', height: h,
                          preserveAspectRatio: 'none', role: 'img',
                          'aria-label': 'positions of transcription-factor family motif '
                            + 'matches in the 1 kb promoter, transcription start at the right' });
  // axis: TSS at the right, ticks every 250 bp
  for (const bp of [1000, 750, 500, 250, 0]) {
    const x = xOf(bp);
    svg.append(mk('line', { x1: x, y1: TOP - 5, x2: x, y2: h - 12,
                            stroke: 'var(--line)', 'stroke-width': 0.15,
                            'stroke-dasharray': bp === 0 ? '' : '0.6 0.6' }));
  }
  for (const [i, fam] of fams.entries()) {
    const y = TOP + i * LANE;
    svg.append(mk('line', { x1: 0, y1: y + LANE / 2, x2: W, y2: y + LANE / 2,
                            stroke: 'var(--line)', 'stroke-width': 0.1 }));
    const famLabel = ((cm && cm.family_labels) || {})[fam] || fam;
    for (const d of pos[fam]) {
      const t = mk('line', { x1: xOf(d), y1: y + 2, x2: xOf(d), y2: y + LANE - 3,
                             stroke: 'var(--accent)', 'stroke-width': 0.5 });
      // an SVG tooltip is a <title> CHILD, and Element.append() returns undefined -- the
      // earlier one-liner set .textContent on that undefined and threw on every gene page
      const ttl = mk('title', {});
      ttl.textContent = `${famLabel} match, \u2212${d} bp from the transcription start`;
      t.append(ttl);
      svg.append(t);
    }
  }
  if (cre.tata && cre.tata.pos != null) {
    svg.append(mk('line', { x1: xOf(cre.tata.pos), y1: TOP - 8, x2: xOf(cre.tata.pos), y2: h - 12,
                            stroke: 'var(--c-priv)', 'stroke-width': 0.5 }));
  }

  const labels = el('div', { style: `display:grid;grid-template-rows:repeat(${fams.length},`
    + `${LANE}px);font-size:11px;color:var(--ink-2);padding-top:${TOP}px;text-align:right;`
    + 'padding-right:7px;white-space:nowrap' },
    ...fams.map((f) => el('div', { style: `height:${LANE}px;line-height:${LANE}px` },
      ((cm && cm.family_labels) || {})[f] || f,
      el('span', { class: 'muted' }, ` ${pos[f].length}`))));

  return el('div', { style: 'margin-top:10px' },
    el('h3', { style: 'font-size:12.5px;margin:0 0 4px;color:var(--ink-2)' },
      'Where those matches sit'),
    el('div', { style: 'display:flex;align-items:flex-start' }, labels,
      el('div', { style: 'flex:1;min-width:0' }, svg)),
    el('div', { class: 'muted', style: 'display:flex;justify-content:space-between;'
      + 'font-size:10.5px;margin-top:-10px' },
      el('span', {}, '\u22121000 bp'), el('span', {}, '\u2212500'),
      el('span', {}, 'transcription start')),
    el('p', { class: 'muted', style: 'font-size:11px;margin:7px 0 0' },
      'Each tick is one match, placed at the motif\u2019s far (5\u2032) edge; the '
      + 'transcription start is at the right and upstream runs left. Lanes are ordered by how '
      + 'many matches a family has, and the count is beside its name. Ticks share one colour '
      + 'on purpose \u2014 the lane says which family it is.',
      cre.tata && cre.tata.pos != null
        ? el('span', {}, ' The single amber line is the canonical TATA box at '
            + `\u2212${cre.tata.pos} bp.`)
        : null));
}

function geneCard(g, man) {
  const cre = g.cre;
  const cm = man && man.cre;
  const chrom = chromatinCard(g);
  if (!cre || !cm) return chrom;
  const promoter = el('div', { class: 'card' },
    el('h2', {}, 'Promoter', el('span', { class: 'tag' }, 'JASPAR motif scan')),
    el('p', { class: 'sub', style: 'margin:0 0 10px' },
      `${(cre.gc * 100).toFixed(1)}% GC over the ${cm.promoter_window_bp} bp upstream of the TSS`,
      cre.ov > 0 ? el('span', {}, `, of which ${cre.ov} bp overlaps the neighbouring gene`) : null,
      cre.nf > 0 ? el('span', {}, ` (${(cre.nf * 100).toFixed(0)}% unassembled)`) : null, '.'),
    el('p', { style: 'font-size:12.5px;margin:0 0 12px' }, tataLine(cre.tata)),
    el('h3', { style: 'font-size:12.5px;margin:0 0 6px;color:var(--ink-2)' },
      'Transcription-factor family motif matches'),
    familyStrip(cre, cm),
    positionTrack(cre, cm),
    el('p', { class: 'muted', style: 'font-size:11px;margin:8px 0 0' },
      'These are matches to JASPAR position-weight matrices for each family (log-odds ≥ 85% of a ',
      "matrix's own maximum score, both strands) — evidence a family's binding site COULD sit there, ",
      'not a confirmed or gene-specific regulatory element. Families are built from very different ',
      'numbers of matrices, so bars are normalized per matrix; raw hit counts are not comparable ',
      'across families on their own.'));
  if (!chrom) return promoter;
  const frag = document.createDocumentFragment();
  frag.append(promoter, chrom);
  return frag;
}

export default {
  id: 'promoter',
  label: 'Promoter',
  geneCard,
  filters: [
    { id: 'atac', label: 'Ortholog has accessible chromatin', options: ['yes', 'no'],
      // only among leaf-expressed orthologs -- for a silent one the answer is not defined
      test: (g, v) => (g.atac && g.atac.ex ? (g.atac.acr ? 'yes' : 'no') : null) === v },
  ],
};
