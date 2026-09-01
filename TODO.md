# TODO

Ordered. Each line is a shippable increment.

- [x] **1 — repo + data build.** `build_data.py`, gene-ID→shard convention asserted against
      the annotation, 39 shards / 63,960 genes / 23 MB, `--tier full|public` flag.
- [ ] **2 — site shell.** Hash router, data loader with cache, module registry, `GeneSet` store.
- [ ] **3 — module: synteny.** 5-way class, n_genomes_in_og, orthogroup, HAP1↔HAP2 syntelog,
      old-vs-new diff + DIAMOND-sensitivity stability.
- [ ] **4 — module: phylostratigraphy.** genEra PS rank/stratum, LSG pool (PS≥18), unplaced
      genes (50 with rank NA), founder events. First charts — load the `dataviz` skill first.
- [ ] **5 — browse / query builder + gene-set cart + TSV export.** The cross-module payoff.
      Needs a virtualized table for 63,960 rows.
- [ ] **6 — module: duplication.** Tandem arrays, HAP1↔HAP2 dS (25,931 pairs from
      `synt_ks/syntelog_ks.csv`), paralog pairs, salicoid-WGD ohnologs.
- [ ] **7 — module: expression.** **BLOCKED** — `expression_hap{1,2}.tsv` (531 samples),
      `expression_samples.tsv`, `expression_tau.tsv` are in the OneDrive `tier3_input/` and are
      NOT on Sapelo2. Upload to `ms2_genespace/incoming/` as the synteny tables were.
      531 × 64k is too large for naive JSON — ship per-gene compact profiles + precomputed tau.
- [ ] **8 — publication surface.** Decide public vs local-only; if publishing, an Actions
      workflow that builds `--tier public` so unpublished data cannot reach the public site.

## Later / ideas

- Structure + embeddings module (foldseek, ESM-2) from `data/foldseek/`, `data/embedding_tour/`.
- Wet-lab phenotype module — **private tier only**, never published.
- JBrowse-style coordinate view; BLAST box (needs a server, so probably an external link).
