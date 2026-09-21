// Route: #/pair/<id> -- the allele PAIR as the primitive, not two independent gene pages.
//
// WHY THIS EXISTS. This is one of very few resources that carries both phased haplotypes of a
// hybrid clone, with per-haplotype expression, duplication calls and allele links. Until now
// that showed up as a cross-reference: a line on the annotation card saying "the other allele
// is X", which a reader follows, losing the first gene from the screen. Every question that is
// actually about the hybrid -- does one allele carry a duplication the other lost, do the two
// disagree about age, is one silent -- required holding two pages in your head.
//
// So: one page, two columns, and a row per property. The comparison IS the page.
//
// ONE RULE THROUGHOUT: a row where the two sides differ is marked, and a row where a side has
// no data says so rather than rendering an empty cell. "HAP2 has no Pfam" is a release gap
// (27,004 genes, see the annotation module), not a biological absence, and a blank cell in a
// two-column layout reads as "nothing there" instead of "not measured".
import { el, fmt } from '../core/dom.js';
import { getGene, hapLabel, loadExprVector } from '../core/data.js';

const pct = (x) => `${(x * 100).toFixed(0)}%`;

/** Both records for a pair, given either member. Returns null if the gene has no allele. */
export async function resolvePair(id) {
  const g = await getGene(id);
  if (!g) return null;
  if (!g.allele) return { solo: g };
  const other = await getGene(g.allele.id);
  if (!other) return { solo: g };
  // Always present HAP1 on the left, whichever side the reader arrived from, so that two
  // readers who came in from opposite alleles are looking at the same picture.
  return g.hap === 'hap1' ? { a: g, b: other, ks: g.allele } : { a: other, b: g, ks: other.allele };
}

const DUP_CODE = { A: 'gamma', S: 'salicoid', T: 'tandem', D: 'dispersed', C: 'none' };
const dupWords = (d) => (!d ? null : (d.t === 'C' ? 'none detected'
  : [...(d.t || '')].map((c) => DUP_CODE[c]).filter(Boolean).join(' + ')));

/** One comparison row. `get` returns a display value; `differs` decides the marker. */
function row(label, a, b, get, opts = {}) {
  const va = get(a);
  const vb = get(b);
  const missing = (v) => v === null || v === undefined || v === '';
  const differ = opts.differs ? opts.differs(a, b) : (String(va) !== String(vb));
  const cell = (v) => (missing(v)
    ? el('td', { class: 'muted', title: opts.absent || 'not measured for this haplotype' },
        opts.absentLabel || 'not measured')
    : el('td', {}, v));
  return el('tr', { style: differ ? 'background:var(--panel-2)' : null },
    el('th', { style: 'text-align:left;font-weight:500' }, label),
    cell(va), cell(vb),
    el('td', { style: 'width:1%;white-space:nowrap' }, differ && !missing(va) && !missing(vb)
      ? el('span', { class: 'badge', title: 'the two alleles differ here' }, 'differs')
      : ''));
}

function comparisonTable(a, b) {
  const t = (g) => (g.x && g.x.top) || null;
  const rows = [
    // Never marked: two alleles have different ids and coordinates BY CONSTRUCTION, and
    // flagging that dilutes the rows where a difference actually means something.
    row('Gene', a, b, (g) => el('a', { href: `#/gene/${g.id}`, class: 'mono' }, g.id),
      { differs: () => false }),
    row('Position', a, b, (g) => `${g.chr}:${fmt(g.start)}–${fmt(g.end)}`,
      { differs: () => false }),
    // A span difference is worth marking only when it is real: 4.46 kb against 4.49 is not
    // a finding, a gene half the length of its allele is.
    row('Span', a, b, (g) => `${((g.end - g.start) / 1000).toFixed(2)} kb`,
      { differs: (x, y) => Math.abs((x.end - x.start) - (y.end - y.start)) > 0.1 * (x.end - x.start) }),
    row('Exons', a, b, (g) => (g.gs ? g.gs.ex : null)),
    row('Synteny class', a, b, (g) => (g.syn ? (g.syn.cls || '').replace(/_/g, ' ') : null)),
    row('Phylostratum', a, b, (g) => (g.ps && g.ps.rank != null ? `PS${g.ps.rank} · ${g.ps.name}` : null)),
    row('Duplication', a, b, (g) => dupWords(g.dup)),
    row('Tandem array', a, b, (g) => (g.td ? `${g.td.aid} · ${g.td.n} members` : 'not in one'),
      { absentLabel: 'not in one' }),
    row('Peak tissue', a, b, t),
    row('τ (tissue specificity)', a, b, (g) => (g.x && g.x.tau != null ? g.x.tau.toFixed(2) : null)),
    row('Max TPM (652 samples)', a, b, (g) => (g.x && g.x.max != null ? g.x.max.toFixed(1) : null)),
    row('Arabidopsis hit', a, b, (g) => ((g.ann || {}).at || null), { absentLabel: 'none' }),
    row('Pfam domains', a, b, (g) => (((g.ann || {}).pf || []).join(', ') || null),
      { absentLabel: 'none recorded' }),
    row('ω vs P. trichocarpa', a, b, (g) => (g.ks && g.ks.w != null ? g.ks.w.toFixed(3) : null),
      { absentLabel: 'no 1:1 ortholog' }),
  ];
  return el('div', { class: 'scroll-x' }, el('table', { class: 'data' },
    el('thead', {}, el('tr', {},
      el('th', {}, ''), el('th', {}, hapLabel('hap1')), el('th', {}, hapLabel('hap2')), el('th', {}, ''))),
    el('tbody', {}, ...rows)));
}

/** Per-tissue medians for both alleles, side by side, on one shared scale. */
function tissueCompare(a, b) {
  const ta = (a.x || {}).t || {};
  const tb = (b.x || {}).t || {};
  const tissues = [...new Set([...Object.keys(ta), ...Object.keys(tb)])];
  if (!tissues.length) return null;
  const max = Math.max(...tissues.flatMap((k) => [ta[k] || 0, tb[k] || 0]), 0.01);
  const bar = (v, colour) => el('div', { style: 'display:flex;align-items:center;gap:6px' },
    el('div', { class: 'bar', style: `width:${Math.max((v / max) * 100, v > 0 ? 1.5 : 0)}%;background:${colour}` }),
    el('span', { class: 'num', style: 'font-size:11.5px' }, v == null ? '—' : v.toFixed(2)));
  return el('table', { class: 'data' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Tissue'),
      el('th', {}, 'HAP1 (TreH)'), el('th', {}, 'HAP2 (AlbH)'))),
    el('tbody', {}, ...tissues.map((k) => el('tr', {},
      el('td', {}, k),
      el('td', { style: 'width:42%' }, bar(ta[k], 'var(--c-core)')),
      el('td', { style: 'width:42%' }, bar(tb[k], 'var(--c-priv)'))))));
}

/** Correlation of the two alleles across all 652 samples, computed here from the two vectors.
 *  Stated as what it is: a descriptive number on raw TPM, not an allele-specific expression
 *  result -- ASE needs read-level phasing-aware quantification, which this atlas does not
 *  have (TODO 19, closed deliberately). Saying so here is the point; the number invites
 *  exactly that misreading. */
async function alleleCorrelation(a, b, holder) {
  try {
    const [va, vb] = await Promise.all([loadExprVector(a), loadExprVector(b)]);
    if (!va || !vb || va.length !== vb.length) {
      holder.textContent = 'One allele has no expression profile, so no correlation is shown.';
      return;
    }
    const lg = (v) => v.map((x) => Math.log2(x + 1));
    const xa = lg(va);
    const xb = lg(vb);
    const m = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    const ma = m(xa);
    const mb = m(xb);
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < xa.length; i += 1) {
      const p = xa[i] - ma;
      const q = xb[i] - mb;
      num += p * q; da += p * p; db += q * q;
    }
    const r = (da > 0 && db > 0) ? num / Math.sqrt(da * db) : null;
    const bothOff = xa.reduce((n, _, i) => n + (va[i] < 1 && vb[i] < 1 ? 1 : 0), 0);
    holder.replaceChildren(
      el('span', {}, 'Pearson ', el('strong', {}, r == null ? 'not computable' : r.toFixed(3)),
        ' on log2(TPM + 1) across all 652 samples, computed in your browser from the two '
        + 'profiles this page just fetched. '),
      el('span', { class: 'muted' },
        `${pct(bothOff / xa.length)} of samples have both alleles under 1 TPM, where a `
        + 'correlation is driven by noise. This is raw TPM on a combined-transcriptome '
        + 'quantification, NOT allele-specific expression: reads that map equally well to '
        + 'both alleles are not resolved here, so a high correlation partly reflects that. '
        + 'Read-level ASE is not in this atlas.'));
  } catch (e) {
    holder.textContent = `Correlation unavailable: ${e.message}`;
  }
}

export async function pairView(id) {
  const res = await resolvePair(id);
  if (!res) {
    return el('div', { class: 'empty' }, el('h2', {}, 'No such gene'),
      el('p', { class: 'mono' }, id));
  }
  if (res.solo) {
    const g = res.solo;
    return el('div', {},
      el('h1', {}, 'No allele pair'),
      el('p', { class: 'sub' }, el('span', { class: 'mono' }, g.id),
        ' has no allele in the other haplotype.'),
      el('div', { class: 'card' },
        el('p', { style: 'margin:0;font-size:13.5px' },
          'That is a real and interesting state, not missing data: 12,098 genes are in it. It '
          + 'can mean a genuine presence/absence difference between the two parent genomes, or '
          + 'that the syntelog call could not be made here. The gene page states which, where '
          + 'the evidence exists.'),
        el('p', { style: 'margin:10px 0 0' },
          el('a', { href: `#/gene/${g.id}` }, 'Open the gene page →'), '  ',
          el('a', { href: '#/browse?allele=no', style: 'margin-left:14px' },
            'Browse all genes with no allele →'))));
  }

  const { a, b, ks } = res;
  const corr = el('p', { class: 'muted', style: 'font-size:12.5px;margin:0' },
    'Computing the correlation across 652 samples…');
  alleleCorrelation(a, b, corr);

  const tc = tissueCompare(a, b);
  return el('div', {},
    el('h1', {}, 'Allele pair'),
    el('p', { class: 'sub' },
      el('span', { class: 'mono' }, a.id), ' · ', el('span', { class: 'mono' }, b.id),
      ' — the same locus in the two phased haplotypes of clone INRA 717-1B4.'),

    el('div', { class: 'stat-row' },
      el('div', { class: 'stat' }, el('div', { class: 'n' }, ks && ks.ks != null ? ks.ks.toFixed(4) : '—'),
        el('div', { class: 'l' }, 'dS between alleles')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, ks && ks.ka != null ? ks.ka.toFixed(4) : '—'),
        el('div', { class: 'l' }, 'dN')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, ks && ks.w != null ? ks.w.toFixed(3) : '—'),
        el('div', { class: 'l' }, 'ω')),
    ),

    el('div', { class: 'card' },
      el('h2', {}, 'Side by side', el('span', { class: 'tag' }, 'rows that differ are marked')),
      comparisonTable(a, b),
      el('p', { class: 'muted', style: 'font-size:11.5px;margin:10px 0 0' },
        'A shaded row means the two alleles differ. "not measured" is not "absent": HAP2 '
        + 'domain annotation is thinner than HAP1 for release reasons, so an empty Pfam cell '
        + 'on the right is a gap in the annotation, not a protein without domains.')),

    tc ? el('div', { class: 'card' },
      el('h2', {}, 'Expression, allele against allele', el('span', { class: 'tag' }, 'median TPM, baseline controls')),
      tc,
      el('div', { style: 'margin-top:10px' }, corr)) : null,

    el('div', { class: 'card' },
      el('h2', {}, 'Open either side'),
      el('p', { style: 'margin:0' },
        el('a', { href: `#/gene/${a.id}` }, `${a.id} →`), '  ',
        el('a', { href: `#/gene/${b.id}`, style: 'margin-left:16px' }, `${b.id} →`))));
}

export default { id: 'pair', label: 'Allele pair' };
