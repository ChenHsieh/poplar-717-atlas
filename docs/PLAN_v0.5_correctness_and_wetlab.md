# Plan: v0.5 correctness fixes and the wet-lab turn

**Written:** 2026-09-05, from inspecting the live site, the build scripts, the committed data,
and the two upstream repos (`ms1-dup`, `ms2-lsg`). **Status:** proposal, nothing here is built.
**Owner of decisions marked [Chen]:** Chen. Everything else is an engineering call.

The goal Chen set: a resource that a wet-lab or functional-genomics person with no bioinformatics
support can open and get what they need from, with in silico evidence they can trust and cite.
That reframes the audience. The roadmap's two audiences were the chapter and the community; the
wet-lab user is a third, and the one most poorly served today.

---

## Part A. Fix the leaf pooling (public, wrong today, ships first)

### A1. What is wrong, verified

`scripts/build_expression.py` line 147 groups WT-control samples by `tissue`. The atlas's metadata
(`COLUMN_LEVEL_sample_metadata.csv`, 23 columns) has no `tissue_analysis` column, so young and old
leaf are indistinguishable to it. Result, confirmed in the shipped data:

| what | value |
|---|---|
| WT-control "leaf" samples in the baseline | 77 |
| of which labelled `leaf (young)` | 11 |
| of which labelled `leaf (old)` | 11 |
| tau computed over | the pooled 77 |

These are exactly the 11 + 11 the MS1 v4 panel README lists under `leaf_young` / `leaf_old`,
so it is the same 22 samples and the same pooling MS1_2026 forbids in two places. It is visible
on the live study 1 page: rows labelled `01_leaf (old)_...` show `leaf` in the Tissue column.

Chen's clarification, 2026-09-05, also matters here: the WT-control subset is the right basis for
tau and tissue baselines. It is **not** a project-wide canonical sample set. Most analyses need
the perturbation samples or all 652. The atlas already does this correctly in structure (baseline
= WT controls, profile = all 652); it just needs to say so on the page instead of inheriting the
"canonical n=222" language that the data audit found self-contradictory upstream.

### A2. The fix

1. **Source the split, do not infer it.** Add `tissue_analysis` to the atlas's sample metadata by
   joining `ms1-dup/data/50_v4_panel_20260814/v4_panel_20260814.csv` on `sample_label`
   (652 rows, exact match to the TPM header). Do not regex the label; the v4 panel is the
   curated record and it also carries `quality_band` and `n_detect_5`, which A4 wants.
2. **Group the baseline on `tissue_analysis`.** Leaf becomes three tissues on the gene card:
   `leaf` (207 total, 55 WT-control), `leaf_young` (23 / 11), `leaf_old` (23 / 11). The n is
   already shown beside every bar, so thin groups are self-declaring.
3. **Tau over `tissue_analysis` minus callus.** That is nine tissues, not eight. [Chen] confirm
   that `leaf_young` and `leaf_old` enter tau as separate tissues, which is what the MS1 rule
   implies, or whether tau should use the unsplit `leaf` for comparability with the chapter's
   "tau over 8 tissues" definition. The roadmap says the chapter's tau definition must not drift,
   so this is a real conflict and not mine to resolve. Default if no answer: compute both,
   ship `tau` on the split tissues, keep `tau8` as a documented cross-check field.
4. **Rename the card's scope line.** Replace "Median TPM across WT-control samples, 652-sample
   atlas" with wording that states the two scopes plainly: baseline over the WT-control subset,
   profile and responsiveness over all 652. Remove any implication that the subset is canonical.
5. **Gate it.** Port `ms1-dup/scripts/check_sample_grouping.py` (stdlib only, honours
   `MS1_ROOT`) into `scripts/` and call it from `build_expression.py` with the grouping key
   actually used, before aggregation. Exit 1 blocks the build. This is the same executable rule
   MS1 adopted today after two prose warnings failed; the atlas should not rely on a third.
6. **Update the checks.** `check.mjs` line 74 expects `catkin` on the gene page; add
   `leaf_young` to the expected strings so a regression to pooled leaf fails CI.
   `validate_data.py` gains one check: every gene's `x.t` has the same tissue key set as
   `manifest.expression.tissue_wt_control_n`.
7. **Record it.** `CHANGELOG.md` entry under a new `data_version`, and a line in
   `docs/DATA_AUDIT.md` under "Replaced" naming the pooled-leaf tau as superseded.

Effort: half a day including the rebuild and screenshot review. No new source group, since the
v4 panel comes from `ms1-dup`, which the build already reads.

---

## Part B. Bring the duplication and PAV layers current

Both were diagnosed 2026-09-05 against the ms1-dup mirror directly.

### B1. Duplication class: v8 to v9

The build reads `dup_type_v8` from `ms1-figures/data/dupclass_membership_v8.csv`. The current
call is `data/55_master_v9_20260902/master_duplication_table_v9.csv` (13 MB, in the mirror). It
carries the same TD union set the atlas already uses for arrays, plus the rule 5c and
178-conflict WGD letters. About 2,000 genes change letter, nearly all in the T bit (the union
set) and 457 in S/A. Swap the source, keep the A/S/T/D/C legend, bump the layer's provenance.
While there, surface `syntelog_type` and `cds_bp_longest_tx` from the same file; the latter
fixes the isoform-summed coding length that inflated 26.6% of the previous TD table.

### B2. PAV: not missing, misnamed

`docs/DATA_AUDIT.md` and `TODO.md` item 21 say the canonical `tier1_floor` PAV table is absent
from the mirror. It is present, tracked, and gives exactly 805 HAP1 / 859 HAP2:

```
ms1-dup/data/02_synteny_section/hemizygous_pav_diamond.csv
```

(`data/v7_supporting/pav_diamond_canonical.csv` is a symlink to it, which is likely what broke
the lookup on Lustre.) Ship the PAV layer. The v6 master named in the same TODO item is present
too (`data/35_v5_master_table/master_duplication_table_v6.csv`, 21 MB) but is superseded by v9
for this purpose; close the item rather than wiring v6 in.

---

## Part C. What a wet-lab user actually needs, ranked by how often they will hit the gap

The current gene page answers "what is this gene and how old is it" well. It does not answer the
questions someone planning a cloning, qPCR, CRISPR, or expression-validation experiment asks.
Ordered by frequency of the question times how badly the page fails it today.

### C1. Sequences on the page

There is no sequence anywhere on the site. Every wet-lab task starts from one: CDS for cloning,
protein for antibody or domain work, promoter for reporter constructs, genomic span for CRISPR
guide design. Today the user leaves for Phytozome, loses the haplotype context, and comes back.

Ship four per-gene sequences, lazy-loaded so the gene page cost is unchanged:

| sequence | source | size, both haplotypes, gzipped |
|---|---|---|
| CDS, longest transcript | v5.1 annotation, on-cluster | ~25 MB |
| protein | v5.1 annotation | ~15 MB |
| promoter 1 kb upstream, strand-aware | already extracted: `~/dev/cre_embedding/data/00_sequences/promoter_1kb_hap{1,2}.fa`, 32,137 + 31,823 records = all genes | ~20 MB |
| genomic span with exon coordinates | v5.1 GFF3 | in the shard already, add the sequence |

Shard by the existing ID-to-shard rule under `data/seq/{hap}/{chr}.json`. Copy button, FASTA
download, and a one-line warning where the HAP2 allele differs: see C3.

### C2. "Is my gene induced by X" as a table, not a number

The card shows one number, "responsiveness 0.390 over 105 eligible contrasts". A wet-lab reader
cannot act on that. The data to answer the real question already exists: 191 contrasts with
explicit control and perturbation sample lists in
`ms1-dup/data/50_v4_panel_20260814/v4_contrasts_20260814.csv`, and per-gene, per-contrast
log2FC in `data/54_v8_freeze_20260825/perturbation_per_gene_v8.csv` and the per-contrast
companion.

Ship a per-gene contrast table: study, tissue (`tissue_analysis`, not `tissue`), treatment,
n control, n perturbed, log2FC, and whether both arms clear the detection floor. Sort by
|log2FC|. Filterable by treatment family (drought, CO2, hormone, wounding, pathogen, season) and
tissue. This is the single highest-value addition for anyone choosing a condition to validate in.
Keep the summary number, but as a footer to the table rather than the only thing shown.

### C3. Allele-aware design warnings

This is a hybrid with two phased haplotypes, and the atlas is the only public resource that knows
both. Primers, probes, and guides designed against one allele may or may not hit the other. The
page already has the HAP2 allele and Ka/Ks. Turn that into guidance:

- Ka and Ks with an explicit sentence: "the alleles differ at roughly N% of synonymous sites;
  a primer or guide designed on HAP1 may not amplify or cut HAP2."
- A per-gene allele alignment on request (CDS vs CDS), with mismatch positions marked, so a user
  can pick allele-specific or allele-shared regions. Client-side Needleman-Wunsch on two
  ~1.5 kb sequences is instant; no server needed.
- Where there is no allele (PAV, C4 below) say so plainly: "HAP2 has no copy; this is a
  single-allele gene in 717."

### C4. Specificity warnings from duplication

Tandem array members and close paralogs are qPCR and CRISPR off-target risks. The duplication
card already lists them. Add one derived field per gene, "closest paralog identity", from the
DIAMOND self-hits that produced the D class, and a one-line flag when it exceeds a stated
threshold. [Chen] the threshold is arbitrary by nature; propose 90% amino-acid identity as the
flag level and state it as a design parameter, not a biological claim.

### C5. Paste a gene list

Browse filters the whole genome by attribute. Wet-lab users arrive with a list, not a filter:
twenty IDs from a paper, or a pasted column from a spreadsheet. Add a "paste IDs" entry that
resolves gene IDs, AT loci, and Potri IDs (the search index already knows all three) into a
GeneSet, then hands off to the existing table and TSV export. Also accept a `.txt` drop.

### C6. Study pages as the citation unit, made usable

The study page already has the design, the DOI, and the sample table. Two gaps for a reader
choosing a dataset: the Tissue column must show `tissue_analysis` (A2), and each study needs a
one-line "what you can and cannot compare" note generated from its design (which factors have
a control arm, which are confounded with batch). The `has_reference_arm` and `blocking` fields
in the contrasts file carry this already.

### C7. Downloads that match how people work

Per gene: TPM vector as TSV (exists), contrast table as TSV (C2), four FASTA sequences (C1).
Per gene set: the browse export (exists) plus a "sequences for this set" FASTA bundle. That
last one is what a person ordering a batch of primers wants.

---

## Part D. Sapelo2-agnostic, OneDrive-free build

Today `preflight.py` refuses to run anywhere but Sapelo2, and the roadmap says the build is
"not reproducible from a clone by design". That was a reasonable v0.3 decision; it is now the
main operational risk, and it is also why the duplication layer went stale and the PAV layer
was never found: the build reads a `/scratch` copy of `ms1-dup`, not the repo.

Off-cluster availability of the 13 source groups, checked 2026-09-05:

| group | off-cluster today | via |
|---|---|---|
| tandem union, duplication, perturbation, PAV | yes | `ms1-dup` git mirror |
| expression matrix + metadata | yes | `ms1-dup` (209 MB matrix is in OneDrive; not in the mirror by policy) |
| v4 panel with `tissue_analysis` | yes | `ms1-dup` |
| protein layers (disorder, ESMFold, proteomics) | yes | `~/dev/ms2-lsg` |
| genEra gene ages | no | Sapelo2 only |
| GENESPACE bed, step 7 diff, raw pangenes, synHits | no | Sapelo2 only |
| reference GFF3s, `annotation_info.txt` | no | `/work/cjtlab` |
| `synt_ks/syntelog_ks.csv` | no | Sapelo2 only |

The structural point: the atlas does not need the raw sources. Each stage reduces a large input
to one row per gene. The committed artifact is 296 MB, of which 199 MB is expression buckets and
90 MB gene shards. The portable unit is the reductions, not the inputs.

### D1. Stage 0: frozen per-gene layer inputs

Add `scripts/reduce_sources.py`, run once on Sapelo2, that writes one tidy TSV per cluster-bound
group under `sources/` (committed, one row per gene, tens of MB total):

```
sources/genera_gene_ages.tsv          63,960 rows
sources/genespace_bed.tsv             63,960 rows
sources/genespace_step7_diff.tsv
sources/genespace_pangenes_long.tsv.gz
sources/potri_synhits.tsv.gz
sources/annotation_info.tsv           primary transcript only
sources/syntelog_ks.tsv               25,931 rows
sources/gff_exons.tsv                 exon coordinates, longest isoform
sources/repeatmask_nearest.tsv        nearest TE per gene, already the reduction the build does
```

Each carries a sidecar with sha256, source path, and date. After stage 0, every other build
stage reads `sources/` and the `ms1-dup` clone, and `build_all.sh` runs on any machine.
Only a genEra or GENESPACE re-run ever touches Sapelo2 again.

### D2. Repoint the ms1-dup groups at the repo

Replace `/scratch/ch29576/ms1-dup` with an `MS1_DUP` environment variable defaulting to a
sibling clone. Pin the commit hash the build used in `manifest.json`. That makes "which version
of the duplication call is this atlas serving" a one-line answer, which it is not today.

### D3. Preflight becomes a resolver, not a refusal

`preflight.py` checks `sources/` first, then the `MS1_DUP` clone, then the cluster paths, and
reports which tier each group resolved from. Missing groups still stop the build; "not on
Sapelo2" alone no longer does.

### D4. The expression matrix is the one real exception

209 MB, deliberately not in any git repo. Options, in order of preference:
[Chen] (a) a Zenodo deposit at v1.0, which the roadmap already plans, with the build fetching
by DOI and verifying sha256; (b) Git LFS in a separate private data repo until then;
(c) keep it manual with the sha256 asserted. Recommend (a) with (c) as the interim.

### D5. Repo growth

Each rebuild rewrites ~250 MB of JSON. The roadmap flagged this; it is not decided. [Chen]
recommend a `data` orphan branch that is force-updated on each data release and referenced by
tag, so `main` stays small and `git blame` on the site code stays useful.

---

## Part E. Cis-regulatory elements from ms2-lsg

Chen suggested another agent handle this. Recommendation: **split it.** The ms2 agent owns the
scan; this plan owns the contract the atlas will accept, because the interface is where the two
repos meet and where drift happens.

### E1. What exists, checked

`ms2-lsg/pipeline/out/cre_hits.parquet`: 13,417 promoter units scored against 805 JASPAR 2024
CORE Plantae matrices. Roles: 1,725 LSG, 8,241 matched controls, 3,451 non-genic background.
That is 9,966 genes, not 63,960. It answers the chapter's question and is not a genome-wide
layer. `cre_enrichment.tsv`, `cre_stress_vs_induction.tsv`, `promoter_ness.tsv` are the
chapter-level summaries.

The genome-wide inputs are all local and small: promoter FASTAs for every gene in both haplotypes
(`~/dev/cre_embedding/data/00_sequences/`), the JASPAR matrix file
(`ms2-lsg/pipeline/resources/JASPAR2024_CORE_plants_nr.jaspar`), and the scan code in the
pipeline. A genome-wide scan is CPU work measured in hours on the iMac, not a cluster job.

### E2. The contract (this repo's side)

The atlas will accept one file, `sources/cre_promoter_hits.tsv.gz`, one row per gene:

```
gene_id  hap  promoter_len  n_upstream_overlap  gc  tata_pos
<one column per motif family, count of hits above the per-matrix threshold>
```

Motifs collapsed to families (ABRE, DRE/CRT, W-box, MYB, NAC, bZIP, ...) using the mapping the
chapter already uses, since 805 columns per gene is not a gene card. Per-matrix hits stay in
the ms2 repo for anyone who wants them. The card shows: promoter GC, TATA presence and
position, the stress-motif panel as a compact strip with counts, and a link to the promoter
sequence (C1). It does **not** show enrichment p-values; those are population claims from the
chapter, not per-gene facts.

Tier: public. Motif counts on a public genome are not unpublished results. The chapter's
enrichment claims stay out until it publishes.

### E3. What the ms2 agent owns

Run the existing scan genome-wide, both haplotypes, same thresholds and background estimation as
`s08`, write the contract file with a sidecar naming the JASPAR release, threshold, and promoter
window. Also decide [Chen] whether 1 kb is the window for the atlas or whether the 2 kb
sensitivity window from `PLAN_promoter_length_3kb.md` should ship alongside.

---

## Part F. Order of work

| step | what | why this order |
|---|---|---|
| 1 | Part A, leaf fix + gate + tests | public and wrong today; smallest change |
| 2 | B1, B2 | one-line source swaps, ride the same rebuild |
| 3 | D2, D3 | make the ms1-dup dependency explicit before adding more layers from it |
| 4 | C2, contrast table | highest wet-lab value, data already exists |
| 5 | C1, sequences; C3, allele warnings | needs one Sapelo2 pass for CDS/protein; promoters are local |
| 6 | D1, stage 0 | fold into the same Sapelo2 pass as step 5 |
| 7 | C5, C6, C7, C4 | UI work on data already present |
| 8 | E, CRE | after the ms2 scan lands; contract fixed now so it lands in the right shape |

Steps 1 and 2 are one rebuild. Steps 5 and 6 are the second and, ideally, last Sapelo2 rebuild.

---

## Part G. Decisions that are Chen's, collected

1. Tau over the split leaf tissues (nine) or the chapter's eight (A2.3).
2. Closest-paralog identity threshold for the specificity flag (C4).
3. Expression matrix hosting: Zenodo at v1.0, LFS, or manual (D4).
4. Orphan `data` branch for repo growth (D5).
5. CRE promoter window for the atlas, 1 kb or 1 kb + 2 kb (E3).
6. Whether the ms2 agent runs the genome-wide scan now or after the chapter's s08 is frozen.

## Part H. What this plan does not do

- Does not build allele-specific expression. Closed 2026-09-05 in `DATA_AUDIT.md` for the right
  reason and nothing here reopens it.
- Does not add a BLAST box or coordinate browser. Both need a server; link out.
- Does not change the chapter's definitions (private rule, LSG pool, tau tissues) except where
  A2.3 forces a decision, which is flagged rather than made.
- Does not touch wet-lab phenotype data. Private tier only, unchanged.
