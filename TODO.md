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
  - [x] **7e — DONE, all three.** `expressed-in` needed a facet column, so it got one: a 10-bit tissue mask (one integer, +0.25 MB raw over 63,960 genes, not ten columns), with the bit ORDER carried in the facet file's own vocab so the client cannot drift from the builder. The >1 TPM threshold is in the filter's LABEL, because a filter that hides its cutoff invites reading "expressed" as absolute. 53,704 genes clear it in at least one tissue; 10,256 in none.  Superseded note: Browse carries `tau_min` (τ ≥) and `top` (peak tissue), both live and now reachable by deep link. **`expressed-in` does not exist** — there is no filter for "expressed above X TPM in tissue Y", and the facet index carries no per-tissue value to build one from (it stores τ and the single peak tissue only). So this needs a facet column, not a UI change, and it is not closed. Checked against `js/core/browse.js`'s FILTERS rather than assumed.
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

- [x] **25 — DONE 2026-09-12: the helper exists, and it immediately found a fourth instance.** `scripts/check_aggregates.py` recomputes every shard-derivable manifest aggregate and diffs it; it is a `build_all.sh` step. It found `summary.ps_rank` stale in every stratum, which had the live home page showing the withdrawn 1,725 against every other page's 1,611.  Original note: The genome map had been colouring the WITHDRAWN LSG pool for two days — 104 stale bins in `data/locus/overview.json`, because `build_locus.py` is an OneDrive-only stage that could not run after the 2026-09-10 pool correction. It rendered fine, validated fine, and was internally consistent; no check compared it against the shards it summarises. What caught it was writing a recompute-and-diff gate, which is exactly the helper this item anticipated. The generalisable rule: **any aggregate that a Sapelo2-unreachable stage owns is stale by default after any patcher touches its inputs**, and the only defence is recomputing it from the shards and diffing. Original note: **the checks cannot see a value that is stable and wrong.** Both defects above
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

- [ ] **33 — HyPhy selection tests (`lsg_selection/`). ASSESSED, not a layer.** The 98-task
      array finished 2026-09-10 00:17. Not ingested: 98 genes / 34 complete matched pairs is a
      pilot, and its own power covariate separates the arms (tree length, Cliff's delta +0.643,
      p 4.8e-07 — the focal arm has nearly twice the median branch length). Every readout is
      downstream of that and the analysis is visibly still working through it. Revisit if it
      scales to the pool and matches on tree length rather than reporting it. Item 29's Ka/Ks
      already answers the same question at 52,232 genes.

- [ ] **32 — pangenome presence across 31 genomes. STILL BLOCKED 2026-09-10.** Annotation-free
      tblastn of pool + matched control against 31 *Populus*/Salicaceae assemblies — presence
      that does not depend on any annotator's ORF policy, which is the known weakness of the
      synteny layer. `pang_tblastn` / `pang_tbsoft` / `pang_hap1self` were still running on
      2026-09-10 and a concurrent session owns that directory. Pool-scoped (~3,400 queries), so
      it lands as a card like `qc`, not as a facet.

## v0.7 — a 3D model on every modelled gene page

- [x] **34 — per-gene ESMFold structure viewer. BUILT 2026-09-10, data 0.5.0, on branch
      `chen-structure-viewer` — not merged; merging to `main` is the public deploy.** 40,685
      models, 94.1 MB in 2,577 buckets. See CHANGELOG 0.5.0. Two corrections to the plan below,
      both found by the build: (i) the gate is exact string replay of the source table, not
      "to stored rounding" -- both tolerance versions failed, correctly; (ii) no helix/strand
      shapes -- 3Dmol's default cartoon draws NOTHING for a Calpha-only model (caught by
      screenshot after a canvas-exists check passed three blank canvases), so the trace style
      is used and DSSP moved to the hover readout. `check.mjs` now counts painted pixels per
      pLDDT colour, with a negative control reading 0.00%.
      Feasibility measured 2026-09-10 on a
      400-model random sample of the 40,686 PDBs in `/scratch/ch29576/foldseek/results/hap{1,2}/esmfold/pdbs`:
      full-atom is 9.4 GB raw / **2.3 GB gzipped — over GitHub Pages' 1 GB published-site cap
      on its own** (`data/` is already 560 MB). A Cα trace is 0.31 GB even as gzipped PDB text,
      and ~0.1 GB or less as a packed binary. So: **ship a Cα trace coloured by pLDDT, with
      per-residue DSSP secondary structure**, not the full-atom model. The pLDDT colouring is the
      honest companion of the card's existing "coil tracks model confidence" warning: 97% of the
      PS>=18 pool has mean pLDDT < 70, and a young gene's model should *look* like a guess.
  - [x] **34a — source.** `scripts/make_structure_source.py` (Sapelo2, sbatch array, the
        `esmfold_cor` env for pydssp): per gene, Cα xyz at 0.01 nm, CA pLDDT, sequence, and
        per-residue pydssp c3 with the SAME backbone parser as
        `sequence_features/scripts/ss_content.py`. Writes `/scratch/ch29576/atlas_structure_ca/`
        (outside the repo -- `sources/` is published by Pages) + a sidecar
        `sources/structure_ca.provenance.json` with a sha256 over the PDB listing. One PDB is 0 bytes
        (`PtXaTreH.08G115400`) and is absent from the SS table too; it stays absent.
  - [x] **34b — gate, then write.** `scripts/patch_structure.py` refuses to write unless the
        per-residue arrays reproduce what the atlas ALREADY publishes for every one of the
        40,685 genes: `ss.n` exactly, `ss.plddt` / `ss.low` / `ss.h` / `ss.e` to their stored
        rounding. Writes `data/struct/<hap>/<Chr>/<n // 2500>.bin.gz` buckets (rule mirrored in
        `patch_structure.py`, `js/core/data.js`, `validate_data.py`), and `manifest.structure`.
  - [x] **34c — viewer.** 3Dmol.js 2.5.5 (BSD-3) vendored under `js/vendor/`, loaded only when a
        reader clicks "Show 3D model" — no third-party script on page load. pLDDT bands
        (>90 / 70-90 / 50-70 / <50, the AlphaFold DB convention) go in `palette.js`; hover gives
        residue, amino acid, pLDDT; the card states it is a Cα trace and not the full model.
  - [x] **34d — checks.** `validate_data.py`: every gene with `prot.ss` has a bucket entry and
        none without; `check.mjs`: open the viewer on a confident gene and on a PS>=18 gene,
        assert a canvas and zero console errors. Screenshots looked at, both themes.
  - [x] **34e — release.** VERSION / CHANGELOG / CITATION bump; commit on a branch, push, and
        leave the merge to `main` (= the public deploy) for Chen.
  - [ ] **34f — Chen: merge `chen-structure-viewer` to deploy.** Before merging, note `main`
        moved while this was built (another session committed TODO edits); rebase first.
        Also worth doing once: open one model on a phone -- the checks run desktop viewport only.

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

## Candidate layers from the ms2-lsg RNA-seq fusion test (noted 2026-09-10, NOT started)

Source: ms2-lsg PR #19, `analyses/piggyback_rnaseq_junctions/` (94 paired-end libraries,
5.6 billion unique alignments, both haplotypes, corrected 776/835 pool). Held until Chen
decides and PR #19 is reviewed. Ingest the usual way: `sources/` + provenance sidecar, a
`patch_*.py` that gates on re-deriving the PR's own published summary, then `build_facets.py`.

- [ ] **RNA-seq gene-model evidence: possible split model.** 1,435 adjacent pairs (2,629
      genes) carry 3+ spliced reads joining an exon of one gene to an exon of its neighbour;
      40 pairs (79 genes) show the exact splitter signature (junction = the intergenic gap).
      Floor is 0 across 21,070 opposite-strand pairs, so the flag is specific. Show as an arc
      in the locus view and a gene-card note. FLAG, NOT FILTER. 11,322 same-strand pairs were
      too shallow to test: absence of the flag must not read as "confirmed separate".
- [ ] **Intron support per gene.** Annotated introns seen / total across 94 libraries. 89% of
      multi-exon genes have all introns seen; LSGs 52.6% all, 37.2% none. Confounded with
      depth (below ~20 reads, detection < 27%), so it must ship beside the gene's read count
      and the power curve, or it reads as evidence against LSG gene models.
- Not worth shipping: read-pair spanning and gap occupancy (weak, not elevated against the
  matched control); per-base coverage (6.6 GB of BAM slices, wrong for a static site).

## v0.6 — make every page earn its place (Chen's review, 2026-09-11)

The review's organising complaint: several module pages are dead ends that show bars and stats
with no second layer, and Browse — "the key thing of this site" — is the page that deserves the
attention instead. So the umbrella decision for 1.1-1.6 is **not** "delete the pages": it is that
**every overview chart becomes a launcher into Browse with its filter already applied**. A
stratum bar, a synteny class, a duplication code, a map bin: click it and you are in Browse
looking at those genes. That turns five dead ends into entry points to the thing that works, and
only what still has no second layer after that gets folded into About.

- [x] **35 — DONE.** `router.js` gained `query()`/`setQuery()` (replaceState, so recording filters does not re-enter the router and rebuild the view), Browse seeds from the URL, writes back, and exports `browseHref()`. An exact-stratum filter was added because a ladder bar means ONE stratum, not `>=`.
      `js/core/router.js` has no query support today (`location.hash` only) and `browse.js`
      never reads URL state, so a chart has nothing to link to. Add `#/browse?ps_min=18&cls=...`,
      parsed into the existing `state.values`, and have Browse write its filters back to the URL
      so a filtered view is shareable and bookmarkable. Then every overview chart gets
      click-through. This is the load-bearing item; 39, 40 and part of 36 depend on it.

- [x] **36 — DONE.** Rows lead with the paper's title and first author, the whole row is clickable, BioProject and DOI are separate links, and the serial number is gone from the first column.  Old text: The studies table's first
      column is the study *number* as a small `mono` link — the only way in. Lead with what a
      study IS (tissues, design, n, citation), make the whole row a link, and let a tissue or a
      panel type launch Browse. Keep the page: it has a real second layer already (28 study
      pages), it was just hidden behind a number.

- [x] **37 — DONE.** Per-residue pLDDT, Kyte-Doolittle hydropathy and the DSSP track on one shared residue axis, loaded on demand, so a low-confidence stretch and a hydrophobic stretch can be seen to be the same stretch or not. No disorder track: disorder exists only as a per-gene mean on disk, and the card says so rather than implying the tracks are exhaustive.  Old text: Now unblocked: the 3D viewer merged
      at 0.5.0, and its buckets already carry per-residue pLDDT, DSSP state and the amino-acid
      SEQUENCE. So per-residue curves need no new data — pLDDT, hydrophobicity (Kyte-Doolittle
      from `seq`) and the DSSP track can be drawn on one shared residue axis, which is exactly
      the "do the contradictory properties overlap" question. Note honestly that predicted
      disorder is only a per-gene mean (`dis`, `disf`); there is no per-residue disorder on disk
      (checked: `predicted_disorder_genomewide.tsv` is gene-level), so the curve panel must not
      imply one.
  - [x] **37a — DONE.** Shipped, with the number that matters on the card: 54,264 of 59,698 (gene, dataset) pairs have NO 717-specific peptide and 51,585 have no peptide unique to the gene. A gene now says whether its evidence is gene-specific, species-specific, both or neither.  Old text: `sources/peptide_detail.tsv.gz` is BUILT and gated
        (59,698 rows, 1.97 MB, per-dataset detected-gene counts reproduce the owning analysis's
        `aspen_dataset_meta.json` for all five datasets). It answers the review's question --
        "how one 717 gene was assigned peptide evidence in another genome, and how reliable" --
        and the answer is uncomfortable enough to be worth showing: on the deepest dataset,
        **94.2% of peptides that map to a 717 gene are also present in the P. trichocarpa
        proteome**, and **only 11.9% map to a single 717 gene** (median 2, max 142). So for most
        genes "detected" rests on a peptide that is neither species-specific nor gene-specific.
        Ship per gene per dataset: n peptides, n PSMs, best hyperscore, how many peptides are
        unique to this gene, how many are absent from trichocarpa, and up to three example
        peptides with those flags each.

- [x] **38 — DONE.** dS-by-phylostratum panel deleted (and its now-dead `ksChart` with it), 'Nearest TE 0 bp' now says 'overlaps this gene', and the Presence/PAV card moved to sit beside the allele card in Annotation.  Old text:
      Remove "Synonymous divergence by phylostratum" — Chen is right to distrust it. It bins a
      stratum-selected paralog subset's dS by the gene's phylostratum, which is the exact
      misreading the same page warns about two cards below, and its own caption already concedes
      it is "a sanity check on the pairing, not a dating result". A sanity check belongs in a
      run log, not on a public page. Also: "Nearest TE 0 bp" reads as missing data when it means
      a TE overlaps the gene — say that. And move the **Presence** (PAV) card out of Duplication;
      presence/absence between haplotypes belongs beside the allele card, not under duplication.

- [x] **39 — DONE.** Every stratum bar and every synteny class links into Browse pre-filtered.  Old text:
      Both are one stat row plus one bar chart. With 35 in place the bars become the second layer.
      On Chen's doubt about the synteny panel links being "context and panel dependent and I am
      not sure how valuable this would be in the long term to maintain": the atlas already says
      so in About ("Private calls are panel-dependent"), so the honest move is to keep the links
      but stop presenting the 12-genome presence strip as if the panel were a fixed fact.

- [x] **40 — DONE, and it found a stale layer.** Three overlays added (mean omega, peptide-detected fraction, ortholog open chromatin), each with its own denominator stated on the page because a colour ramp hides that. `scripts/patch_map_overlays.py` recomputes the 100 kb bins from the shards and gates the four existing metrics against the shipped file first.
      **The gate caught that the map was colouring the WITHDRAWN LSG pool**: 104 bins had a
      stale `lsg` count, because `build_locus.py` is an OneDrive-only stage and has not run
      since the 2026-09-10 pool correction. Corrected here. Two further per-bin differences
      were diagnosed rather than waved through: `tau` differs by 0.001 in two bins (summation
      order), and `n` differs in two bins because `PtXaAlbH.11G039800` starts at 7,699,999 in
      the shards and 7,700,000 in the GFF3 -- shards carry BED 0-based starts, the GFF3 is
      1-based, so it falls either side of a bin edge. The gate is now the per-chromosome gene
      total, which is the invariant that would actually catch a reconstruction error.  Old text: The map already has a metric `<select>` and
      click-to-drill, so it is not inert — but four density metrics is thin at genome zoom.
      `data/locus/overview.json` is 100 kb bins of `[n, tandem, lsg, tau]` computed from the
      SHARDS (`build_locus.py` reads the OneDrive GFF only for coordinates and exon structure),
      so the bins can be recomputed on Sapelo2 without that tree. Add omega, peptide-detection
      rate and ortholog-chromatin fraction as overlays.

- [x] **41 — DONE.** Card is now 'Expression across the neighbourhood' and the tab 'Expression along the locus'; a legend states the real scale and range of whatever was just painted; colliding contrast labels carry the differing factor in brackets; and the page explains that the flag means primary-versus-secondary design factor, not quality.  Old text:
      Three separate fixes.
      (i) "Scrubber" is jargon borrowed from video editing — rename the module and its tab.
      (ii) Chen asks why so many contrasts say "not recommended" and whether to just remove them.
      **Measured before deciding: do not remove them.** `recommended` is not a quality score, it
      is exactly "kind is treatment or genotype" (62 + 55 = 117) versus
      `additional_condition`/`growth_condition` (48 + 26 = 74), and **zero** of the 74 duplicate a
      recommended contrast. They are secondary design factors (CO2 level, recovered vs not), not
      junk. The real defect is different and worse: **57 label collisions** where two genuinely
      different contrasts render as the same string, differing only by a nested factor that the
      label drops — every one of the 57 is fully disambiguated by the suffix after `_vs_` in its
      id, which the UI throws away. So: fix the labels, group by kind, default to the primary
      contrasts with a toggle for the rest, and say what the flag means instead of the bare
      phrase "not recommended".
      (iii) Add the legend and scale bar the card currently lacks entirely.

- [x] **42 — DONE.** The card is now headed 'This locus on HAP2 too' rather than 'Mirror', and its tab reads 'Both haplotypes'.  Old text: Chen asks whether
      the locus card can show the HAP2 syntenic region. It already does, as a separate card called
      **"Mirror"** — which is the problem. Rename it to say what it is (the HAP1<->HAP2 syntenic
      neighbourhood) and point to it from the Locus card, rather than building a second one.

- [x] **43 — DONE.** Removable filter chips plus 'Clear all', widgets now reflect a URL-seeded filter, and the MS and omega caveats sit directly under the table where the numbers are read.  Old text: Browse is the page the
      review calls the key thing, and the peptide column arrived there with no statement of how
      indirect it is. Add active-filter chips, a visible result count against the total, and put
      the proxy statement where the number is read — the Browse column header and the protein
      card — not only in a provenance sidecar.

- [x] **44 — DONE.** 1,933,839 positions over 63,907 genes; 44 withheld and labelled as such. The ingest gate caught a family-renaming mismatch (`build_cre.py` renames three families on purpose) before anything shipped.  Detail: Pilot on 600 genes: family-size gate
      PASS, and 589/600 reproduced the shipped counts with every disagreement confined to the
      `other` bucket. At full scale 45 of 63,960 genes disagree on a NAMED family, and all 45
      are in the same direction -- this scan finds MORE hits, never fewer -- which is the
      predicted 1 kb-versus-3 kb boundary effect: with no upstream window there is no earlier
      candidate to suppress an overlapping hit in the global greedy pass. **Decision: ship
      positions for the 63,915 genes that reproduce exactly and exclude the 45**, so positions
      can never contradict counts already published. Exclusions recorded in
      `excluded_genes.tsv`.  Old text: Chen asks for
      "sticks on the promoter region, who is closer who is farther". The shipped source carries
      family COUNTS only, so this needs a rescan — and everything needed is on the cluster: the
      JASPAR file, the 1 kb promoter FASTAs (ids are bare gene ids, 32,137 + 31,823, matching the
      atlas gene set exactly), and the upstream scan's exact algorithm, which already computes
      `dist = L - i`, bp from the TSS to each motif's 5' edge. That IS the position.
      **One real risk, to be measured and not assumed:** upstream scans the **3 kb** FASTA with a
      *global* greedy non-overlapping pass, and only the 1 kb FASTA is on the cluster, so a motif
      straddling the 1 kb boundary could be resolved differently. The pilot re-derives per-gene
      family counts from the 1 kb file and compares them to the shipped contract file. Ship only
      what the comparison justifies; if the disagreement is real, either regenerate the 3 kb
      windows or restrict to genes that reproduce exactly. Do not ship positions that cannot be
      reconciled with the counts already published.

- [x] **45 — DONE, differently than planned.** The module pages earned their place by becoming Browse launchers, so nothing needed folding away. About instead gained the one thing no module page showed: a per-layer COVERAGE table with what an absent value means in each layer.  Old text:
      Receives the residual stats from 38/39 as a "genome-wide summary" section, so numbers worth
      keeping are kept in one place instead of padding five pages.
