# TODO

Ordered. Each line is a shippable increment.

- [x] **1 — repo + data build.** `build_data.py`, gene-ID→shard convention asserted against
      the annotation, 39 shards / 63,960 genes / 23 MB, `--tier full|public` flag.
- [x] **2 — site shell.** Hash router, data loader with cache, module registry, `GeneSet` store.
- [x] **3 — module: synteny.** 5-way class, n_genomes_in_og, orthogroup, HAP1↔HAP2 syntelog,
      old-vs-new diff + DIAMOND-sensitivity stability.
- [ ] **4 — module: phylostratigraphy.** (a read-only card already ships on the gene page;
      this promotes it to a real module with its own overview + filters) genEra PS rank/stratum, LSG pool (PS≥18), unplaced
      genes (50 with rank NA), founder events. First charts — load the `dataviz` skill first.
- [ ] **5 — browse / query builder + gene-set cart + TSV export.** The cross-module payoff.
      Needs a virtualized table for 63,960 rows.
- [ ] **6 — module: duplication.** Tandem arrays, HAP1↔HAP2 dS (25,931 pairs from
      `synt_ks/syntelog_ks.csv`), paralog pairs, salicoid-WGD ohnologs.
- [ ] **7 — module: expression.** UNBLOCKED 2026-09-01 — `ms2_genespace/expression/` holds the
      652-sample v3 rerun (supersedes the 531). Design: `docs/EXPRESSION_DESIGN.md`. Sub-steps:
  - [ ] **7a — data build.** `samples.json`, `studies.json`, expression buckets (250 genes,
        TPM 2dp), gene-shard summary (`x.t` tissue medians over WT controls, tau, bucket ptr),
        gzipped downloads. Asserts: header equality across matrices, BED coverage, order.
  - [ ] **7b — study catalogue + study pages.** The community-facing organisation: 28 studies,
        BioProject → ENA/SRA links, citation/DOI, design factors, sample table with notes.
  - [ ] **7c — gene card: baseline tissue bars + tau** (single hue, n per bar, table view).
  - [ ] **7d — full 652-sample profile** grouped study → condition, hover tooltip.
  - [ ] **7e — browse filters** (tau, top tissue, expressed-in) — lands with step 5.
- [ ] **8 — publish.** DECIDED 2026-09-01: private repo, **public site**. Enable Pages from
      `main` root; keep `noindex` until the chapter is out. The `lsg` private-tier field is moot
      (rank ≥ 18 is visible anyway) — the tier mechanism stays for wet-lab data only.

## Later / ideas

- Structure + embeddings module (foldseek, ESM-2) from `data/foldseek/`, `data/embedding_tour/`.
- Wet-lab phenotype module — **private tier only**, never published.
- JBrowse-style coordinate view; BLAST box (needs a server, so probably an external link).
