# Expression module — design

**Source:** `ms2_genespace/expression/` — the v3 rerun delivered 2026-08-14 (ID fix 2026-08-18),
652 samples / 697 runs / 38 BioProjects / 28 curated studies, kallisto k21 against the combined
HAP1+HAP2 v5.1 primary transcripts. This supersedes the 531-sample atlas; the site uses it.

## What was verified before designing

| check | result |
|---|---|
| TPM matrix shape | 63,960 rows × 653 cols, no ragged rows |
| gene IDs | == the atlas BED set exactly (0 missing, 0 extra), no `.1` suffix |
| sample columns | == `COLUMN_LEVEL_sample_metadata.csv` `sample_label` set exactly |
| ComBat-seq v7 FPKM | **59,599 genes, IDs still `.1`-suffixed, accession-style headers** — an older generation |
| metadata coverage | tissue 652/652, citation 652/652, DOI 547/652 (studies 2,3,4,5,8 have none) |
| shard-size experiment | 250 genes × 652 samples: TPM 2dp **252 KB gz**; 1dp 175 KB; log2 1dp 126 KB |

## Decisions

1. **Raw TPM at 2 decimals is the shipped value** — identical to the delivered file, so what a
   visitor sees is what they download. README: raw for tau / PCC / magnitude; ComBat only for
   cross-study visualisation. ComBat is **deferred** — it is a different gene set with stale IDs
   and would need a rebuild on the 63,960-gene matrix first.
2. **Two-level data: a small summary lives IN the gene shard; the full 652-vector is a second
   fetch.** A gene page already loads its shard, so the baseline tissue view costs nothing extra.
3. **Explicit shard pointer, not a second computable rule.** The gene record carries
   `x.b = <bucket>`; the client never derives an expression path from an ID. One rule to keep in
   sync (the gene→chr rule) is enough.
4. **Study is the community-facing unit** — one page per curated study, the way GEO / ArrayExpress
   / PopGenIE present data — with BioProject, citation + DOI, design factors, a sample table, and
   external links. Study numbering (1–31, gaps = excluded) follows the delivery.
5. **Baseline = median TPM across WT controls per tissue.** Counts per tissue are healthy for
   leaf 77 / xylem 59 / bark 38 / root 27, thin for bud 5 / catkin 4 / stem 2 / callus 1, and the
   n is shown beside every bar. **Tau** (Yanai) is computed over the 8 non-callus tissues, per
   the delivery note that callus stays out of the manuscript panel; callus is still shown, flagged.
6. **Study 29 (PRJNA752367) is flagged "prefer counts over TPM"** on its page, per the README's
   effective-length caveat. Processing notes (188 samples, e.g. requantified unstranded) surface
   in the sample table.
7. **Bulk downloads ship as gzipped CSV** under `downloads/` — the 125 MB CSVs exceed GitHub's
   100 MB file cap uncompressed. Pages serves them fine.

## Data layout

```
data/expr/samples.json           652 rows, every metadata column, FIXED ORDER (= vector index)
data/expr/studies.json           28 studies: bioprojects, n, tissues, factors, citation, doi, flags
data/expr/{hap}/{chr}/{b}.json   {gene_id: [652 × TPM 2dp]}, 250 genes per bucket, ~250 KB gz
data/genes/{hap}/{chr}.json      gene record gains
                                   x: { b: bucket, t: {tissue: median TPM}, n: {tissue: n},
                                        tau: 0.71, top: "xylem", max: 412.3 }
downloads/tpm_k21.csv.gz, counts_k21.csv.gz, sample_metadata.csv, README.txt
```

~256 expression buckets, ~64 MB gzipped total, ~105 MB raw JSON in the repo. Acceptable for
Pages; if rebuild churn bloats git history, squash — the committed data is the artifact, since
the sources live on Sapelo2 and cannot be rebuilt in CI.

Build asserts: TPM/counts/efflength headers identical; every gene in the BED has a vector;
`samples.json` order == vector order; every bucket referenced by a gene record exists.

## Views

| route | what |
|---|---|
| `#/module/expression` | study catalogue (filter by panel type / tissue / genotype), tissue × panel matrix, downloads |
| `#/study/<n>` | BioProject(s) → ENA/SRA links, citation + DOI, design factors, sample table (label, tissue, treatment, genotype, growth, runs, layout, reads, % pseudoaligned, notes) |
| gene card | (a) baseline tissue bars from the shard, tau, n per bar; (b) "load full profile" → 652 samples grouped by study → condition, per-sample dots, hover tooltip |
| `#/browse` | gains filters: tau ≥ x, top tissue = y, expressed (median TPM ≥ z) in tissue |

Chart rules (dataviz): the tissue baseline is ONE series of magnitudes → a single hue, tissue
names as direct labels, no categorical palette needed. The profile view colours dots by
control / perturbation only (two slots, both validated). Every chart has a table view.

## What this enables across modules

Filter to `private_no_ortholog` ∩ PS ≥ 18 → inspect their tissue baselines → export. The
GeneSet store already exists; expression is the first module that makes it worth using.

## Deferred, with reasons

- **ComBat-seq cross-study view** — needs a 63,960-gene rebuild with fixed IDs.
- **Allele-specific expression** — `ase_analysis/` holds per-chromosome separated reads, no
  per-gene table yet. Distinctive for a haplotype-resolved hybrid; worth its own module later.
- **P. trichocarpa xylem (GSE78953, 377 samples, Potri IDs)** — cross-species via the synteny
  orthogroups. A real cross-module payoff, but a different genome; not v1.
- **Extra 717 datasets not in the 652**: PRJEB37748 nitrogen leaves (26 runs, quantified,
  `misc/RNA-Seq/`), heatSASalt (31 runs, PRJNA408736), 13 CJ_transcriptome runs. Add only after
  the same curation pass the 652 received.
