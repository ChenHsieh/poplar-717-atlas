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

- [x] **23 — SHIPPED 2026-09-06.** Card built on the phylostratigraphy page, right next to
      the existing "LSG pool" line -- makes the site's own long-standing prose warning
      ("a young stratum is not proof of a young gene") per-gene instead of generic. All
      three load-bearing constraints enforced, not just followed: `patch_lsg_qc.py` asserts
      the two forbidden fields are absent from the source header before reading a single
      row, `validate_data.py` gains a check that searches every shard's serialized `qc`
      record for either forbidden field by text, not by a key list a rename could dodge,
      and confirms every qc record sits on an actual pool gene (never widens the pool).
      abSENSE is rendered as its own verdict string plus a caution note (not collapsed into
      a yes/no gene-age claim) exactly where `absense_hdf_flag` is
      `detection_failure_plausible`. `check.mjs` renders a flagged gene, a clean gene, and
      separately asserts neither forbidden field ever appears in the rendered page text.
      Screenshots reviewed for both. See CHANGELOG.md 0.3.9.

- [x] **24 — build integrity, 2026-09-08.** Three defects that every check passed through,
      found by diffing two rebuilds against each other rather than by a check. The facet
      index was stale after the leaf-tissue patch (54,705 wrong tau, 16,321 wrong top
      tissue) and Browse contradicted the gene page; 834 PANTHER accessions carried an
      arbitrary member gene's subfamily name, redrawn on every build; and the search index
      was reshuffled every build by `set` iteration under randomised string hashing.
      `validate_data.py` now recomputes every facet row and column instead of sampling two
      columns of every 997th gene, and was confirmed to fire on the stale file before being
      trusted. See CHANGELOG.md 0.3.11.

      **The rule that generalises:** any patcher that touches a shard field the facet index
      carries must be followed by `build_facets.py` — it is last for a reason. The validator
      now enforces this, so it fails loudly instead of shipping a Browse view that disagrees
      with the gene pages it links to.

- [ ] **25 — the checks cannot see a value that is stable and wrong.** Both defects above
      rendered fine, validated fine, and were internally consistent. What caught them was
      rebuilding twice and diffing. Worth doing after any change to a build script, and
      worth a `scripts/` helper if it happens a third time.
