// Module: phylostratigraphy (genEra). The gene's evolutionary age, its gene family's origin,
// and the caveats the method itself reports.
import { el, fmt, pct } from '../core/dom.js';
import { browseHref } from '../core/browse.js';

const LSG_MIN = 18;

const ABSENSE_VERDICT = {'a_retract_young_call': 'abSENSE retracts the young call', 'b_supports_lineage_specific': 'abSENSE supports lineage-specific', 'b_weak_low_sensitivity': 'abSENSE supports it, weakly (low sensitivity)', 'ancestral_sequence_present_unannotated': 'an ancestral sequence appears present but unannotated', 'ambiguous': 'abSENSE result is ambiguous', 'not_testable': 'not testable with abSENSE'};

function qcSummary(qc) {
  const flags = [];
  if (qc.ret) {
    flags.push(el('div', {}, el('span', { class: 'badge' }, 'tblastn'),
      ' a Salix hit contradicts the young call outright.'));
  }
  const verdictLabel = ABSENSE_VERDICT[qc.verdict] || qc.verdict;
  flags.push(el('div', {}, el('span', { class: 'muted' }, 'abSENSE: '), verdictLabel,
    qc.hdf === 'detection_failure_plausible'
      ? el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' },
          'This is about the reliability of the age call, not the gene — an ancestral homolog '
          + 'could exist and be undetectable at this sensitivity. It does not mean the gene is old.')
      : null,
    el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' },
      'How well calibrated is that? Measured for the first time in September 2026: abSENSE\u2019s '
      + 'nominal 99% prediction intervals contain 87 to 88% of true bitscores overall, but only '
      + '59 to 61% at Salix purpurea — and every abSENSE flag on this pool is a prediction at '
      + 'Salix purpurea, because that is the boundary species a Populus-specific call is made '
      + 'against. The bias there is about +19 bitscore units, in the direction that makes an '
      + 'absence look more surprising than it is. So this flag over-calls rather than '
      + 'under-calls a young gene. That figure is also the optimistic bound: it is measured on '
      + 'genes that do have a Salix homolog, which are by definition not the genes in this pool.')));
  if (qc.wgd) {
    flags.push(el('div', {}, el('span', { class: 'badge' }, 'WGD-era Ks'),
      ' minimum Ks falls in the salicoid-WGD era — may be an ohnolog, not a novelty.'));
  }
  if (qc.syn_any) {
    flags.push(el('div', {},
      'A 12-genome OrthoFinder rerun disputes this gene\'s orthogroup slot.'));
  }
  if (qc.short) {
    flags.push(el('div', {}, `Short ORF (${qc.plen} aa) — a known annotation-artifact class.`));
  }
  if (qc.stable === false) {
    flags.push(el('div', {}, el('span', { class: 'badge' }, 'sensitivity'),
      ' the chapter\'s headline result changes if this one gene is excluded.'));
  }
  return el('div', {},
    qc.clean
      ? el('div', { class: 'muted' }, 'No evidence-quality flag raised on this gene.')
      : el('div', {}, ...flags),
    el('div', { class: 'muted', style: 'font-size:11px;margin-top:4px' },
      'Flags, not filters — nothing here removes or renumbers a gene, and the pool size is '
      + 'never set by these fields; every claim about this gene should cite the flag alongside it.'));
}

function geneCard(g) {
  const p = g.ps;
  if (!p) return null;
  const kv = el('dl', { class: 'kv' });
  const add = (k, ...v) => { kv.append(el('dt', {}, k), el('dd', {}, ...v)); };

  add('Stratum', p.name
    ? el('span', {}, p.name, p.rank != null ? el('span', { class: 'muted' }, ` · PS${p.rank} of 19`) : null)
    : el('span', { class: 'muted' }, 'unplaced — genEra could not assign a stratum'));
  if (p.tr != null) {
    add('Taxonomic representativeness', `${p.tr}%`,
      el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' },
        'Share of the stratum’s lineages with a detectable homolog. Low values mean the '
        + 'assignment rests on few species.'));
  }
  if (p.rank != null) {
    add('LSG pool', p.rank >= LSG_MIN
      ? el('strong', {}, `yes — PS${p.rank}`)
      : el('span', { class: 'muted' }, `no (pool is PS ≥ ${LSG_MIN})`));
  }
  if (p.frz && p.frz.rank != null) {
    const left = p.frz.lsg && !(p.rank >= LSG_MIN);
    add('Changed in Sept 2026',
      el('div', {},
        el('div', {}, `The withdrawn 12-genome panel placed this gene at PS${p.frz.rank}`,
          p.frz.name ? ` (${p.frz.name})` : '', '. It is now ',
          el('strong', {}, `PS${p.rank}`), p.name ? ` (${p.name})` : '', '.'),
        left
          ? el('div', { style: 'margin-top:3px' },
              el('span', { class: 'badge' }, 'left the pool'),
              ' this gene was a lineage-specific candidate under the old panel and is not one now.')
          : null,
        (p.frz.rank === 19 && p.rank === 18)
          ? el('div', { style: 'margin-top:3px' },
              'It moved from the hybrid-only stratum to the Populus-wide one, and stayed in the '
              + 'pool. 179 genes made exactly this move; none moved the other way.')
          : null,
        el('div', { class: 'muted', style: 'font-size:12px;margin-top:3px' },
          'Why: Idesia polycarpa is the only Salicaceae genome available from outside Saliceae, '
          + 'and it was missing from the original panel — a gap sitting exactly where a '
          + 'Populus-specific call gets made, since a gene kept in Idesia but lost in Salix reads '
          + 'as Populus-specific. Adding it moved 766 genes and took 114 out of the pool, and it '
          + 'put none in. Movement in one direction only is what you expect from adding real '
          + 'homology signal rather than from noise.')));
  }
  if (g.qc) {
    kv.append(el('dt', {}, 'Evidence quality'), el('dd', {}, qcSummary(g.qc)));
  }
  if (p.fnd) {
    const s = p.fnd.fam;
    add('Gene family', s == null ? '—'
      : el('span', {}, s === 1 ? el('strong', {}, 'singleton') : `${fmt(s)} members`,
          p.fnd.rank != null && p.fnd.rank !== p.rank
            ? el('span', { class: 'muted' }, ` · family originates at PS${p.fnd.rank}`)
            : null));
  }

  const card = el('div', { class: 'card' },
    el('h2', {}, 'Phylostratigraphy', el('span', { class: 'tag' }, 'genEra')), kv);

  if (p.amb) {
    card.append(el('div', { class: 'warn' },
      el('strong', {}, 'genEra flagged this gene as ambiguous. '),
      'Its stratum could not be resolved to one node; the candidates are ',
      el('span', { class: 'mono', style: 'font-size:12px' }, p.amb.join(' · ')),
      '. The rank shown above is genEra’s pick among these, not a settled call.'));
  }
  if (p.rank == null) {
    card.append(el('div', { class: 'warn' },
      'genEra returned no rank for this gene. It is excluded from the LSG pool and from every '
      + 'stratum count, rather than being treated as youngest or oldest.'));
  }
  return card;
}

function ladderChart(rows, total) {
  // Counts span 22,769 (cellular organisms) to 33 (fabids) -- three orders of magnitude.
  // A linear axis would render 15 of 19 strata as invisible slivers, so the bar length is
  // log-scaled and the true count is printed beside every bar.
  const max = Math.max(...rows.map((r) => r.n));
  const lg = (n) => (n <= 0 ? 0 : Math.log10(n) / Math.log10(max));
  return el('div', {},
    el('div', { class: 'barchart' }, ...rows.slice().reverse().map((r) => {
      const lsg = r.rank >= LSG_MIN;
      return el('div', { class: 'barrow', style: 'grid-template-columns:150px 1fr 70px' },
        // the bar was a dead end; it is now the way into Browse for that stratum
        el('a', { class: 'lbl', href: browseHref({ ps: r.rank }),
                  title: `Browse the ${fmt(r.n)} genes in PS${r.rank}` },
          lsg ? el('b', {}, r.name) : r.name,
          el('span', { class: 'muted' }, ` PS${r.rank}`)),
        el('div', { class: 'bartrack' },
          el('div', {
            class: 'barfill',
            style: `width:${Math.max(lg(r.n) * 100, 1)}%;background:${lsg ? 'var(--c-priv)' : 'var(--accent)'}`,
          })),
        el('span', { class: 'val' }, fmt(r.n)));
    })),
    el('p', { class: 'muted', style: 'font-size:11.5px;margin:9px 0 0' },
      'Bar length is log-scaled — counts run from 22,769 to 33, and a linear axis would hide '
      + 'most strata. The number beside each bar is the true count. '
      + 'Amber marks the LSG pool (PS ≥ 18). Click a stratum to browse its genes.'));
}

async function overview(man) {
  const ps = man.phylostrat;
  if (!ps) return el('div', { class: 'empty' }, 'Phylostratigraphy data not built.');
  const h1 = ps.ladder.hap1, h2 = ps.ladder.hap2;
  const merged = h1.map((r) => {
    const o = h2.find((x) => x.rank === r.rank);
    return { rank: r.rank, name: r.name, n: r.n + (o ? o.n : 0) };
  });
  const total = merged.reduce((a, r) => a + r.n, 0);
  const lsg = merged.filter((r) => r.rank >= LSG_MIN).reduce((a, r) => a + r.n, 0);
  const naH1 = (ps.by_rank.hap1 || {}).NA || 0;
  const naH2 = (ps.by_rank.hap2 || {}).NA || 0;

  return el('div', {},
    el('h1', {}, 'Phylostratigraphy'),
    el('p', { class: 'sub' },
      'genEra assigns each gene to the oldest phylostratum in which a homolog is detectable, '
      + 'over 19 strata from cellular organisms to this hybrid. The chapter’s '
      + 'lineage-specific gene pool is PS ≥ 18; PS17 Saliceae is flanking context, not pool.'),
    el('div', { class: 'stat-row' },
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(total)), el('div', { class: 'l' }, 'genes placed')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(lsg)), el('div', { class: 'l' }, `LSG pool (PS ≥ ${LSG_MIN})`)),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(ps.n_ambiguous)), el('div', { class: 'l' }, 'ambiguous assignments')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(naH1 + naH2)), el('div', { class: 'l' }, 'unplaced by genEra')),
    ),
    el('div', { class: 'card' },
      el('h2', {}, 'Genes per stratum', el('span', { class: 'tag' }, 'both haplotypes')),
      ladderChart(merged, total)),
    el('div', { class: 'card' },
      el('h2', {}, 'Reading this carefully'),
      el('ul', { style: 'margin:0;padding-left:18px;font-size:13.5px;color:var(--ink-2);line-height:1.6' },
        el('li', {}, el('strong', {}, `${fmt(ps.n_ambiguous)} genes carry an ambiguity flag. `),
          'genEra could not resolve them to one node and lists several candidate strata. They '
          + 'still get a rank, so the flag is the only thing separating a confident call from a '
          + 'coin flip — every affected gene page says so.'),
        el('li', {}, el('strong', {}, `${fmt(naH1 + naH2)} genes are unplaced. `),
          'No rank at all. They are excluded from the pool and from these counts rather than '
          + 'defaulted in either direction.'),
        el('li', {}, el('strong', {}, 'A young stratum is not proof of a young gene. '),
          'Phylostratigraphy under-detects fast-evolving homologs, so PS ≥ 18 is a candidate '
          + 'pool, not a verdict — which is why the synteny module’s independent orthology '
          + 'call sits beside it on every gene page.'),
        el('li', {}, el('strong', {}, 'PS19 is annotation-artifact-enriched. '),
          'The hybrid-only stratum is where mis-annotation accumulates; the chapter reports the '
          + 'PS18/PS19 split for that reason rather than pooling them silently.'))),
  );
}

export default {
  id: 'phylostrat',
  label: 'Phylostrat',
  geneCard,
  overview,
  filters: [
    { id: 'ps_lsg', label: 'LSG pool (PS ≥ 18)', options: ['yes', 'no'],
      test: (g, v) => (g.ps && g.ps.rank >= LSG_MIN ? 'yes' : 'no') === v },
    { id: 'ps_rank', label: 'Phylostratum ≥',
      test: (g, v) => g.ps && g.ps.rank != null && g.ps.rank >= parseInt(v, 10) },
  ],
};
