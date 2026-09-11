// Module: protein — predicted disorder, ESMFold secondary structure, and mass-spec evidence
// that the predicted protein is actually translated.
//
// Two caveats are load-bearing here and are stated on every gene page rather than buried:
//   * coil fraction tracks pLDDT. A high-coil, low-pLDDT model is largely a statement about
//     model confidence, not about the protein being disordered. Reading coil as "unstructured"
//     is the single easiest mistake to make with this table.
//   * ESMFold covers 40,685 of 63,960 genes (64%). Absence is coverage, not a finding.
import { el, fmt, pct } from '../core/dom.js';
import { loadStructure } from '../core/data.js';
import { PLDDT_BANDS, plddtBand } from '../core/palette.js';

// ---- 3D model (TODO 34) ----
// A Calpha trace, not the full-atom model: the genome's full-atom models are 2.3 GB gzipped,
// over what a static Pages site may host. 3Dmol.js is vendored and fetched only when a reader
// asks for a model, so no gene page pays ~540 KB for a viewer it does not open.
let viewerLib = null;
function load3Dmol() {
  if (window.$3Dmol) return Promise.resolve(window.$3Dmol);
  if (!viewerLib) {
    viewerLib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/3dmol/3Dmol-min.js';
      s.onload = () => (window.$3Dmol ? resolve(window.$3Dmol)
        : reject(new Error('3Dmol.js loaded but did not register')));
      s.onerror = () => { viewerLib = null; reject(new Error('could not load 3Dmol.js')); };
      document.head.append(s);
    });
  }
  return viewerLib;
}

const AA3 = {
  A: 'ALA', R: 'ARG', N: 'ASN', D: 'ASP', C: 'CYS', Q: 'GLN', E: 'GLU', G: 'GLY', H: 'HIS',
  I: 'ILE', L: 'LEU', K: 'LYS', M: 'MET', F: 'PHE', P: 'PRO', S: 'SER', T: 'THR', W: 'TRP',
  Y: 'TYR', V: 'VAL', X: 'UNK',
};
const SS_NAME = { H: 'helix', E: 'strand', '-': 'coil' };
const rj = (v, w) => String(v).padStart(w);

/** A Calpha-only PDB with pLDDT as the B-factor. No HELIX / SHEET records: 3Dmol's default
 *  cartoon draws NOTHING for a Calpha-only model (found by screenshot, 2026-09-10, after a
 *  check that only asserted a canvas existed had passed), and the 'trace' style that does
 *  draw it ignores secondary structure. The DSSP state is in the hover readout instead. */
function caPdb(m) {
  const out = [];
  for (let i = 0; i < m.n; i++) {
    const f = (v) => rj(v.toFixed(3), 8);
    out.push(`ATOM  ${rj(i + 1, 5)}  CA  ${AA3[m.seq[i]] || 'UNK'} A${rj(i + 1, 4)}    `
      + `${f(m.ca[3 * i])}${f(m.ca[3 * i + 1])}${f(m.ca[3 * i + 2])}`
      + `  1.00${rj(m.pl[i].toFixed(2), 6)}           C`);
  }
  out.push('END');
  return out.join('\n');
}

let liveViewer = null;   // one WebGL context at a time; browsers cap how many a page may hold

function bandCounts(m) {
  const c = PLDDT_BANDS.map(() => 0);
  for (let i = 0; i < m.n; i++) c[plddtBand(m.pl[i])]++;
  return c;
}

async function openModel(geneId, holder) {
  const [lib, m] = await Promise.all([load3Dmol(), loadStructure(geneId)]);
  if (!m) {
    holder.append(el('p', { class: 'muted' }, 'No 3D model is stored for this gene.'));
    return;
  }
  const counts = bandCounts(m);
  const readoutDefault = 'Drag to rotate, scroll or pinch to zoom. Hover a residue for its confidence and DSSP state.';
  const readout = el('div', { class: 'mono struct-readout' }, readoutDefault);
  const stage = el('div', { class: 'struct-stage', role: 'img',
    'aria-label': `C-alpha trace of the ESMFold model, ${m.n} residues, coloured by pLDDT` });
  holder.append(
    stage, readout,
    el('div', { class: 'struct-legend' }, ...PLDDT_BANDS.map((b, k) => el('span', { class: 'struct-key' },
      el('i', { class: 'dot', style: `background:${b.color}` }),
      `${b.label} (${b.range}) `,
      el('span', { class: 'mono' }, `${fmt(counts[k])} · ${((100 * counts[k]) / m.n).toFixed(0)}%`)))),
    el('p', { class: 'muted', style: 'margin:6px 0 0;font-size:12px' },
      `${fmt(m.n)} residues. One point per residue (the C-alpha atom), joined in chain order and `
      + "coloured by the model's own per-residue confidence, pLDDT. Side chains and helix or strand "
      + 'shapes are not drawn; hover a residue for its DSSP state, which is what the bars above '
      + 'count. Where the trace is yellow or orange the model is guessing, and the path of the '
      + 'chain there is not a prediction of shape.'));

  if (liveViewer) { try { liveViewer.clear(); } catch (_) { /* already gone */ } }
  const v = lib.createViewer(stage, { backgroundColor: 'white', backgroundAlpha: 0, antialias: true });
  liveViewer = v;
  stage.__viewer = v;   // read by scripts/check.mjs, which asserts pixels were actually drawn
  v.addModel(caPdb(m), 'pdb');
  v.setStyle({}, { cartoon: { style: 'trace', thickness: 0.5,
    colorfunc: (a) => PLDDT_BANDS[plddtBand(a.b)].color } });
  v.setHoverable({}, true,
    (a) => { readout.textContent = `${a.resn} ${a.resi} · pLDDT ${a.b.toFixed(1)} · ${SS_NAME[m.ss[a.resi - 1]]}`; },
    () => { readout.textContent = readoutDefault; });
  v.zoomTo();
  v.render();
}

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
    const holder = el('div', { class: 'struct-holder' });
    const btn = el('button', {
      type: 'button', class: 'struct-open',
      onclick: async (e) => {
        e.target.disabled = true; e.target.textContent = 'Loading model…';
        try {
          await openModel(g.id, holder);
          e.target.remove();
        } catch (err) {
          e.target.disabled = false; e.target.textContent = 'Show 3D model';
          holder.append(el('p', { class: 'muted' }, `Could not load the model: ${err.message}`));
        }
      },
    }, 'Show 3D model');
    card.append(btn, holder);
  }

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
        el('li', {}, el('strong', {}, 'The 3D model is a C-alpha trace, coloured by pLDDT. '),
          'One point per residue, no side chains, because the full-atom models for the genome '
          + 'are too large for this static site. Yellow and orange mean the model is guessing, '
          + 'and most of a lineage-specific gene\'s model is yellow and orange.'),
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
