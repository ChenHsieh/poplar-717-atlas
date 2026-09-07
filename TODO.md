# TODO

Ordered. Each line is a shippable increment. Direction lives in `docs/ROADMAP.md`;
this file is the task list for the current release (v0.2 — "gene page becomes a hub").

- [x] **1 — repo + data build.** `build_data.py`, gene-ID→shard convention asserted against
      the annotation, 39 shards / 63,960 genes / 23 MB, `--tier full|public` flag.
- [x] **2 — site shell.** Hash router, data loader with cache, module registry, `GeneSet` store.
- [x] **3 — module: synteny.** 5-way class, n_genomes_in_og, orthogroup, HAP1↔HAP2 syntelog,
      old-vs-new diff + DIAMOND-sensitivity stability.
- [x] **4 — module: phylostratigraphy.** Strata ladder (log-scaled), LSG pool, ambiguity and
      unplaced flags, gene-family origin + size. genEra PS rank/stratum, LSG pool (PS≥18), unplaced
      genes (50 with rank NA), founder events. First charts — load the `dataviz` skill first.
- [x] **5 — browse / query builder + gene-set cart + TSV export.** Filters over a 274 KB facet
      index; paginated table; named sets; TSV export. The `private ∩ PS≥18` query returns 923,
      matching the step-7 report exactly.
- [x] **6 — module: duplication.** Tandem arrays (genome-wide) + 1,346 tier-2 paralog pairs
      with dS. HAP1↔HAP2 dS shipped earlier as the allele card. **No WGD ohnolog call** — none
      computed, and inferring one from a stratum-selected subset would be invalid.
- [ ] **7 — module: expression.** UNBLOCKED 2026-09-01 — `ms2_genespace/expression/` holds the
      652-sample v3 rerun (supersedes the 531). Design: `docs/EXPRESSION_DESIGN.md`. Sub-steps:
  - [x] **7a — data build.** `samples.json`, `studies.json`, expression buckets (250 genes,
        TPM 2dp), gene-shard summary (`x.t` tissue medians over WT controls, tau, bucket ptr),
        gzipped downloads. Asserts: header equality across matrices, BED coverage, order.
  - [x] **7b — study catalogue + study pages.** The community-facing organisation: 28 studies,
        BioProject → ENA/SRA links, citation/DOI, design factors, sample table with notes.
  - [x] **7c — gene card: baseline tissue bars + tau** (single hue, n per bar, table view).
  - [x] **7d — full 652-sample profile** grouped study → condition, hover tooltip.
  - [ ] **7e — browse filters** (tau, top tissue, expressed-in) — lands with step 5.
- [x] **8 — publish.** DECIDED 2026-09-01: private repo, **public site**. Pages live from
      `main` root (verified 2026-09-04: chenhsieh.github.io/poplar-717-atlas/ returns 200,
      GitHub API reports `status: built`); `noindex` present in index.html. The `lsg`
      private-tier field is moot (rank ≥ 18 is visible anyway) — the tier mechanism stays for
      wet-lab data only.

## Later / ideas

- Structure + embeddings module (foldseek, ESM-2) from `data/foldseek/`, `data/embedding_tour/`.
- Wet-lab phenotype module — **private tier only**, never published.
- JBrowse-style coordinate view; BLAST box (needs a server, so probably an external link).

## v0.2 — gene page becomes a hub (see docs/ROADMAP.md §5)

- [x] **9 — allele link.** HAP1↔HAP2 syntelog partner + Ka/Ks into the gene record from
      `synt_ks/syntelog_ks.csv` (25,931 pairs); card on the gene page linking both ways.
- [x] **10 — functional annotation + search.** Pfam / Panther / GO / best-AT hit + defline from
      `717Official/annotation/*.annotation_info.txt` (primary transcript only); lazy
      `data/index/search.json`; search box resolves names, domains, AT loci.
- [x] **11 — 12-genome presence strip** on the synteny card from `of_genomes`; outbound links to
      Phytozome (717 v5.1) and PopGenIE / Phytozome P. trichocarpa via the Potri ortholog.
- [x] **12 — publish hygiene.** `.nojekyll`; provenance page from `manifest.json`; `LICENSE`,
      `CITATION.cff`; `data_version` in manifest + footer; `CHANGELOG.md`; CI for `check.mjs`.
- [x] **13 — archive sources.** `ms2_genespace/{step7_diff_*,tier3_input_v2_*,expression}` and
      `synt_ks/` to `/work/cjtlab/` before /scratch purges them.

## Next up (v0.4 / v0.5)

- [x] **18 — ComBat cross-study expression view. SHIPPED 2026-09-06.** The "needs a
      63,960-gene rebuild" premise was wrong -- checked by actually joining the shipped
      v7 matrix against the current gene/sample sets: 0 sample mismatches, 0 gene-naming
      mismatches after stripping the `.1` suffix. The 59,599-vs-63,960 gap is a low-count
      filter upstream of the original ComBat-seq run (excluded genes: median max-TPM 0.84,
      91.2% never exceed 5 TPM; included genes: median 26.73, 11.2% under 5 TPM), not an
      annotation mismatch. Shipped as a per-gene opt-in toggle -- see CHANGELOG.md 0.3.7.
- [x] **19 — allele-specific expression. CLOSED, deliberately not built.** Chen did not pursue
      the analysis; `ase_analysis/` has no per-gene table. Building one would generate a new
      result from an abandoned analysis and publish it as established. See `docs/DATA_AUDIT.md`.
- [ ] ~~19-old~~ `ase_analysis/` holds per-chromosome separated
      reads but no per-gene table yet. The most distinctive thing a haplotype-resolved atlas
      could show, and the one major layer still missing.
- [x] **20 — cross-species ortholog SHIPPED; the expression join deliberately not.** 46,141
      reciprocal 1:1 Potri orthologs with Phytozome links. The 377-sample expression matrix is
      not merged: different genome, annotation and pipeline.
- [ ] ~~20-old~~ P. trichocarpa xylem (377 samples, Potri ids) joined
      through the synteny orthogroups.
- [x] **21 — SHIPPED 2026-09-06.** Both files were already in the mirror, under names the
      2026-09-05 audit never searched for -- `hemizygous_pav_diamond.csv` (PAV) and
      `master_duplication_table_v9.csv` (duplication; v6, the file this item literally
      named, is itself superseded by v9). Duplication: checked directly against the
      running shard values before swapping, and 0 genes actually changed -- the v8-named
      source the atlas already used had already carried the adopted WGD rule 5c letters
      and the current TD union set (6,663/6,385, matching the canonical numbers exactly).
      Kept the swap anyway for provenance honesty; the old source's name and this file's
      own wording both claimed staleness that measurement showed was not true. PAV: new,
      6,092-gene candidate set, 805/859 DIAMOND-confirmed hemizygous (HAP1/HAP2), a
      per-gene card, not a filter -- see CHANGELOG.md 0.3.8.
- [ ] **21b — fix the ms1-dup CLAUDE.md contradiction** about n=202 vs n=222 (see
      `docs/DATA_AUDIT.md`). Old: ms1-dup names
      `master_duplication_table_v6.csv` canonical but it is not synced to the mirror; the
      atlas currently serves the v8 membership file plus the curated union tandem set.
- [ ] **22 — decide the two open policy questions.** Whether to hold LSG candidate labels
      until publication (recommend hold), and confirm MIT code / CC BY 4.0 data.

- [ ] **23 — module: LSG evidence quality.** Source delivered 2026-09-06 by the ms2-lsg agent:
      `sources/lsg_qc_flags.tsv.gz` (1,725 rows, 13 KB) + its provenance sidecar. Chen approved
      shipping it. The site already publishes the pool (`ps_lsg` filter) and already says in
      prose that a young stratum is not proof of a young gene; this makes that warning
      per-gene instead of generic.
      Flags, with genome-wide counts: `tblastn_retract` 228 (13.2%), `absense_reject` 281
      (16.3%), `synteny_contested_any` 106 (6.1%), `wgd_flagged` 45 (2.6%), `qc_clean` 1,227
      (71.1%). HAP1 and HAP2 agree closely on every one.
      **Three constraints, all load-bearing, all in the sidecar:**
      1. **Flags, not filters.** The pool stays 842 HAP1 + 883 HAP2. Do not use these to shrink
         a count, and do not add a "filter to clean genes only" control that changes the
         published pool size. Cite the flag beside the claim.
      2. **Do not add `qc_survivor` or `in_idesia_corrected_pool` later.** They are in
         `pipeline/out/lsg_pool_qc.tsv` upstream and are deliberately NOT in the delivered
         file. `qc_survivor` is defined as `in_idesia_corrected_pool AND NOT (the three
         checks)`, so it silently encodes the undecided Idesia polycarpa correction that would
         move the pool from 842/883 to 776/835. Chen has not adopted it and the chapter still
         cites 842/883. `qc_clean` is the Idesia-independent equivalent and differs by exactly
         13 genes. **The site is public; this one matters.**
      3. **abSENSE is about the AGE CALL, not the gene.** `detection_failure_plausible` means
         an ancestral homolog could exist and be undetectable at this sensitivity. It does not
         mean the gene is old, and the card must not phrase it that way.
      Scope is the 1,725 pool genes only, so the card should render nothing for the other
      62,235. Every `gene_id` was checked against `data/index/genes.json`: zero missing.
