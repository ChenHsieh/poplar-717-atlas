// Module: duplication. Within-haplotype paralog pairs with dS/dN, plus tandem-array context.
//
// Scope is stated on the page, because it is easy to over-read: the paralog set is the
// chapter's tier-2 selection (phylostrata 16-18 plus a rank-12 comparator), NOT a genome-wide
// duplication catalog. Tandem-array membership, by contrast, is genome-wide.
import { el, fmt } from '../core/dom.js';

const STRATUM = { 12: 'Pentapetalae', 16: 'Salicaceae', 17: 'Saliceae', 18: 'Populus', 19: 'hybrid' };

function geneCard(g) {
  const para = g.para;
  const inArray = !!((g.syn || {}).flags || {}).ar;
  if (!para && !inArray) return null;

  const card = el('div', { class: 'card' },
    el('h2', {}, 'Duplication', el('span', { class: 'tag' }, 'paralogs · arrays')));

  if (inArray) {
    card.append(el('dl', { class: 'kv' },
      el('dt', {}, 'Tandem array'),
      el('dd', {}, el('span', { class: 'badge' }, el('i', { class: 'dot tandem' }), 'array member'),
        el('div', { class: 'muted', style: 'font-size:12px;margin-top:3px' },
          'GENESPACE placed this gene as a non-representative member of a tandem array. '
          + '6,804 genes across both haplotypes carry an array placement.'))));
  }

  if (para && para.length) {
    const rows = para.map((p) => el('tr', {},
      el('td', {}, el('a', { href: `#/gene/${p.id}`, class: 'mono' }, p.id)),
      el('td', { class: 'num' }, p.ks0 ? el('span', { class: 'muted' }, '0 *')
        : p.ks == null ? '—' : p.ks.toFixed(4)),
      el('td', { class: 'num' }, p.ka == null ? '—' : p.ka.toFixed(4)),
      el('td', { class: 'num' }, p.w == null ? el('span', { class: 'muted' }, '—') : p.w.toFixed(3)),
      el('td', { class: 'muted', style: 'font-size:11.5px' },
        p.src + (p.sat ? ' · saturated' : ''))));
    card.append(
      el('h3', { style: 'font-size:13px;margin:14px 0 6px' }, `Paralog pairs (${para.length})`),
      el('div', { class: 'scroll-x' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Paralog'), el('th', { class: 'num' }, 'dS'),
          el('th', { class: 'num' }, 'dN'), el('th', { class: 'num' }, 'ω'), el('th', {}, 'Source'))),
        el('tbody', {}, ...rows))));
    if (para.some((p) => p.ks0)) {
      card.append(el('p', { class: 'muted', style: 'font-size:11.5px;margin:8px 0 0' },
        '* dS is 0 — identical at synonymous sites, so ω is undefined rather than zero.'));
    }
    if (para.some((p) => p.sat)) {
      card.append(el('p', { class: 'muted', style: 'font-size:11.5px;margin:4px 0 0' },
        'Saturated pairs have too many synonymous substitutions for a reliable estimate.'));
    }
  }
  return card;
}

function ksChart(byRank) {
  const ranks = Object.keys(byRank).map(Number).sort((a, b) => a - b);
  const max = Math.max(...ranks.map((r) => byRank[r].q3));
  return el('div', {},
    el('div', { class: 'barchart' }, ...ranks.map((r) => {
      const s = byRank[r];
      // A quartile bar: the box runs q1..q3, the median is a tick. One scale for all rows.
      const l = (v) => (v / max) * 100;
      return el('div', { class: 'barrow', style: 'grid-template-columns:150px 1fr 66px' },
        el('span', { class: 'lbl' }, `PS${r} `, el('span', { class: 'muted' }, STRATUM[r] || '')),
        el('div', { class: 'bartrack', style: 'position:relative;height:13px' },
          el('div', {
            style: `position:absolute;left:${l(s.q1)}%;width:${Math.max(l(s.q3) - l(s.q1), 0.6)}%;`
              + `top:0;bottom:0;background:var(--accent);opacity:.35;border-radius:3px`,
          }),
          el('div', {
            title: `median dS ${s.med}`,
            style: `position:absolute;left:${l(s.med)}%;width:2px;top:0;bottom:0;background:var(--accent)`,
          })),
        el('span', { class: 'val' }, s.med.toFixed(3)));
    })),
    el('p', { class: 'muted', style: 'font-size:11.5px;margin:9px 0 0' },
      'Box spans the interquartile range, the line marks the median, and the number is the '
      + 'median dS. One linear scale across all strata.'));
}

async function overview(man) {
  const d = man.duplication;
  if (!d) return el('div', { class: 'empty' }, 'Duplication data not built.');
  return el('div', {},
    el('h1', {}, 'Duplication'),
    el('p', { class: 'sub' },
      'Within-haplotype paralog pairs with synonymous divergence, and tandem-array membership.'),
    el('div', { class: 'warn' },
      el('strong', {}, 'This paralog set is not genome-wide. '),
      d.scope),
    el('div', { class: 'stat-row' },
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(d.n_pairs)), el('div', { class: 'l' }, 'paralog pairs')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(d.n_genes)), el('div', { class: 'l' }, 'genes with a pair')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(6804)), el('div', { class: 'l' }, 'tandem-array members (genome-wide)')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(d.n_ks_undefined)), el('div', { class: 'l' }, 'pairs with dS = 0')),
    ),
    el('div', { class: 'card' },
      el('h2', {}, 'Synonymous divergence by phylostratum'),
      el('p', { class: 'muted', style: 'font-size:12.5px;margin:0 0 12px' },
        'Within the selection above, paralogs in younger strata are less diverged — median dS '
        + 'falls from 0.31 at Pentapetalae to 0.06 at Populus. That is the expected direction '
        + 'for more recent duplications, and a sanity check on the pairing, not a dating result.'),
      ksChart(d.ks_by_rank)),
    el('div', { class: 'card' },
      el('h2', {}, 'What is not here'),
      el('ul', { style: 'margin:0;padding-left:18px;font-size:13.5px;color:var(--ink-2);line-height:1.6' },
        el('li', {}, el('strong', {}, 'No salicoid-WGD ohnolog call. '),
          'None has been computed for this assembly. Inferring a whole-genome-duplication peak '
          + 'from a phylostratum-selected subset would be invalid, so the module does not try.'),
        el('li', {}, el('strong', {}, 'No genome-wide dS landscape. '),
          `The ${fmt(d.n_pairs)} pairs here were chosen for the chapter's tier-2 analysis. A `
          + 'genome-wide all-by-all paralog scan is a separate computation.'),
        el('li', {}, el('strong', {}, 'Array identity is not resolved. '),
          'A gene is flagged as an array member, but which genes share one array is not yet '
          + 'exposed — that needs the pangene positional grouping.'))),
  );
}

export default {
  id: 'duplication',
  label: 'Duplication',
  geneCard,
  overview,
  filters: [
    { id: 'has_paralog', label: 'Has a scored paralog', options: ['yes', 'no'],
      test: (g, v) => (g.para && g.para.length ? 'yes' : 'no') === v },
  ],
};
