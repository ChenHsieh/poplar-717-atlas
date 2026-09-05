# Data audit — 2026-09-05

Chen flagged that some analysis outputs on Sapelo2 are stale. Every layer the atlas ingests was
re-checked against what the source repositories say about themselves (`CLAUDE.md`,
`RESOURCES.md`, `CANONICAL_NUMBERS_v8.md`, per-analysis READMEs). Two layers were removed, three
were replaced with locally derived equivalents, and the rest carry a recorded verdict.

## Removed

| layer | why |
|---|---|
| **PAV / hemizygosity** | `hemi_pav_crosstab.csv` is the **orthogroup-based** PAV call. ms1-dup `CLAUDE.md` line 166: *"Do NOT use the OG/OrthoFinder PAV call (2,075 / 1,942) — the canonical PAV call is DIAMOND-based `tier1_floor` (805 / 859)."* The ingested table gives **2,356 / 2,117** and carries an `n_ogs` column, so it is that family. The canonical `tier1_floor` table is **not in the mirror**, so the atlas ships no PAV layer rather than the wrong one. |
| **Independent tau (n=202)** | Computed on the n=202 atlas panel, recorded as **superseded 2026-08-24**. |

### A contradiction in ms1-dup's own CLAUDE.md, for Chen to resolve

Two statements disagree about the canonical expression panel:

- §B line 148 — *"Canonical atlas panel = v4 n=222 (652-sample matrix; **n=202 superseded 2026-08-24**)."*
- §D line 164 — *"Do NOT quote a number on the n=222 panel as if it's canonical. **The current canonical n is 202.**"*

Line 197 breaks the tie in favour of n=222 (*"Unchanged and still canonical: v4 n=222 atlas
panel"*), and §D reads like leftover text from the May 2026 n=202 swap that was never updated.
**The atlas assumes n=222 is canonical and ships no n=202-derived layer.** §D is worth fixing so
the next reader is not misled.

## Replaced with locally derived equivalents

Each of these was offered by a table with no canonical status — sitting in a case-study,
calibration, or explicitly "structural explorations" folder. All three are plain facts of the
annotation, so they are computed here from the reference that ships with the genome.

| layer | was | now |
|---|---|---|
| Exon / intron counts | a file inside a retroduplication *case study* folder | `v5.1 gene_exons.gff3`, longest isoform (63,960 genes) |
| TE distance | `data/32_te_proximity_threshold/`, filed under *"structural explorations"* | `v5.1 repeatmasked_assembly` GFF3, excluding simple/low-complexity repeats (63,923 genes) |
| Genomic order | a file inside an aWGD misannotation *calibration* folder | sorted from the atlas's own coordinates (63,960 genes) |

## Kept, with the verdict that justifies it

| layer | verdict |
|---|---|
| **Tandem arrays** | **Canonical.** ms1-dup line 185: *"Canonical TD files (use these, not the v8 TD tables)"* — the curated union set, 13,663 genes / 4,371 arrays. All 13,048 v8-flagged genes fall inside it. |
| **Perturbation responsiveness** | **Canonical.** Documented in `CANONICAL_NUMBERS_v8.md`, with a 2026-08-26 addendum verifying responsiveness was not averaged blind across unexpressed contrasts. |
| **Duplication class** | **Best available.** Its A/S/T/D/C legend is confirmed by `RESOURCES.md`. `master_duplication_table_v4.csv` was rejected — it still carries the `W_excluded` category eliminated in v5. The canonical v6 master is **not synced** to this mirror. |
| **ESMFold structure** | **Inside the source's stated safe envelope.** Its README says aggregate `helix_frac` is safe while long-run helix content "should not be interpreted as biology" — the atlas serves `helix_frac` and never `max_helix_run`. |
| **Predicted disorder, proteomics, neighbour co-expression, organelle homology** | No superseded/canonical statement either way in the source repo. Shipped as predicted or measured values with their own caveats on the page. |

## A caveat verified rather than repeated

The atlas warns that coil fraction is largely a pLDDT proxy. That claim was checked against the
table rather than taken on trust: across all 40,685 modelled genes,

| pair | Pearson r |
|---|---|
| coil fraction vs mean pLDDT | **−0.490** |
| helix fraction vs mean pLDDT | +0.162 |

The warning is well founded, and now quotes the measured number.

## Not pursued

**Allele-specific expression.** Chen did not carry this analysis forward, and `ase_analysis/`
holds per-chromosome separated reads with no per-gene table. Building one would mean creating a
result, not surfacing one. It stays out until Chen decides to pursue it.
