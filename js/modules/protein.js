// Module: protein — predicted disorder, ESMFold secondary structure, and mass-spec evidence
// that the predicted protein is actually translated.
//
// Two caveats are load-bearing here and are stated on every gene page rather than buried:
//   * coil fraction tracks pLDDT. A high-coil, low-pLDDT model is largely a statement about
//     model confidence, not about the protein being disordered. Reading coil as "unstructured"
//     is the single easiest mistake to make with this table.
//   * ESMFold covers 40,685 of 63,960 genes (64%). Absence is coverage, not a finding.
import { el, fmt, pct } from '../core/dom.js';

// The five re-searched datasets, and the species whose sample the spectra came from. Three
// of them are other Populus species, whose samples contain no 717 protein at all -- a hit
// there says the gene FAMILY is translated somewhere in Populus, not that 717's copy is.
const MS_DATASETS = {
  PXD025636: 'P. trichocarpa',
  PXD020099: 'P. tremula x tremuloides',
  PXD025418: 'P. tomentosa, xylem',
  PXD002544: 'P. x canescens',
  PXD058986: 'P. x canescens',
};

function bar(frac, color) {
  return el('div', { class: 'bartrack', style: 'height:9px' },
    el('div', { class: 'barfill', style: `width:${Math.max(frac * 100, 0)}%;background:${color}` }));
}

function geneCard(g) {
  const p = g.prot;
  if (!p) return null;
  const kv = el('dl', { class: 'kv' });
  const add = (k, ...v) => { kv.append(el('dt', {}, k), el('dd', {}, ...v)); };

  if (p.dis != null) {
    add('Predicted disorder',
      el('span', {}, el('span', { class: 'mono' }, p.dis.toFixed(3)), ' mean · ',
        el('span', { class: 'mono' }, (p.disf * 100).toFixed(0) + '%'), ' of residues disordered'));
  }

  const ss = p.ss;
  if (ss) {
    const rows = [['helix', ss.h, 'var(--c-core)'], ['strand', ss.e, 'var(--c-nonsyn)'],
                  ['coil', ss.c, 'var(--c-priv)']].filter(([, v]) => v != null);
    add('Secondary structure',
      el('div', { class: 'barchart', style: 'margin-top:2px' }, ...rows.map(([name, v, c]) =>
        el('div', { class: 'barrow', style: 'grid-template-columns:56px 1fr 44px' },
          el('span', { class: 'lbl' }, name), bar(v, c),
          el('span', { class: 'val' }, (v * 100).toFixed(0) + '%')))));
    if (ss.plddt != null) {
      add('Model confidence',
        el('span', {}, el('span', { class: 'mono' }, ss.plddt.toFixed(1)), ' mean pLDDT',
          ss.low != null ? el('span', { class: 'muted' }, ` · ${(ss.low * 100).toFixed(0)}% of residues below 70`) : null),
        ss.n ? el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' }, `${fmt(ss.n)} residues modelled`) : null);
    }
  }

  const ms = p.ms;
  if (ms) {
    const names = Object.keys(MS_DATASETS);
    const hit = new Set(ms.ds || []);
    const undetectable = ms.abl === 0;
    add('Peptide evidence',
      el('div', {},
        el('div', { style: 'margin-bottom:5px' },
          ms.n
            ? el('strong', {}, `detected in ${ms.n} of ${ms.of} datasets`)
            : (undetectable
                ? el('span', {}, el('span', { class: 'badge' }, 'undetectable'),
                    ' this protein has no fully-tryptic peptide in the searchable mass range, '
                    + 'so it could not have been found however abundant it is')
                : el('span', { class: 'muted' }, `not detected in any of ${ms.of} datasets`))),
        el('table', { class: 'data' },
          el('tbody', {}, ...names.map((k) => el('tr', {},
            el('td', { class: 'mono', style: 'font-size:11.5px' }, k),
            el('td', { class: 'muted', style: 'font-size:11.5px' }, MS_DATASETS[k]),
            el('td', {}, hit.has(k)
              ? el('span', { class: 'badge' }, el('i', { class: 'dot', style: 'background:var(--c-nonsyn)' }), 'detected')
              : el('span', { class: 'muted' }, 'not detected')))))),
        ms.n
          ? el('div', { class: 'muted', style: 'font-size:12px;margin-top:5px' },
              `${fmt(ms.pep)} distinct peptide${ms.pep === 1 ? '' : 's'}, `
              + `${fmt(ms.psm)} spectrum match${ms.psm === 1 ? '' : 'es'}`
              + (ms.hs != null ? `, best hyperscore ${ms.hs.toFixed(1)}` : '')
              + (ms.sp ? '. At least one peptide maps only to 717 proteins.'
                       : '. No peptide here is unique to 717 — each also matches a P. trichocarpa protein.'))
          : null,
        (ms.n === 1 && ms.psm === 1)
          ? el('div', { class: 'muted', style: 'font-size:12px;margin-top:3px' },
              'One spectrum, in one dataset. At a 1% false-discovery rate applied across five '
              + 'searches, singletons like this are expected to occur by chance and should not '
              + 'be cited on their own.')
          : null,
        ms.tw != null
          ? el('div', { class: 'muted', style: 'font-size:12px;margin-top:3px' },
              `${fmt(ms.tw)} tryptic peptide${ms.tw === 1 ? '' : 's'} fall in the searchable `
              + `range, ${fmt(ms.uq)} of them unique to this gene.`)
          : null));
  }

  const card = el('div', { class: 'card' },
    el('h2', {}, 'Protein', el('span', { class: 'tag' }, 'predicted')), kv);

  if (ss) {
    card.append(el('div', { class: 'warn' },
      el('strong', {}, 'Coil fraction tracks model confidence. '),
      'Across all 40,685 modelled genes, coil fraction correlates with mean pLDDT at r = −0.49, '
      + 'against only +0.16 for helix. A high-coil, low-pLDDT model says the structure was hard '
      + 'to predict, not that the protein is unstructured. Read coil alongside the pLDDT above, '
      + 'never alone — the disorder prediction is the separate, dedicated signal.'));
  } else if (p.dis != null || ms) {
    card.append(el('p', { class: 'muted', style: 'margin:10px 0 0;font-size:12px' },
      'No ESMFold model for this gene. Structure covers 40,685 of 63,960 genes (64%) — '
      + 'absence here is coverage, not a structural claim.'));
  }
  if (ms) {
    card.append(el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:12px' },
      'Five public datasets of raw spectra, re-searched against a database that contains the '
      + '717 proteins, at a 1% false-discovery rate on both peptides and spectra. That is what '
      + 'makes a blank row here mean something: an earlier version of this page matched peptide '
      + 'names against tables built from another species, where a 717-specific peptide could '
      + 'never have appeared and "not detected" carried no information. Each dataset is kept '
      + 'separate — their depths differ by sixteenfold — and the 1% error rate accumulates '
      + 'across the five, so a single match in a single dataset is weak on its own.'));
  }
  return card;
}

async function overview(man) {
  const L = man.layers || {};
  const c = L.coverage || {};
  return el('div', {},
    el('h1', {}, 'Protein'),
    el('p', { class: 'sub' },
      'What the predicted protein looks like, and whether anyone has actually observed it: '
      + 'disorder prediction, ESMFold secondary structure, and mass-spec peptide evidence.'),
    el('div', { class: 'stat-row' },
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(c['predicted disorder'])), el('div', { class: 'l' }, 'genes with disorder prediction')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(c['ESMFold structure'])), el('div', { class: 'l' }, 'with an ESMFold model (64%)')),
      el('div', { class: 'stat' }, el('div', { class: 'n' },
        fmt(((man.proteomics || {}).genes_with_a_hit || {}).hap1
            + ((man.proteomics || {}).genes_with_a_hit || {}).hap2)),
        el('div', { class: 'l' }, 'observed as protein')),
    ),
    el('div', { class: 'card' },
      el('h2', {}, 'How to read this'),
      el('ul', { style: 'margin:0;padding-left:18px;font-size:13.5px;color:var(--ink-2);line-height:1.6' },
        el('li', {}, el('strong', {}, 'Coil fraction is largely a pLDDT proxy. '),
          'Measured on this table: r = −0.49 between coil fraction and mean pLDDT across all '
          + '40,685 modelled genes, against +0.16 for helix. High coil with low pLDDT means the '
          + 'model was uncertain, not that the protein is disordered.'),
        el('li', {}, el('strong', {}, 'Aggregate helix is safe; helix RUN LENGTH is not. '),
          'The source analysis states that long-run helix content is exactly what the '
          + 'low-confidence artifact inflates and should not be read as biology. This atlas '
          + 'therefore serves helix_frac only, never max_helix_run.'),
        el('li', {}, el('strong', {}, 'These are predicted structures. '),
          'No claim here is independent of ESMFold.'),
        el('li', {}, el('strong', {}, 'ESMFold coverage is 64%. '),
          'A gene without a model is not a gene without a structure.'),
        el('li', {}, el('strong', {}, 'Peptide detection is asymmetric evidence. '),
          'Detection is strong evidence a predicted protein is real and translated — which '
          + 'matters most for young, lineage-specific genes whose existence rests on gene '
          + 'prediction. Non-detection is weak: it also reflects tissue, abundance, and '
          + 'whether the protein yields observable tryptic peptides at all.'),
        el('li', {}, el('strong', {}, 'The five datasets are never pooled. '),
          'Their depths differ by sixteenfold — 3,248 to 52,056 peptides — so pooling would '
          + 'let the deepest dataset silently define the answer. The 1% false-discovery rate '
          + 'also accumulates across five searches, so a single match in a single dataset is '
          + 'expected to happen by chance somewhere in the genome.'),
        el('li', {}, el('strong', {}, 'Absence has a denominator, and it is on the page. '),
          'A protein with no fully-tryptic peptide in the searchable mass range cannot be '
          + 'found however abundant it is, and that is a property of its lysine and arginine '
          + 'content and its length — composition, on which young genes differ from old ones. '
          + `Counting such a gene as "not detected" would inflate the negative. `
          + `${fmt((man.proteomics || {}).undetectable_by_construction
                    ? (man.proteomics.undetectable_by_construction.hap1
                       + man.proteomics.undetectable_by_construction.hap2) : 0)} `
          + 'genes are undetectable this way and say so on their own page.'),
        el('li', {}, el('strong', {}, 'Detection falls monotonically with gene age. '),
          '42.3% of the most ancient genes are observed, 12.8% of conserved ones, 6.1% of '
          + 'rosid-level, 2.9% of Salicaceae-level, and 0.12% of the lineage-specific pool. '
          + 'That ordering is what you would expect if the measurement tracks real protein '
          + 'abundance and conservation rather than noise, which is the reason to trust the '
          + 'low end of it.'),
        el('li', {}, el('strong', {}, 'Three of the five samples contain no 717 protein. '),
          'PXD025418 is P. tomentosa and PXD002544 and PXD058986 are P. x canescens. A '
          + 'peptide matching a 717 gene in those says the gene family is translated somewhere '
          + 'in Populus, not that this clone translates its own copy.'))),
  );
}

export default {
  id: 'protein',
  label: 'Protein',
  geneCard,
  overview,
  filters: [
    { id: 'ms_detected', label: 'Peptide-detected', options: ['yes', 'no'],
      test: (g, v) => {
        const ms = g.prot && g.prot.ms;
        return ((ms && ms.n > 0) ? 'yes' : 'no') === v;
      } },
    { id: 'has_struct', label: 'Has ESMFold model', options: ['yes', 'no'],
      test: (g, v) => (g.prot && g.prot.ss ? 'yes' : 'no') === v },
  ],
};
