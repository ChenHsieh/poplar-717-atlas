# Changelog

Data versions are stamped into `data/meta/manifest.json` as `data_version` and shown in the
site footer. A data version changes only when the *contents* of `data/` change.

## 0.3.5 — 2026-09-06

**Added — the locus card, and the data layer under it**
Every gene page now draws its neighbourhood: gene arrows with exon structure, forward strand
above the line and reverse below, coloured by duplication class, focal gene boxed. Built from
the v5.1 annotation, which lives in OneDrive rather than on Sapelo2 — so `scripts/build_locus.py`
runs off-cluster, unlike the rest of the build. Isoform choice is the annotation's own
`longest=1` flag, not a length recomputed here.

Three outputs sized for how they are fetched: per-megabase tiles (median 6.9 KB gzipped, the
locus card's only fetch), per-chromosome position indexes for the coming genome map, and a
100 kb-bin overview. Validated by merging abutting CDS/UTR segments into exons and comparing
against the exon counts the atlas derived independently on Sapelo2 from a different annotation
file: **63,960 of 63,960 agree, zero disagreements.**

**Fixed — the whole site scrolled horizontally on every phone**
Found while testing the locus card at 375 px, and it predates it: the header nav was one
unwrappable 502 px flex row, which set a 522 px minimum width for *every page on the site*.
Wrapping the nav, letting the search input flex, and giving the card grid `minmax(0, 1fr)` with
`min-width: 0` (a grid item defaults to `min-width: auto`, so the single widest card was
stretching all of them) removes it. Verified at 320, 375 and 393 px, and in landscape: no
horizontal page scroll on any route. Wide tables now scroll inside their own box, as intended.

Also fixed: the τ caption added in 0.3.4 joined tissue names with `/` and no spaces, making one
unbreakable 299 px token that overflowed a 320 px viewport. Now joined with ` / `.

**Mobile is now a designed target, not a media query**
The locus window shrinks on small screens (4 genes each side instead of 10) because genes are
tap targets and 21 of them across a 375 px phone gives 16 px each, under the WCAG 2.2 SC 2.5.8
floor — the view drops genes rather than silently clamping. Panning has always-visible 44 px
step buttons and arrow keys, since SC 2.5.1 Pointer Gestures is Level A and a gesture-only pan
would fail it. Canvas fitting follows DPR discipline: ResizeObserver on the container with the
canvas absolutely positioned inside it, `device-pixel-content-box` with the Safari try/catch
fallback, a guarded width assignment (assigning it resets all 2D context state), a synchronous
redraw, and a self-re-arming dpr watcher.

One bug the screenshots caught that the assertions did not: canvas `fillStyle` does not resolve
CSS custom properties, so `var(--c-tandem)` was silently invalid and every gene drew grey. The
palette is now read off the document and re-read when the theme changes.

**Checks**
`validate_data.py` gains four locus checks (every gene has exactly one tile entry, structure
lies inside the gene span). `check.mjs` gains two: the canvas is actually painted, the DPR
backing buffer matches, controls stay at 44 px, and a phone viewport does not scroll sideways.

## 0.3.4 — 2026-09-05

**Fixed — the expression baseline and tau pooled leaf_young + leaf_old into one "leaf" bucket**
`build_expression.py` grouped WT-control samples by the metadata's `tissue` column, which has
no finer distinction than "leaf" for 46 samples (all study 1: 23 young, 23 old). Silent, no
error, a plausible-looking mean: one manually-verified case moved from a single reported 8.12
TPM to two values 3x apart once un-pooled (leaf_young 13.74, leaf_old 4.52). The same bug
pooled the "By condition" replicate-mean drill-down and the study-1 sample table's Tissue
column, both of which grouped or displayed on the same coarse field.

Fixed by joining a new `tissue_analysis` field (`sources/sample_tissue_analysis.tsv`, derived
from MS1_2026's own curated 652-sample panel, sha256'd and dated in its sidecar) and grouping
on it everywhere the old code grouped on `tissue`: the gene-card baseline and tau, the
by-condition table, `studies.json`'s per-study tissue list, and the study-page sample table.
`TISSUE_ORDER` and the tau caption's tissue list were updated to match (9 tissues, not 8; the
caption now builds its list from the data rather than a second hand-written copy of it).

Corrected in place (no raw-source rebuild needed — the per-sample TPM vectors were never
wrong, only their aggregation): `scripts/patch_leaf_tissue_analysis.py`, verified gene-by-gene
against a hand computation before running genome-wide, patched all 63,960 gene shards'
baseline summary. `build_expression.py` is fixed at the source for the next full rebuild, with
a hard assert if any future sample lacks a `tissue_analysis` mapping — the exact failure mode
that caused this, so it is a stop, not a warning.

`validate_data.py` gained a check that every gene's baseline tissue set matches the manifest's
denominator table. `check.mjs` now asserts `leaf_young`/`leaf_old` appear on the module,
study-1, and the manually-verified gene page. Full account: `docs/DATA_AUDIT.md`.

## 0.3.3 — 2026-09-05

**Fixed — the audit removals had not actually reached the data**
The 2026-09-05 audit removed the PAV and n=202-tau layers from the build code and the UI, but
`build_layers.py` only ever ADDS keys to a shard. The values earlier runs had already written
stayed in `data/`, so the published JSON was still carrying both — invisible in the interface,
but present and downloadable. A full ordered rebuild purges them: 0 genes now carry `pav` or
`tau202`. This is exactly the failure mode `scripts/build_all.sh` now exists to prevent.

**Added**
- `scripts/build_all.sh` — all eight stages in the only order that yields a complete `data/`.
- `scripts/preflight.py` — verifies all 13 source groups before anything is written, and stops
  with an explanation on any machine that is not Sapelo2 rather than half-building.
- `docs/HANDOFF.md` — what a fresh agent on another machine cannot infer from the code.

**Verified**
- The build is deterministic: two consecutive full rebuilds produce byte-identical output for
  all 277 gene shards and every index file. Only `manifest.json` differs, by its `built`
  timestamp, which is intended.

## 0.3.2 — 2026-09-05

**Added**
- **P. trichocarpa syntenic ortholog** on every gene page, with an outbound Phytozome link —
  46,141 reciprocal 1:1 pairs, 6,329 flagged ambiguous, 11,490 genes with no syntenic hit.
  A Potri id is the key that unlocks PopGenIE and Phytozome for someone holding a 717 gene,
  which is the lookup a community visitor arrives wanting. Derived from this atlas's own
  GENESPACE run rather than an imported table, so it carries no external staleness risk.
  Ambiguous relationships keep their multiplicity instead of being resolved by a top hit.

**Fixed during development**
- Reciprocity was first computed over the pooled gene set, which counted the expected
  HAP1+HAP2 pairing of a phased diploid as ambiguity and collapsed the 1:1 set to 724 of
  52,470. Computing it within each haplotype gives 46,141.

**Deferred with a reason**
- The 377-sample P. trichocarpa xylem expression atlas is NOT joined in. Doing so would place
  TPMs from a different genome, annotation version and quantification pipeline beside this
  atlas's own values, inviting a comparison the numbers do not support. The ortholog link
  above lets a visitor make that jump deliberately, at PopGenIE, where the data belongs.

## 0.3.1 — 2026-09-05

Data audit. Chen flagged that some Sapelo2 outputs are stale; every ingested layer was
re-checked against what its source repo says about itself. Full verdicts in `docs/DATA_AUDIT.md`.

**Removed**
- **PAV / hemizygosity.** The available table is the orthogroup-based PAV call that ms1-dup
  explicitly tells readers not to use (it gives 2,356 / 2,117 and has an `n_ogs` column; the
  canonical DIAMOND `tier1_floor` figures are 805 / 859). The canonical table is not in the
  mirror, so the atlas ships no PAV layer rather than the wrong one.
- **Independent tau (n=202).** Computed on a panel the source repo records as superseded on
  2026-08-24.

**Replaced with locally derived equivalents** — each was offered by a table with no canonical
status, sitting in a case-study, calibration or "structural explorations" folder:
- Exon/intron counts, now from the v5.1 `gene_exons.gff3` (longest isoform).
- TE distance, now from the v5.1 repeatmasked GFF3, excluding simple and low-complexity repeats.
- Genomic order, now sorted from the atlas's own coordinates.

**Verified rather than repeated**
- The "coil is a pLDDT proxy" warning was checked against the table: r = −0.49 for coil vs mean
  pLDDT across 40,685 genes, against +0.16 for helix. The page now quotes the measured value.
- ESMFold usage confirmed inside the source's stated safe envelope: it says aggregate
  `helix_frac` is safe and long-run helix content is not, and the atlas serves only the former.

**Privacy pass**
- Tandem-array curation notes were shipping internal lab process to a public page: curator
  initials and dates (`cj_20260827`), verbatim quotes (`curator wrote: "no"`), and a named
  personal exception. Notes are now reduced to their meaning — "manually rejected during
  curation", "flagged pseudogene-like", "curated verdict disagrees with the automatic gate" —
  which is what a visitor can use. Zero shards now carry a curator identity or raw quote.
- Confirmed separately that LSG candidate labels (LSG1.14g, XO14gHAP2 …) appear nowhere in the
  shipped data or UI, so no candidate identity is public. The `lsg` flag is only PS ≥ 18,
  derived from the public genEra rank.

**Surfaced for Chen**
- ms1-dup's `CLAUDE.md` contradicts itself on the canonical expression panel: §B says n=202 was
  superseded by n=222 on 2026-08-24, §D still says "the current canonical n is 202". Line 197
  breaks the tie for n=222. Worth fixing so the next reader is not misled.

## 0.3.0 — 2026-09-05

Seven genome-wide computed layers ingested from the MS1 and MS2 analysis repos, and a new
protein module. Every gene now carries duplication class, TE proximity, gene structure,
HAP1:HAP2 pangene relationship, disorder, and mass-spec evidence.

**Added**
- **Duplication class**, genome-wide: salicoid WGD / ancient WGD / tandem / dispersed / none,
  from the MS1 duplication analysis. This closes the gap the module previously declared —
  it no longer has to say "no WGD ohnolog call exists".
- **TE proximity**: distance to the nearest transposable element, per superfamily.
- **New protein module**: predicted disorder (63,910 genes), ESMFold secondary structure and
  pLDDT (40,685, 64%), and peptide evidence from three independent mass-spec datasets kept
  separate — detection is strong evidence a predicted protein is translated, which is the
  sharpest credibility test available for a young lineage-specific gene.
- **Gene structure** (exons/introns) on the location card; LSGs are known intron-poor.
- **HAP1:HAP2 pangene relationship** including hemizygosity, shown on the allele card — and
  shown especially when there is NO allele, since hemizygosity usually explains why.
- **Neighbourhood co-expression** (k=5, k=10) on the expression card.
- **Organelle-homology warning**: 362 genes have plastid/mito homology, a real false-positive
  source for novel-gene claims.

**Added (batch 2)**
- **Tandem array identity**: which genes share an array, from ms1-dup's hand-curated union set
  (13,663 genes, 4,371 arrays) — which that repo explicitly says supersedes its own v8 tandem
  tables. Carries array size, median Ks, age bin, pseudogene flags and the curator's verdict.
  This closes the "array identity is not resolved" gap the module used to declare.
- **Perturbation responsiveness**: median |log2 fold-change| across eligible contrasts
  (49,289 genes).
- **Independent tau** from a separate 202-sample panel, shown BESIDE the atlas's own
  652-sample value rather than replacing it — two panels, two answers, and their agreement is
  itself informative.
- **Previous/next gene navigation** along the chromosome, from genomic rank order.

**Not ingested, deliberately**
- `master_duplication_table_v4.csv` is superseded: it still carries the `W_excluded` category
  that ms1-dup's own CLAUDE.md says was eliminated in v5. The canonical v6 master is not
  present in this mirror, so the v8 membership file — whose A/S/T/D/C legend is confirmed by
  ms1-dup `RESOURCES.md` — is the most current per-gene duplication call available, with the
  tandem component taken from the union set above.

**Guarded**
- Duplicate source rows are collapsed only when the columns actually ingested agree. The
  proteomics tables repeat 5,024 genes that are both a `conserved` gene and an LSG's
  `matched_control`, and `PtXaAlbH.14G133000` appears twice under two canonical labels
  (LSG1.14g and XO14gHAP2). Measurements agree in every case; a disagreement is fatal.
- Coil fraction is flagged on every gene page as largely a pLDDT proxy, not evidence of
  disorder — the easiest misreading of the structure table.
- Where the duplication class says "none detected" but paralogs are listed, the card explains
  that the two rows answer different questions rather than leaving an apparent contradiction.

## 0.2.1 — 2026-09-04

**Added**
- Study pages render the full sample metadata that `samples.json` already carried: tissue,
  treatment, genotype, growth condition, control/perturbation role, layout, reads, alignment
  rate and per-sample processing notes.
- Expression gene card gains a **By condition** view: replicate means per experimental
  condition, grouped by study, alongside the existing per-sample strip. For LSG4.5g in study
  27 bark this reads as drought 78.4 vs control 43.0 in WT — the question a reader actually
  has, which 652 individual dots do not answer.
- Duplication module (see below) and its checks.

**Corrected**
- Condition grouping uses the metadata fields, not a `_repN` suffix strip. Study 27 encodes
  replicates as `DR1/DR2/DR3`, so label-parsing split all 72 of its samples into singleton
  "conditions". Metadata grouping gives 204 groups with a median of 3 replicates.
- `check.mjs` assertions were case-sensitive against `innerText`, which returns RENDERED text.
  Since `table.data th` is `text-transform:uppercase`, asserting "% aligned" could never match
  "% ALIGNED" — two checks failed against a page that was correct.

## 0.2.0 — 2026-09-04

The gene page becomes a hub, and phylostratigraphy gets a real module.

**Added**
- Phylostratigraphy module: log-scaled strata ladder over both haplotypes, the LSG pool
  (PS ≥ 18), genEra's own ambiguity flags (44 genes) and unplaced genes (50), and each gene's
  family origin stratum and size. 1,512 of the 1,725 LSG-pool genes are singleton families.
- Functional annotation per gene: description, best-Arabidopsis hit, Pfam, PANTHER, GO
  (4,862-term shared dictionary). 60,746 of 63,960 genes annotated.
- HAP1↔HAP2 allele link with Yang–Nielsen Ka/Ks over the 25,931-pair syntelog map;
  51,862 genes carry a partner.
- Panel presence across the 12 genomes, from the OrthoFinder orthogroup.
- Free-text search over descriptions, Arabidopsis loci and Pfam/PANTHER accessions,
  as a first-character-sharded token index. Gene-ID search still needs no index at all.
- Outbound links: Phytozome gene report, TAIR locus, AmiGO GO terms.
- `.nojekyll`, `LICENSE`, `CITATION.cff`, this changelog, a provenance page, and CI
  running the headless render checks.

- Browse / query builder: filter all 63,960 genes across synteny, phylostratigraphy,
  expression and annotation at once, over a 274 KB facet index rather than the 250 MB of
  shards. Named gene sets and TSV export. Filtering `private_no_ortholog` ∩ PS ≥ 18 returns
  923 genes, independently reproducing the step-7 report's LSG-pool figure (275 + 648).
- `scripts/validate_data.py` grew facet checks, including a sampled cross-check that facet
  values equal the gene shards they were derived from.

**Corrected**
- PAML reports `omega = 99.0` where it cannot estimate the ratio — the 716 pairs whose
  Ks is 0. Previously this would have rendered as extreme positive selection. Now nulled,
  with the pair flagged as "identical at synonymous sites".
- One pair carries `=`/`w` sentinels for Ks and Ka but a numeric omega of 0.0000, which
  displayed as "strong purifying selection". Dropped.

- The facet index encoded "no orthogroup" (0 genomes) as missing data, so 1,575
  OrthoFinder-unassigned genes displayed as "—" in the browse table instead of "none".

**Known limitation**
- HAP2 domain coverage is thin: the v5.1 release left HAP2's Pfam/PANTHER/GO columns empty
  for all 65,212 rows. GO was recovered from the lab-built `h2.custom.GO`; Pfam only partly,
  from the defline (3,222 HAP2 genes vs 26,132 on HAP1). The gene card states this, so the
  asymmetry is not mistaken for biology.

## 0.1.0 — 2026-09-01

- Gene shards for 63,960 genes; the gene ID encodes its own shard, asserted against the
  annotation at build time.
- Synteny module: five-way class, orthogroup span, old-vs-new panel diff, DIAMOND-sensitivity
  stability.
- Expression module: 652 samples, 28 curated studies, 38 BioProjects; tissue-baseline summary
  in the shard, full 652-sample vector on demand.
