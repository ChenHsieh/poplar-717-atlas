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

## v0.6 — the 2026-09-10 source sweep (see `docs/DATA_AUDIT_2026-09-10.md`)

Twelve analyses moved on Sapelo2 between 2026-09-08 and 2026-09-10. Two of them do not add a
layer, they **qualify a layer this atlas already publishes on a live public site** — those go
first, ahead of anything new.

- [x] **26 — SHIPPED 2026-09-10, data 0.4.0.** The pool the atlas serves (842/883,
      frozen 12-species panel) was **withdrawn upstream on 2026-09-09** and replaced by
      776/835 (`docs/CORRECTIONS.md` C2, marked ADOPTED by Chen). Source
      `pipeline/out/lsg_pool_idesia.tsv.gz` carries `rank` and `frozen_rank` side by side, so
      **show the correction, do not silently swap it**. 179 genes move PS19 -> PS18 and stay in
      the pool; none move the other way, so the site's "hybrid-only" label is currently wrong
      for a fifth of the PS19 arm. Ship `rank`, `frozen_rank` and the two movement flags; keep
      `canonical_label` / `group` out — those are the 10 embargoed candidate names (TODO 22's
      hold, unchanged).

- [x] **27 — SHIPPED 2026-09-10.** `qc.hdf` / `qc.verdict` ship
      today with no statement of how well calibrated they are. Now measured: nominal 99%
      prediction intervals cover 87-88% globally but only **0.610 / 0.594 at *Salix purpurea***,
      the boundary species every pool flag is predicted at, with a **+19 bitscore bias in the
      direction that over-calls `surprising_absence`**. And that is the optimistic bound — it is
      in-sample, on genes that have a *Salix* homolog and therefore are not LSGs. Nothing is
      retracted; the number has to travel with the flag.

- [x] **28 — SHIPPED 2026-09-10.**
      `prot.ms` currently holds a Tier-1 result whose negative is uninformative by construction
      (a 717-specific peptide could never appear in a table built from another species'
      database). Tier 2 re-searched the raw spectra against a database that contains the 717
      proteins, across five public *Populus* datasets, genome-wide, 1% peptide+spectrum FDR.
      Ship it **with the per-gene detectability denominator** — without it "not detected" and
      "could not have been detected" render identically.

- [x] **29 — SHIPPED 2026-09-10.** 52,232 genes (81.7%) with omega against reciprocal-best
      *P. trichocarpa* orthologs, NG86 and YN00. The atlas's only selection-adjacent number
      today is HAP1<->HAP2 dS, which compares two haplotypes of one clone. PS19 has **no**
      omega at all (0 of 343 / 0 of 338 have any ortholog) — render that as a stated absence,
      not a blank.

- [x] **30 — SHIPPED 2026-09-10, data 0.4.1.** Deferred at first for the right reason, then
      re-read and shipped under a framing that removes it. The analysis runs ENTIRELY INSIDE
      *P. trichocarpa* -- peaks called on trichocarpa leaf, scored against trichocarpa gene
      starts -- so this is a property **of the ortholog**, and the card says so in words rather
      than once in a footnote. That sidesteps the promoter-synteny assertion that the first
      reading worried about: nothing here claims to describe the 717 gene's own promoter.
      Reaches 45,869 genes (71.7%) through the reciprocal 1:1 map, attached only where the
      ortholog call is 1:1 -- an ambiguous ortholog is not a licence to take a top hit.
      `ex` (expressed in leaf) gates every mark, because the data is leaf-only and a silent
      gene correctly carries no promoter mark; showing four zeros there would read as an
      absence of regulation. Gated on the source's own published numbers: the 81.5% conserved
      leaf-expressed H3K4me3 rate its gate turns on, and all eight cells of its effect table. Real
      reprocessed peak calls exist for 34,140 *Potri* loci and the atlas owns the 1:1 ortholog
      join. Deferred because a promoter is a *positional* feature: carrying an ATAC call across
      an ortholog edge asserts promoter synteny that the ortholog call does not establish. Same
      reasoning that closed TODO 20's expression join, plus that. Unblocks on a syntenic
      promoter check per pair, or on chromatin data for 717 itself.

- [ ] **31 — PS19 triage scores (PSAURON / PlantCAD2). STILL DEFERRED, and the reason changed.**
      26 has landed, which was the stated blocker, but it made the mismatch concrete rather
      than removing it: the source tables cover 451 HAP1 + 430 HAP2 genes, the pre-correction
      PS19 set, of which 179 are now PS18 and some are out of the pool entirely. The scores
      themselves are per-gene and stratum-independent, so they stay valid gene by gene; what
      does not survive is the *decoy floor*, which was built for that specific set and is what
      makes "beats the floor" mean anything. Needs the floor re-cut against the corrected
      membership upstream, not a re-join here. Sound layer,
      but keyed to a PS19 membership that item 26 changes by a fifth.

- [ ] **32 — pangenome presence across 31 genomes. STILL BLOCKED 2026-09-10.** Annotation-free
      tblastn of pool + matched control against 31 *Populus*/Salicaceae assemblies — presence
      that does not depend on any annotator's ORF policy, which is the known weakness of the
      synteny layer. `pang_tblastn` / `pang_tbsoft` / `pang_hap1self` were still running on
      2026-09-10 and a concurrent session owns that directory. Pool-scoped (~3,400 queries), so
      it lands as a card like `qc`, not as a facet.

### What landing 26-29 actually taught, kept because it generalises

- **A source repo's own correction log is a layer this atlas depends on, and nothing was
  watching it.** The pool was withdrawn upstream on 2026-09-09 and the site kept serving the
  withdrawn one until this sweep found it four days later. Every check passed throughout,
  because they all check the atlas against itself. Worth a periodic read of
  `ms2lsg_wt_proteomics/docs/CORRECTIONS.md` rather than waiting for the next sweep.
- **Class-level agreement can hide per-gene disagreement.** NG86 and YN00 omega agree on every
  class median to within 0.06 and correlate at r = 0.07 to 0.36 gene by gene. A summary table
  would have shown nothing wrong. An atlas is a per-gene resource, so a per-gene check is the
  one that counts — compare against an independent estimate of the same quantity, not against
  the same pipeline's own summary.
- **`zip()` in a validator is a silent truncation.** The facet check compared columns with
  `zip`, so any column added to the builder and not to the validator would have been checked
  against nothing. Two columns were added this release. Assert widths before comparing values.
- **The cheapest real check is "does my roll-up reproduce the number its owner published".**
  Both new source tables are gated that way, 84 cells and 11 cells. The Ka/Ks gate failed 5
  cells on the first run; the cause was a factor-of-two double count in the published table's
  own keying, found by looking rather than by loosening the tolerance.
