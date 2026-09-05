# Changelog

Data versions are stamped into `data/meta/manifest.json` as `data_version` and shown in the
site footer. A data version changes only when the *contents* of `data/` change.

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
