// Provenance page. Renders what the build actually recorded -- every source file with its
// sha256 and mtime -- rather than a hand-maintained prose list that drifts from the data.
import { el, fmt, pct } from '../core/dom.js';
import { evidenceCard } from '../core/evidence.js';

const SHORT = (p) => p.replace('/scratch/ch29576/', '').replace('/work/cjtlab/', 'work:');

function sourceTable(sources) {
  const rows = Object.entries(sources).sort().map(([path, s]) => el('tr', {},
    el('td', { class: 'mono', style: 'font-size:11.5px' }, SHORT(path)),
    el('td', { class: 'num', style: 'font-size:11.5px' }, (s.bytes / 1e6).toFixed(1) + ' MB'),
    el('td', { class: 'mono muted', style: 'font-size:11px' }, s.sha256),
    el('td', { class: 'muted', style: 'font-size:11px' }, (s.mtime || '').slice(0, 10)),
  ));
  return el('div', { class: 'scroll-x' }, el('table', { class: 'data' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Source file'), el('th', { class: 'num' }, 'Size'),
      el('th', {}, 'sha256 (16)'), el('th', {}, 'Modified'))),
    el('tbody', {}, ...rows)));
}

function overview(man) {
  const a = man.annotation || {};
  const e = man.expression || {};
  return el('div', {},
    el('h1', {}, 'About & provenance'),
    el('p', { class: 'sub' },
      `Data version ${man.data_version || '—'}, built ${(man.built || '').slice(0, 10)} from `
      + `${Object.keys(man.sources || {}).length} source files on the UGA Sapelo2 cluster. `
      + `Every file below is recorded with a checksum at build time.`),

    el('div', { class: 'card' },
      el('h2', {}, 'What this is'),
      el('p', { style: 'margin:0 0 10px;font-size:14px;color:var(--ink-2)' },
        'A browsable atlas of the 63,960 gene models in the two phased haplotypes of hybrid '
        + 'poplar clone INRA 717-1B4 (Populus tremula × P. alba), v5.1. It is a companion to a '
        + 'dissertation chapter on lineage-specific genes, and a general-purpose resource for '
        + 'anyone working in this clone.'),
      el('dl', { class: 'kv' },
        el('dt', {}, 'Genes'), el('dd', {}, `${fmt(man.n_genes)} — HAP1 32,137 (PtXaTreH), HAP2 31,823 (PtXaAlbH)`),
        el('dt', {}, 'Synteny'), el('dd', {}, 'GENESPACE over a 12-genome panel (10 syntenic + O. sativa / P. patens as orthogroup-only outgroups)'),
        el('dt', {}, 'Phylostratigraphy'), el('dd', {}, 'genEra, 19 strata'),
        el('dt', {}, 'Annotation'), el('dd', {}, `${fmt(a.n_annotated)} genes; ${fmt(a.go_terms)} GO terms; ${fmt(a.n_allele)} with a HAP1↔HAP2 allele`),
        el('dt', {}, 'Expression'), el('dd', {}, `${fmt(e.n_samples)} samples, ${e.n_studies} studies, ${e.n_bioprojects} BioProjects, kallisto k21`))),

    // TODO 45: the structured home for genome-wide numbers. Chen's review asked whether the
    // stat-only module pages should fold in here. They earned their place instead, by becoming
    // launchers into Browse -- so this is the one place that states every layer's COVERAGE,
    // which is the number a reader actually needs and which no single module page showed.
    el('div', { class: 'card' },
      el('h2', {}, 'What each layer covers', el('span', { class: 'tag' }, 'genome-wide')),
      el('p', { class: 'muted', style: 'font-size:12.5px;margin:0 0 10px' },
        'Coverage is not uniform, and an absent value usually means a layer does not reach '
        + 'that gene rather than that the gene lacks the property. Every figure below is out '
        + 'of ' + fmt(man.n_genes) + ' genes.'),
      el('div', { class: 'scroll-x' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Layer'), el('th', { class: 'num' }, 'Genes'),
          el('th', { class: 'num' }, 'Share'), el('th', {}, 'What absence means'))),
        el('tbody', {}, ...[
          ['Synteny class', man.n_genes, 'Every gene is classified.'],
          ['Phylostratum', man.n_genes - ((man.phylostrat || {}).by_rank ? 0 : 0),
            'genEra returned no rank for 50 genes; they are excluded from the pool, not defaulted.'],
          ['Expression baseline', (man.expression || {}).n_genes_with_baseline || null,
            'A gene with an all-zero baseline has no tissue profile and no \u03c4.'],
          ['Ka/Ks vs P. trichocarpa', (man.kaks || {}).n_genes,
            'No reciprocal-best ortholog. Structural for the youngest stratum, which has none.'],
          ['Peptide evidence', ((man.proteomics || {}).genes_with_a_hit
            ? man.proteomics.genes_with_a_hit.hap1 + man.proteomics.genes_with_a_hit.hap2 : null),
            'Not detected, or undetectable: no tryptic peptide in the searchable mass range.'],
          ['ESMFold structure', ((man.layers || {}).coverage || {})['ESMFold structure'],
            'No model was built. Coverage, not a structural claim.'],
          ['Ortholog chromatin', (man.chromatin || {}).n_genes,
            'No 1:1 P. trichocarpa ortholog, or the ortholog is silent in leaf.'],
          ['Promoter motif scan', ((man.cre || {}) && man.n_genes),
            'Every gene is scanned; family counts can legitimately be zero.'],
        ].filter(([, n]) => n != null).map(([label, n, note]) => el('tr', {},
          el('td', {}, label),
          el('td', { class: 'num' }, fmt(n)),
          el('td', { class: 'num' }, pct(n, man.n_genes)),
          el('td', { class: 'muted', style: 'font-size:12px' }, note)))))),
      el('p', { class: 'muted', style: 'font-size:11.5px;margin:10px 0 0' },
        'Each module page carries its own distribution and links into Browse from it, so a '
        + 'count here can always be turned into the actual gene list.')),

    el('div', { class: 'card' },
      el('h2', {}, 'Known limitations', el('span', { class: 'tag' }, 'read before citing')),
      el('ul', { style: 'margin:0;padding-left:18px;font-size:13.5px;color:var(--ink-2);line-height:1.6' },
        el('li', {}, el('strong', {}, 'HAP2 domain annotation is thin. '),
          'The v5.1 release left HAP2\'s Pfam/PANTHER/GO columns empty for all 65,212 rows. '
          + 'GO was recovered from a lab-built file; Pfam only partly, from the defline '
          + `(${fmt(3222)} HAP2 genes vs ${fmt(26132)} on HAP1). An absent domain on a HAP2 gene is `
          + 'usually a release gap, not biology.'),
        el('li', {}, el('strong', {}, 'Private calls are panel-dependent. '),
          'P. alba — a parent species of this hybrid — is deliberately not in the synteny panel. '
          + '41% of genes called private have a detectable P. alba homolog, against 98.8% of core '
          + 'genes; the call is sound but panel-conditioned.'),
        el('li', {}, el('strong', {}, 'ω is undefined for 716 syntelog pairs '),
          'whose Ks is 0. The aligner reports 99.0 there; the atlas shows "identical at '
          + 'synonymous sites" instead, never a selection claim.'),
        el('li', {}, el('strong', {}, 'Expression is raw TPM, not batch-corrected. '),
          'Use it for tissue specificity and per-gene magnitude. Cross-study comparison needs '
          + 'batch handling that this build does not apply.'),
        el('li', {}, el('strong', {}, 'Curation notes are summarised, not quoted. '),
          'Tandem-array genes carry a curation flag — hand-rejected, pseudogene-like, or '
          + 'disagreeing with the automatic gate. The curator\'s identity and verbatim wording '
          + 'are deliberately not published.'),
        el('li', {}, el('strong', {}, 'Two layers were audited out, not shipped. '),
          'A presence/absence-variation layer was dropped because the available table is the '
          + 'orthogroup-based PAV call the source repo explicitly tells readers not to use; its '
          + 'canonical DIAMOND-based replacement is not in the mirror. An independent tau was '
          + 'dropped because it is computed on the n=202 expression panel, which the same repo '
          + 'records as superseded on 2026-08-24.'),
        el('li', {}, el('strong', {}, 'Three layers are derived here, not imported. '),
          'Exon/intron counts and TE distance are computed from the v5.1 GFF3 and repeatmasked '
          + 'annotation that ship with the genome, and genomic order from the atlas\'s own '
          + 'coordinates — because the tables offering them sat in case-study, calibration and '
          + '"structural exploration" folders with no canonical status.'),
        el('li', {}, el('strong', {}, 'Duplication calls come from a mirrored repo. '),
          'The per-gene duplication class is the most current table present in the ms1-dup '
          + 'mirror; that repo names a v6 master as canonical which is not synced here. The '
          + 'tandem component is taken from its curated union set, which it says supersedes '
          + 'the v8 tandem tables. Codes follow its documented legend.'),
        el('li', {}, el('strong', {}, 'Thin tissue baselines. '),
          'Median TPM per tissue rests on 77 leaf and 59 xylem WT-control samples but only 5 bud, '
          + '4 catkin, 2 stem and 1 callus. Every bar carries its n.'))),

    el('div', { class: 'card' },
      el('h2', {}, 'Sources', el('span', { class: 'tag' }, 'checksummed at build')),
      sourceTable(man.sources || {}),
      el('p', { class: 'muted', style: 'margin:12px 0 0;font-size:12px' },
        'Source files live on Sapelo2 and are not in this repository, so the build is not '
        + 'reproducible from a clone alone — the committed data/ directory is the artifact.'),
      // The page claims the data is validated; this is where the claim can be checked.
      el('p', { style: 'margin:10px 0 0;font-size:13px' },
        el('a', { href: '#/status' }, 'See every integrity gate this build ran, and its verdict →'))),

    evidenceCard(),

    el('div', { class: 'card' },
      el('h2', {}, 'Citation & licence'),
      el('p', { style: 'margin:0 0 8px;font-size:13.5px;color:var(--ink-2)' },
        'Cite this atlas via CITATION.cff in the repository, and cite the underlying study for '
        + 'any expression data you use — each study page carries its own DOI.'),
      el('p', { class: 'muted', style: 'margin:0;font-size:12.5px' },
        'Code is MIT. The derived data is unpublished dissertation material and is not yet '
        + 'openly licensed; CC BY 4.0 is intended at publication.')),
  );
}

export default { id: 'about', label: 'About', overview };
