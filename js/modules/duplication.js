// Module: duplication. Within-haplotype paralog pairs with dS/dN, plus tandem-array context.
//
// Scope is stated on the page, because it is easy to over-read: the paralog set is the
// chapter's tier-2 selection (phylostrata 16-18 plus a rank-12 comparator), NOT a genome-wide
// duplication catalog. Tandem-array membership, by contrast, is genome-wide.
import { el, fmt } from '../core/dom.js';
import { loadArrays } from '../core/data.js';
import { browseHref } from '../core/browse.js';

// Paralog-pair provenance, as a reader would say it. The upstream code for the first source is
// "founder" (the gene family's oldest member arises at that stratum); the word explained nothing.
const PAIR_SRC = { founder: 'same gene family', synteny: 'syntenic paralog' };

// The two whole-genome events every Populus gene can carry, oldest last. Codes match g.dup.
const WGD_EVENT = {
  S: { name: 'Salicoid WGD', when: 'whole-genome duplication shared by Populus and Salix, about 60 million years ago; median anchor dS in this genome 0.27' },
  A: { name: 'Gamma', when: 'whole-genome triplication shared by all core eudicots, about 120 million years ago; median anchor dS in this genome 1.90' },
};

const STRATUM = { 12: 'Pentapetalae', 16: 'Salicaceae', 17: 'Saliceae', 18: 'Populus', 19: 'hybrid' };

const DUP_CODE = { S: 'salicoid WGD', A: 'gamma WGD', T: 'tandem', D: 'dispersed' };

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

function wgdSection(g) {
  const d = g.dup || {};
  const pairs = g.wgd || [];
  const wrap = el('div', { style: 'margin-top:12px' },
    el('h3', { style: 'font-size:13px;margin:0 0 6px' }, 'Whole-genome duplication'));
  const kv = el('dl', { class: 'kv' });
  for (const code of ['S', 'A']) {
    const ev = WGD_EVENT[code];
    const called = code === 'S' ? !!d.s : !!d.a;
    const mine = pairs.filter((p) => p.e === code);
    kv.append(el('dt', {}, ev.name),
      el('dd', {},
        called ? el('strong', {}, 'retained duplicate') : el('span', { class: 'muted' }, 'not called'),
        mine.length ? el('span', { class: 'muted' }, ` · ${mine.length} anchor partner${mine.length === 1 ? '' : 's'}`) : null,
        el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' }, ev.when)));
  }
  wrap.append(kv);

  if (pairs.length) {
    const rows = pairs.map((p) => el('tr', {},
      el('td', {}, el('a', { href: `#/gene/${p.id}`, class: 'mono' }, p.id)),
      el('td', {}, WGD_EVENT[p.e].name),
      el('td', { class: 'num' }, p.ks == null ? '—' : p.ks.toFixed(3)),
      el('td', { class: 'num' }, p.ss == null ? '—' : p.ss.toFixed(1)),
      el('td', { class: 'mono' }, p.cp),
      el('td', { class: 'num mono' }, p.m),
      el('td', { class: 'num' }, p.r == null
        ? el('span', { class: 'muted', title: 'not comparable on the batch-corrected matrix' }, 'n/c')
        : el('span', { class: 'mono' }, p.r.toFixed(2))),
      el('td', { class: 'muted', style: 'font-size:11.5px' }, p.c ? 'dS conflict resolved' : '')));
    wrap.append(el('div', { class: 'scroll-x' }, el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Partner'), el('th', {}, 'Event'),
        el('th', { class: 'num', title: 'synonymous divergence of the anchor pair' }, 'dS'),
        el('th', { class: 'num', title: 'synonymous sites in the alignment; below 25 the dS is unreliable' }, 'Syn. sites'),
        el('th', {}, 'Chromosomes'),
        el('th', { class: 'num', title: 'collinear block (i-ADHoRe multiplicon) the anchor sits in' }, 'Block'),
        el('th', { class: 'num', title: 'Pearson r on batch-corrected log2 expression, 652 samples' }, 'Expr r'),
        el('th', {}, ''))),
      el('tbody', {}, ...rows))));
    wrap.append(el('p', { class: 'muted', style: 'font-size:11.5px;margin:6px 0 0' },
      'Every anchor pair from the MS1 WGD analysis is listed, unfiltered. Gamma was a '
      + 'triplication, so a gene can have two gamma partners; later salicoid duplication of '
      + 'both copies gives more. Expression r uses the same basis as the other duplicate tables; '
      + '"n/c" means not comparable, not uncorrelated.'));
  }
  // The gene-level call and the pair table come from two steps of the same curated pipeline and
  // disagree on about 70 genes. Show both rather than overwrite either.
  const mismatch = ['S', 'A'].filter((c) =>
    (c === 'S' ? !!d.s : !!d.a) !== pairs.some((p) => p.e === c));
  if (g.dup && mismatch.length) {
    wrap.append(el('div', { class: 'warn' },
      el('strong', {}, 'The call and the anchor table differ for this gene. '),
      `For ${mismatch.map((c) => WGD_EVENT[c].name).join(' and ')}, the curated gene-level `
      + 'call and the anchor-pair label disagree. The call comes first in the pipeline and '
      + 'includes a dS conflict resolution applied per gene; the anchor label is kept as it '
      + 'was published. Neither is overridden here.'));
  }
  return wrap;
}

function geneCard(g) {
  const para = g.para;
  const inArray = !!((g.syn || {}).flags || {}).ar;
  if (!para && !inArray && !g.dup && !g.te && !g.wgd) return null;

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

  if (g.dup || g.wgd) card.append(wgdSection(g));

  const td = g.td;
  if (td) {
    const kv = el('dl', { class: 'kv' });
    kv.append(el('dt', {}, 'Tandem array'),
      el('dd', {}, el('span', { class: 'mono' }, td.aid || '—'),
        el('span', { class: 'muted' }, `  ${td.n} member${td.n === 1 ? '' : 's'}`),
        td.age ? el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' },
          `age bin ${td.age}${td.ks != null ? ` · array median Ks ${td.ks}` : ''}`) : null));
    // The card named the array and counted it, so a reader could see "7 members" and never
    // learn which seven. No per-member dS is shown: td.ks is the ARRAY MEDIAN, and printing it
    // next to an individual member would read as that pair's divergence.
    if (td.mem && td.mem.length) {
      const rows = td.mem.map(([id, r]) => el('tr', {},
        el('td', {}, el('a', { href: `#/gene/${id}`, class: 'mono' }, id)),
        el('td', { class: 'num' }, r == null
          ? el('span', { class: 'muted', title: 'not comparable on the batch-corrected matrix' }, 'n/c')
          : el('span', { class: 'mono' }, r.toFixed(2)))));
      kv.append(el('dt', {}, 'Other members'),
        el('dd', {},
          el('div', { class: 'scroll-x' }, el('table', { class: 'data' },
            el('thead', {}, el('tr', {}, el('th', {}, 'Gene'),
              el('th', { class: 'num', title: 'Pearson r on batch-corrected log2 expression, '
                + '652 samples' }, 'Expr r'))),
            el('tbody', {}, ...rows))),
          td.more
            ? el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px' },
                `and ${td.more} more, not listed.`)
            : null,
          el('div', { class: 'muted', style: 'font-size:11.5px;margin-top:5px' },
            'Expression r is a plain Pearson correlation across the 652 samples, on the '
            + 'batch-corrected matrix — the same basis as the neighbour co-expression on the '
            + 'expression card, because a 652-sample correlation spans 28 studies. It is a '
            + 'descriptive number, not a divergence model, and "n/c" means the pair cannot be '
            + 'compared on that matrix rather than that the two are uncorrelated.')));
    }
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
      // absence is "not comparable on the batch-corrected matrix", NOT "uncorrelated"
      el('td', { class: 'num' }, p.r == null
        ? el('span', { class: 'muted', title: 'one partner is outside the batch-corrected '
            + 'matrix, so the pair is not comparable — this is not a correlation of zero' }, 'n/c')
        : el('span', { class: 'mono' }, p.r.toFixed(2))),
      el('td', { class: 'muted', style: 'font-size:11.5px' },
        (PAIR_SRC[p.src] || p.src) + (p.sat ? ' · saturated' : ''))));
    card.append(
      el('h3', { style: 'font-size:13px;margin:14px 0 6px' }, `Paralog pairs (${para.length})`),
      el('div', { class: 'scroll-x' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Paralog'), el('th', { class: 'num' }, 'dS'),
          el('th', { class: 'num' }, 'dN'), el('th', { class: 'num' }, 'ω'),
          el('th', { class: 'num', title: 'Pearson r on batch-corrected log2 expression, '
            + '652 samples' }, 'Expr r'),
          el('th', {}, 'Source'))),
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

function wgdOverview(man) {
  // Counts come from the same curated class distribution as the chart above, split by event.
  // A gene with both letters counts under both, and again under "both".
  const dist = (man.layers && man.layers.dup_class_dist) || {};
  let s = 0, a = 0, both = 0;
  for (const [code, n] of Object.entries(dist)) {
    if (code.includes('S')) s += n;
    if (code.includes('A')) a += n;
    if (code.includes('S') && code.includes('A')) both += n;
  }
  const link = (v, n, label) => el('a', { href: browseHref({ wgd: v }), class: 'stat',
    style: 'text-decoration:none;color:inherit', title: `Browse these ${fmt(n)} genes` },
    el('div', { class: 'n' }, fmt(n)), el('div', { class: 'l' }, label));
  return el('div', { class: 'card' },
    el('h2', {}, 'Whole-genome duplication events', el('span', { class: 'tag' }, 'click to browse')),
    el('div', { class: 'stat-row' },
      link('salicoid', s, 'salicoid WGD genes'),
      link('gamma', a, 'gamma WGD genes'),
      link('both', both, 'retained from both')),
    el('dl', { class: 'kv' },
      ...['S', 'A'].flatMap((c) => [el('dt', {}, WGD_EVENT[c].name), el('dd', {}, WGD_EVENT[c].when)])),
    el('p', { class: 'muted', style: 'font-size:12.5px;margin:8px 0 0' },
      'Events are not exclusive. Each gene page lists every WGD anchor partner with its dS, '
      + 'block and expression correlation.'));
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
        + 'S salicoid WGD, A gamma WGD, T tandem, D dispersed, C none detected.'),
      dupClassChart(man)),
    wgdOverview(man),
    el('div', { class: 'card' },
      el('h2', {}, 'What is not here'),
      el('ul', { style: 'margin:0;padding-left:18px;font-size:13.5px;color:var(--ink-2);line-height:1.6' },
        el('li', {}, el('strong', {}, 'The dS panel and the duplication class are different things. '),
          'The class (salicoid WGD / gamma WGD / tandem / dispersed) is genome-wide, from the MS1 '
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
    { id: 'wgd_event', label: 'WGD event', options: ['salicoid', 'gamma'],
      test: (g, v) => !!(g.dup && (v === 'salicoid' ? g.dup.s : g.dup.a)) },
    { id: 'has_paralog', label: 'Has a scored paralog', options: ['yes', 'no'],
      test: (g, v) => (g.para && g.para.length ? 'yes' : 'no') === v },
  ],
};
