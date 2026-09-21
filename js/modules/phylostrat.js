// Module: phylostratigraphy (genEra). The gene's evolutionary age, its gene family's origin,
// and the caveats the method itself reports.
import { el, fmt, pct } from '../core/dom.js';
import { browseHref } from '../core/browse.js';

const LSG_MIN = 18;

const ABSENSE_VERDICT = {'a_retract_young_call': 'abSENSE retracts the young call', 'b_supports_lineage_specific': 'abSENSE supports lineage-specific', 'b_weak_low_sensitivity': 'abSENSE supports it, weakly (low sensitivity)', 'ancestral_sequence_present_unannotated': 'an ancestral sequence appears present but unannotated', 'ambiguous': 'abSENSE result is ambiguous', 'not_testable': 'not testable with abSENSE'};

// `clean` is the QC funnel's survivor call, and it is the AND of exactly three checks: no
// tblastn retraction, no abSENSE rejection, no WGD-era Ks. It says nothing about the synteny
// contest, the short-ORF class or DIAMOND-sensitivity stability, so those are listed on every
// gene that carries them, clean or not. Until 2026-09-21 a clean gene read "No evidence-quality
// flag raised" and hid them: 389 pool genes (177 HAP1, 212 HAP2), 21 of them synteny-contested.
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
  const other = [];
  if (qc.syn_any) {
    other.push(el('div', {},
      'A 12-genome OrthoFinder rerun disputes this gene\'s orthogroup slot.'));
  }
  if (qc.short) {
    other.push(el('div', {}, `Short ORF (${qc.plen} aa) — a known annotation-artifact class.`));
  }
  // `stable` is the source's sens_stable column: whether this gene's synteny call is the same
  // in the default and the --ultra-sensitive DIAMOND runs of the 12-genome GENESPACE rerun
  // (ms2-lsg analyses/repro_audit_20260917, section E3). The synteny card describes the same
  // field. Until 2026-09-21 this line said the chapter's headline result depended on the gene,
  // which the column never measured.
  if (qc.stable === false) {
    other.push(el('div', {}, el('span', { class: 'badge' }, 'sensitivity'),
      ' the synteny call differs between the default and --ultra-sensitive DIAMOND runs.'));
  }
  return el('div', {},
    qc.clean
      // clean means ret and wgd are both false, so flags holds only the abSENSE line here --
      // kept, because its calibration note matters most on exactly the calls it supports.
      ? el('div', {},
          el('div', { class: 'muted' }, 'Passes the QC funnel’s three checks: no tblastn '
            + 'retraction, no abSENSE rejection, no WGD-era Ks.'),
          ...flags)
      : el('div', {}, ...flags),
    other.length ? el('div', { style: 'margin-top:4px' }, ...other) : null,
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
        // Named "the frozen genEra call", not "withdrawn": the chapter text still reports that
        // pool (Chen, 2026-09-20), so its numbers are correct statements about it. Not called a
        // "12-species panel" call either: a 2026-09-21 consistency audit (MS2 A38) found the
        // frozen run searched nr only, and Chen has not yet named it. Neutral until he does.
        el('div', {}, `The frozen genEra call placed this gene at PS${p.frz.rank}`,
          p.frz.name ? ` (${p.frz.name})` : '', '. On the Idesia-corrected panel it is ',
          el('strong', {}, `PS${p.rank}`), p.name ? ` (${p.name})` : '', '.'),
        // A pool exit left by a RANK change. Upstream QC values exist for it (the funnel ran on
        // the frozen pool), but they are not why it left, and this atlas ships QC flags for the
        // corrected pool only -- so say that, rather than implying it was never checked.
        left
          ? el('div', { style: 'margin-top:3px' },
              el('span', { class: 'badge' }, 'left the pool'),
              ' this gene was a lineage-specific candidate in the frozen call and is not one on '
              + 'the corrected panel. It left by a rank change, not by failing a QC check; this '
              + 'atlas shows QC flags only for genes in the corrected pool.')
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

// One ladder per haplotype, on a SHARED log scale so the two can be read against each other.
// They used to be summed into one "both haplotypes" ladder; the lab rule is that HAP1 and HAP2
// are reported separately, and the pool is 776 vs 835, not one number.
function ladderChart(rows, hap, max) {
  // Counts span three orders of magnitude (cellular organisms down to fabids). A linear axis
  // would render most strata as invisible slivers, so the bar length is log-scaled and the
  // true count is printed beside every bar.
  const lg = (n) => (n <= 0 ? 0 : Math.log10(n) / Math.log10(max));
  const ns = rows.map((r) => r.n);
  return el('div', {},
    el('div', { class: 'barchart' }, ...rows.slice().reverse().map((r) => {
      const lsg = r.rank >= LSG_MIN;
      return el('div', { class: 'barrow', style: 'grid-template-columns:150px 1fr 60px' },
        // the bar was a dead end; it is now the way into Browse for that stratum
        el('a', { class: 'lbl', href: browseHref({ hap: hap.toLowerCase(), ps: r.rank }),
                  title: `Browse the ${fmt(r.n)} ${hap} genes in PS${r.rank}` },
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
      `Bar length is log-scaled, on the same scale for both haplotypes: ${hap} counts run from `
      + `${fmt(Math.max(...ns))} to ${fmt(Math.min(...ns))}, and a linear axis would hide most `
      + 'strata. The number beside each bar is the true count. Amber marks the LSG pool '
      + '(PS ≥ 18). Click a stratum to browse its genes.'));
}

async function overview(man) {
  const ps = man.phylostrat;
  if (!ps) return el('div', { class: 'empty' }, 'Phylostratigraphy data not built.');
  const h1 = ps.ladder.hap1, h2 = ps.ladder.hap2;
  const sum = (rows, f) => rows.filter(f).reduce((a, r) => a + r.n, 0);
  const at = (rows, k) => sum(rows, (r) => r.rank === k);
  const placed = { HAP1: sum(h1, () => true), HAP2: sum(h2, () => true) };
  const pool = { HAP1: sum(h1, (r) => r.rank >= LSG_MIN), HAP2: sum(h2, (r) => r.rank >= LSG_MIN) };
  const max = Math.max(...h1.map((r) => r.n), ...h2.map((r) => r.n));
  const naH1 = (ps.by_rank.hap1 || {}).NA || 0;
  const naH2 = (ps.by_rank.hap2 || {}).NA || 0;
  // The frozen pool is what the chapter text reports (Chen, 2026-09-20: 842/883 in the text,
  // named as frozen, with 776/835 alongside as the robustness check). ms2-lsg
  // docs/CORRECTIONS.md C2 made the corrected pool canonical, so it leads here; the frozen one
  // is named rather than hidden, so a reader arriving from the chapter finds its numbers.
  // "Frozen genEra pool", not "12-species panel": see the note in geneCard.
  const frz = (man.lsg_pool || {}).withdrawn || {};
  const poolStat = (hap, rows) => el('div', { class: 'stat' },
    el('div', { class: 'n' }, fmt(pool[hap])),
    el('div', { class: 'l' }, `${hap} LSG pool: ${fmt(at(rows, 18))} PS18 · ${fmt(at(rows, 19))} PS19`));

  return el('div', {},
    el('h1', {}, 'Phylostratigraphy'),
    el('p', { class: 'sub' },
      'genEra assigns each gene to the oldest phylostratum in which a homolog is detectable, '
      + 'over 19 strata from cellular organisms to this hybrid. The chapter’s '
      + 'lineage-specific gene pool is PS ≥ 18; PS17 Saliceae is flanking context, not pool. '
      + `Counts here are on the Idesia-corrected panel: ${fmt(pool.HAP1)} HAP1 and `
      + `${fmt(pool.HAP2)} HAP2 genes. The chapter text reports the frozen genEra pool, `
      + `${fmt(frz.hap1)} HAP1 and ${fmt(frz.hap2)} HAP2, with the corrected pool beside it as a `
      + 'robustness check; every gene whose stratum differs between the two calls says so on its '
      + 'own page.'),
    el('div', { class: 'stat-row' },
      poolStat('HAP1', h1),
      poolStat('HAP2', h2),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(placed.HAP1 + placed.HAP2)),
        el('div', { class: 'l' }, `genes placed: ${fmt(placed.HAP1)} HAP1 · ${fmt(placed.HAP2)} HAP2`)),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(ps.n_ambiguous)), el('div', { class: 'l' }, 'ambiguous assignments')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(naH1 + naH2)),
        el('div', { class: 'l' }, `unplaced by genEra: ${fmt(naH1)} HAP1 · ${fmt(naH2)} HAP2`)),
    ),
    el('div', { class: 'hap-pair' },
      el('div', { class: 'card' },
        el('h2', {}, 'Genes per stratum', el('span', { class: 'tag' }, 'HAP1')),
        ladderChart(h1, 'HAP1', max)),
      el('div', { class: 'card' },
        el('h2', {}, 'Genes per stratum', el('span', { class: 'tag' }, 'HAP2')),
        ladderChart(h2, 'HAP2', max))),
    el('div', { class: 'card' },
      el('h2', {}, 'Reading this carefully'),
      el('ul', { style: 'margin:0;padding-left:18px;font-size:13.5px;color:var(--ink-2);line-height:1.6' },
        el('li', {}, el('strong', {}, `${fmt(ps.n_ambiguous)} genes carry an ambiguity flag. `),
          'genEra could not resolve them to one node and lists several candidate strata. They '
          + 'still get a rank, so the flag is the only thing separating a confident call from a '
          + 'coin flip — every affected gene page says so.'),
        el('li', {}, el('strong', {}, `${fmt(naH1)} HAP1 and ${fmt(naH2)} HAP2 genes are unplaced. `),
          'No rank at all on the corrected panel. They are excluded from the pool and from these '
          + 'counts rather than defaulted in either direction.'),
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
