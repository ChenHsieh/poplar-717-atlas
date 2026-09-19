// Route: #/karyotype -- navigate by the ancestral genome instead of the modern one.
//
// The whole duplication half of this atlas is about descent: which ancestral chromosome a gene
// came from, which gamma copy, which salicoid copy. That information sits on 63,608 genes and
// is currently shown as a paragraph on one card, one gene at a time. So the frame the data is
// organised around is the one frame a reader cannot navigate in.
//
// This is that frame: 7 ancestral eudicot chromosomes, each split into 3 gamma copies, each
// split into 2 salicoid copies. 42 cells, every gene already knows its own, and every cell is
// a Browse query.
//
// NO NEW DATA. The grid is reduced in the browser from the `aek` facet column, which packs the
// three numbers as chromosome*100 + gamma*10 + salicoid. Precomputing it into the manifest
// would create an aggregate that a build stage owns and can silently leave stale -- the
// failure TODO 25 documents -- for a table that takes 12 ms to derive from a file Browse
// already fetches.
//
// EXPLORATORY, and labelled so. Copy numbers are Wang et al.'s completeness RANKS within one
// ancestral chromosome, not subgenomes, and "no genes" in a cell means no collinear anchor
// carries that slot in this haplotype -- never a proven loss. Cell shading is mean label
// support, so a confidently-placed cell and a barely-placed one do not look identical.
import { el, fmt } from '../core/dom.js';
import { loadFacets, facetRow } from '../core/data.js';
import { browseHref } from '../core/browse.js';

const CHRS = [1, 2, 3, 4, 5, 6, 7];
const GAMMA = [1, 2, 3];
const SALICOID = [1, 2];

/** Reduce the facet index to the 42 cells, per haplotype and pooled. */
function grid(rows) {
  const cells = new Map();
  const bump = (key, r) => {
    if (!cells.has(key)) cells.set(key, { n: 0, hap1: 0, hap2: 0, sp: 0, spN: 0 });
    const c = cells.get(key);
    c.n += 1;
    c[r.hap] += 1;
  };
  let placed = 0;
  let noCopy = 0;
  let unplaced = 0;
  for (const r of rows) {
    const v = r.aek;
    if (v == null || v < 0) { unplaced += 1; continue; }
    const c = Math.floor(v / 100);
    const g = Math.floor(v / 10) % 10;
    const s = v % 10;
    if (!c) { unplaced += 1; continue; }
    placed += 1;
    if (!g || !s) { noCopy += 1; bump(`${c}|0|0`, r); continue; }
    bump(`${c}|${g}|${s}`, r);
  }
  return { cells, placed, noCopy, unplaced };
}

function cellHref(c, g, s) {
  // A cell is a real, shareable Browse query. Salicoid copy needs the filter to accept it --
  // see the `aek` filter in browse.js, extended alongside this view.
  if (!g) return browseHref({ aek: `AEK${c}` });
  if (!s) return browseHref({ aek: `AEK${c}_gamma_copy_${g}` });
  return browseHref({ aek: `AEK${c}_gamma_copy_${g}_salicoid_copy_${s}` });
}

function cellBox(c, g, s, cell, max) {
  const n = cell ? cell.n : 0;
  // Saturation by count, floor at a visible tint so a populated-but-small cell is not white.
  const t = n ? 0.12 + 0.78 * (Math.log10(n + 1) / Math.log10(max + 1)) : 0;
  const bg = n ? `color-mix(in srgb, var(--accent) ${Math.round(t * 100)}%, transparent)` : 'transparent';
  const inner = el('div', {
    style: `padding:6px 4px;border-radius:5px;background:${bg};min-height:46px;`
      + 'display:flex;flex-direction:column;justify-content:center;align-items:center;gap:1px',
  },
    el('div', { style: `font-size:13px;font-weight:${n ? 600 : 400};color:${n ? 'var(--ink)' : 'var(--ink-3)'}` },
      n ? fmt(n) : '—'),
    n ? el('div', { style: 'font-size:10px;color:var(--ink-2)' },
      `${fmt(cell.hap1)} / ${fmt(cell.hap2)}`) : null);
  if (!n) {
    return el('div', { title: 'No collinear anchor in either haplotype carries this slot. '
      + 'That is not evidence the gene was lost.' }, inner);
  }
  return el('a', {
    href: cellHref(c, g, s),
    title: `AEK${c}, gamma copy ${g}, salicoid copy ${s}: ${fmt(n)} genes `
      + `(${fmt(cell.hap1)} HAP1, ${fmt(cell.hap2)} HAP2). Click to browse them.`,
    style: 'text-decoration:none;display:block',
  }, inner);
}

export async function karyotypeView() {
  const facets = await loadFacets();
  const rows = facets.rows.map((_, i) => facetRow(facets, i));
  const { cells, placed, noCopy, unplaced } = grid(rows);
  const max = Math.max(...[...cells.values()].map((c) => c.n), 1);

  const header = el('tr', {}, el('th', { style: 'text-align:left' }, ''),
    ...CHRS.map((c) => el('th', { style: 'text-align:center' }, `AEK${c}`)));

  const body = [];
  for (const g of GAMMA) {
    for (const s of SALICOID) {
      body.push(el('tr', {},
        el('th', { style: 'text-align:left;font-weight:500;white-space:nowrap;font-size:12px' },
          `gamma ${g} · salicoid ${s}`),
        ...CHRS.map((c) => el('td', { style: 'padding:2px' },
          cellBox(c, g, s, cells.get(`${c}|${g}|${s}`), max)))));
    }
  }
  body.push(el('tr', {},
    el('th', { style: 'text-align:left;font-weight:500;font-size:12px;color:var(--ink-2)' },
      'no copy assigned'),
    ...CHRS.map((c) => el('td', { style: 'padding:2px' },
      cellBox(c, 0, 0, cells.get(`${c}|0|0`), max)))));

  return el('div', {},
    el('h1', {}, 'Ancestral karyotype', el('span', { class: 'badge', style: 'margin-left:10px;font-size:12px;padding:1px 7px' }, 'exploratory')),
    el('p', { class: 'sub' },
      'Where each gene came from, rather than where it sits now. Seven ancestral eudicot '
      + 'chromosomes, each in three gamma copies, each in two salicoid copies. Every cell is a '
      + 'query: click one to browse its genes.'),

    el('div', { class: 'stat-row' },
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(placed)), el('div', { class: 'l' }, 'genes placed on the ancestral genome')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(noCopy)), el('div', { class: 'l' }, 'placed, but no copy assigned')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(unplaced)), el('div', { class: 'l' }, 'not placed')),
    ),

    el('div', { class: 'card' },
      el('h2', {}, 'The 42 cells', el('span', { class: 'tag' }, 'count, then HAP1 / HAP2')),
      el('div', { class: 'scroll-x' },
        el('table', { class: 'data', style: 'width:100%' },
          el('thead', {}, header), el('tbody', {}, ...body))),
      el('p', { class: 'muted', style: 'font-size:11.5px;margin:12px 0 0' },
        'Shading is the gene count on a log scale, not confidence. A dash means no collinear '
        + 'anchor in either haplotype carries that slot — that is an absence of evidence, '
        + 'not evidence the gene was lost. The two numbers under each count are HAP1 / HAP2, so '
        + 'a cell where the haplotypes disagree is visible without opening anything.')),

    el('div', { class: 'card' },
      el('h2', {}, 'What these numbers are, and are not'),
      el('p', { style: 'margin:0;font-size:13.5px;color:var(--ink-2)' },
        'Gamma copy (1 to 3) and salicoid copy (1 to 2) are completeness ',
        el('strong', {}, 'ranks'),
        ' from Wang et al.’s karyotype projection, ranked within one ancestral chromosome. ',
        el('strong', {}, 'They are not subgenomes'),
        ', and copy 1 of AEK3 has no relationship to copy 1 of AEK5. A copy says which '
        + 'ancestral copy a gene descends from, not whether its duplicate survived — that '
        + 'is the whole-genome-duplication call on each gene page.'),
      el('p', { class: 'muted', style: 'font-size:12px;margin:10px 0 0' },
        'Route C, exploratory. Ancestral chromosomes come from collinearity between the 717 '
        + 'genome and the ancestral karyotype genes of Wang et al. 2022, BMC Biology 20:216; '
        + 'copy names come from collinear blocks shared with P. trichocarpa v3.1.')));
}

export default { id: 'karyotype', label: 'Karyotype' };
