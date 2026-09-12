// Module: duplication. Within-haplotype paralog pairs with dS/dN, plus tandem-array context.
//
// Scope is stated on the page, because it is easy to over-read: the paralog set is the
// chapter's tier-2 selection (phylostrata 16-18 plus a rank-12 comparator), NOT a genome-wide
// duplication catalog. Tandem-array membership, by contrast, is genome-wide.
import { el, fmt } from '../core/dom.js';
import { loadArrays } from '../core/data.js';

const STRATUM = { 12: 'Pentapetalae', 16: 'Salicaceae', 17: 'Saliceae', 18: 'Populus', 19: 'hybrid' };

const DUP_CODE = { S: 'salicoid WGD', A: 'ancient WGD', T: 'tandem', D: 'dispersed' };

function dupTypeLabel(d) {
  if (!d) return null;
  if (d.t === 'C') return 'no duplication detected';
  const parts = [];
  if (d.s) parts.push(DUP_CODE.S);
  if (d.a) parts.push(DUP_CODE.A);
  if (d.td) parts.push(DUP_CODE.T);
  if (d.d) parts.push(DUP_CODE.D);
  return parts.join(' + ') || d.t;
}

function geneCard(g) {
  const para = g.para;
  const inArray = !!((g.syn || {}).flags || {}).ar;
  if (!para && !inArray && !g.dup && !g.te) return null;

  const card = el('div', { class: 'card' },
    el('h2', {}, 'Duplication', el('span', { class: 'tag' }, 'MS1 duplication set')));

  if (g.dup) {
    const kv = el('dl', { class: 'kv' });
    kv.append(el('dt', {}, 'Duplication class'),
      el('dd', {}, el('strong', {}, dupTypeLabel(g.dup)),
        el('span', { class: 'muted mono', style: 'font-size:11.5px' }, `  ${g.dup.t}`),
        el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' },
          'A gene can belong to several duplication modes at once; the code concatenates them.')));
    if (g.te && g.te.all != null) {
      const near = Object.entries(g.te).filter(([k]) => k !== 'all')
        .sort((a, b) => a[1] - b[1]).slice(0, 3);
      // 0 is not missing data and not "adjacent": it means a repeat annotation overlaps the
      // gene body. Saying "0 bp" left a reader to guess which, and most guessed wrong.
      const overlaps = g.te.all === 0;
      kv.append(el('dt', {}, overlaps ? 'Transposable element' : 'Nearest transposable element'),
        el('dd', {},
          overlaps
            ? el('span', {}, el('strong', {}, 'overlaps this gene'),
                el('span', { class: 'muted' }, ' — a repeat annotation falls inside the gene body'))
            : el('span', {}, el('span', { class: 'mono' }, fmt(g.te.all)),
                ' bp away from the gene'),
          el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' },
            'nearest of each superfamily: '
            + near.map(([k, v]) => `${k} ${v === 0 ? 'overlapping' : fmt(v) + ' bp'}`).join(' · '))));
    }
    card.append(kv);
  }

  const td = g.td;
  if (td) {
    const kv = el('dl', { class: 'kv' });
    kv.append(el('dt', {}, 'Tandem array'),
      el('dd', {}, el('span', { class: 'mono' }, td.aid || '—'),
        el('span', { class: 'muted' }, `  ${td.n} member${td.n === 1 ? '' : 's'}`),
        td.age ? el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' },
          `age bin ${td.age}${td.ks != null ? ` · array median Ks ${td.ks}` : ''}`) : null));
    if (td.pseudo || td.removed || td.note) {
      kv.append(el('dt', {}, 'Curation'),
        el('dd', {},
          td.removed ? el('div', {}, el('strong', {}, 'removed from the curated set'),
            td.why ? el('span', { class: 'muted' }, ` — ${td.why}`) : null) : null,
          td.pseudo ? el('div', {}, el('span', { class: 'badge' }, 'pseudogene-like')) : null,
          td.note ? el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' }, td.note) : null));
    }
    const members = el('div', { style: 'margin-top:4px' });
    kv.append(el('dt', {}, 'Array members'), el('dd', {}, members));
    if (td.aid) {
      loadArrays().then((all) => {
        const ids = all[td.aid] || [];
        members.append(...ids.map((id, i) => el('span', {},
          i ? ' · ' : '',
          id === g.id ? el('strong', { class: 'mono' }, id)
                      : el('a', { href: `#/gene/${id}`, class: 'mono' }, id))));
      }).catch(() => members.append(el('span', { class: 'muted' }, 'unavailable')));
    }
    card.append(kv);
  } else if (inArray) {
    card.append(el('dl', { class: 'kv' },
      el('dt', {}, 'Tandem array'),
      el('dd', {}, el('span', { class: 'badge' }, el('i', { class: 'dot tandem' }), 'array placement'),
        el('div', { class: 'muted', style: 'font-size:12px;margin-top:3px' },
          'GENESPACE placed this gene in a tandem array, but it is not in the curated union '
          + 'tandem set — so no array identity or age is available for it.'))));
  }

  // PAV / hemizygosity: a candidate set (6,092 genes from an asymmetric HAP1/HAP2


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
    // Two different definitions sit in one card and can legitimately disagree. Say so, or a
    // reader sees "no duplication detected" directly above a list of paralogs.
    if (g.dup && g.dup.t === 'C') {
      card.append(el('div', { class: 'warn' },
        el('strong', {}, 'These two rows use different definitions. '),
        'The class above asks whether the gene falls in a collinear WGD block, a tandem array, '
        + 'or a dispersed duplicate pair. The paralogs here come from gene-family membership. '
        + 'A gene can have a family paralog without meeting any of those structural criteria — '
        + 'that is a difference in question asked, not a contradiction.'));
    }
  }
  return card;
}

function dupClassChart(man) {
  const dist = (man.layers && man.layers.dup_class_dist) || {};
  const rows = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return el('p', { class: 'muted' }, 'Distribution not built.');
  const max = Math.max(...rows.map((r) => r[1]));
  const expand = (code) => code === 'C' ? 'none detected'
    : [...code].map((ch) => DUP_CODE[ch] || ch).join(' + ');
  return el('div', { class: 'barchart' }, ...rows.map(([code, n]) =>
    el('div', { class: 'barrow', style: 'grid-template-columns:190px 1fr 62px' },
      el('span', { class: 'lbl' }, el('b', {}, code), el('span', { class: 'muted' }, `  ${expand(code)}`)),
      el('div', { class: 'bartrack' },
        el('div', { class: 'barfill', style: `width:${(n / max) * 100}%;background:var(--accent)` })),
      el('span', { class: 'val' }, fmt(n)))));
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
      el('h2', {}, 'Duplication class', el('span', { class: 'tag' }, 'genome-wide')),
      el('p', { class: 'muted', style: 'font-size:12.5px;margin:0 0 12px' },
        'From the MS1 duplication analysis, for all 63,960 genes. Codes concatenate: '
        + 'S salicoid WGD, A ancient WGD, T tandem, D dispersed, C none detected.'),
      dupClassChart(man)),
    el('div', { class: 'card' },
      el('h2', {}, 'What is not here'),
      el('ul', { style: 'margin:0;padding-left:18px;font-size:13.5px;color:var(--ink-2);line-height:1.6' },
        el('li', {}, el('strong', {}, 'The dS panel and the duplication class are different things. '),
          'The class (salicoid / ancient WGD / tandem / dispersed) is genome-wide, from the MS1 '
          + 'duplication analysis. The dS pairs below are the chapter\'s stratum-selected subset. '
          + 'Do not read a dS distribution from the latter as a property of the former.'),
        el('li', {}, el('strong', {}, 'No genome-wide dS landscape. '),
          `The ${fmt(d.n_pairs)} pairs here were chosen for the chapter's tier-2 analysis. A `
          + 'genome-wide all-by-all paralog scan is a separate computation.'),
        el('li', {}, el('strong', {}, 'Tandem calls come from the curated union set. '),
          'ms1-dup supersedes its own v8 tandem tables with a hand-curated union of 13,663 '
          + 'genes in 4,371 arrays, carrying array identity, age bin and the curator\'s '
          + 'verdict. Genes GENESPACE places in an array but which are absent from that set '
          + 'are shown without an array id rather than given a synthetic one.'))),
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
