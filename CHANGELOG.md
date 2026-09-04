# Changelog

Data versions are stamped into `data/meta/manifest.json` as `data_version` and shown in the
site footer. A data version changes only when the *contents* of `data/` change.

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

**Corrected**
- PAML reports `omega = 99.0` where it cannot estimate the ratio — the 716 pairs whose
  Ks is 0. Previously this would have rendered as extreme positive selection. Now nulled,
  with the pair flagged as "identical at synonymous sites".
- One pair carries `=`/`w` sentinels for Ks and Ka but a numeric omega of 0.0000, which
  displayed as "strong purifying selection". Dropped.

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
