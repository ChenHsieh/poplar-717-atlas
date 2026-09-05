// Module: protein — predicted disorder, ESMFold secondary structure, and mass-spec evidence
// that the predicted protein is actually translated.
//
// Two caveats are load-bearing here and are stated on every gene page rather than buried:
//   * coil fraction tracks pLDDT. A high-coil, low-pLDDT model is largely a statement about
//     model confidence, not about the protein being disordered. Reading coil as "unstructured"
//     is the single easiest mistake to make with this table.
//   * ESMFold covers 40,685 of 63,960 genes (64%). Absence is coverage, not a finding.
import { el, fmt, pct } from '../core/dom.js';

const PXD_LABEL = {
  '023826': 'PXD023826', '025636': 'PXD025636', '064017': 'PXD064017',
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
    const keys = Object.keys(ms).sort();
    const det = keys.filter((k) => ms[k][1]).length;
    add('Peptide evidence',
      el('div', {},
        el('div', { style: 'margin-bottom:5px' },
          det ? el('strong', {}, `detected in ${det} of ${keys.length} datasets`)
              : el('span', { class: 'muted' }, `not detected in any of ${keys.length} datasets`)),
        el('table', { class: 'data' },
          el('tbody', {}, ...keys.map((k) => el('tr', {},
            el('td', { class: 'mono', style: 'font-size:11.5px' }, PXD_LABEL[k] || k),
            el('td', {}, ms[k][1]
              ? el('span', { class: 'badge' }, el('i', { class: 'dot', style: 'background:var(--c-nonsyn)' }), 'detected')
              : el('span', { class: 'muted' }, 'not detected')),
            el('td', { class: 'num muted', style: 'font-size:11.5px' },
              ms[k][0] == null ? '—' : `${ms[k][0]} tryptic peptides possible`)))))));
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
      'Three independent mass-spec datasets, kept separate: their genome-wide detection rates '
      + 'differ about fourfold, so absence from one dataset is weak evidence on its own.'));
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
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(c['proteomics PXD064017'])), el('div', { class: 'l' }, 'screened for peptides')),
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
        el('li', {}, el('strong', {}, 'The three datasets are never pooled. '),
          'Their detection rates differ roughly fourfold, so pooling would let the deepest '
          + 'dataset silently define the answer.'))),
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
        const any = ms && Object.values(ms).some((x) => x[1]);
        return (any ? 'yes' : 'no') === v;
      } },
    { id: 'has_struct', label: 'Has ESMFold model', options: ['yes', 'no'],
      test: (g, v) => (g.prot && g.prot.ss ? 'yes' : 'no') === v },
  ],
};
