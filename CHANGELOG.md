# Changelog

Data versions are stamped into `data/meta/manifest.json` as `data_version` and shown in the
site footer. A data version changes only when the *contents* of `data/` change.

## Fixed — every Phytozome link on the site was broken

The constant behind both links pointed at `report-gene/` with no genome segment at all
(`https://phytozome-next.jgi.doe.gov/report-gene/<id>`), which 404s for every gene -- it was
never a valid URL on the current site. Replaced with the real pattern,
`.../report/gene/<genome-id>/<gene-id>`, and the three genome-id slugs verified by actually
navigating to each rather than guessed: `PtremulaxPopulusalbaHAP1_v5_1`,
`PtremulaxPopulusalbaHAP2_v5_1` (confirmed against Phytozome's own reported genome IDs, 717
and 716), and `Ptrichocarpa_v4_1` for the cross-species ortholog link (found via Phytozome's
own genome picker after a first guess at the slug 404'd -- not assumed from the pattern of
the other two).

**Added a second link**: "View in genome browser," to Phytozome's JBrowse instance at this
gene's own coordinates, with the track set Chen already uses day to day
(`Transcripts,Alt_Transcripts,PASA_assembly,Blatx_BasalMalvidae,Blastx_protein,RNAExpression`)
rather than a guessed-at default. Verified byte-for-byte: `URLSearchParams` reproduces the
exact percent-encoding of a known-working example URL before trusting it in the codebase.

`check.mjs` gains a check that reads the actual `href` values of all three link kinds (own
gene report, cross-species ortholog report, genome browser) on both a HAP1 and a HAP2 gene
page -- a wrong destination renders identically to a right one, so only the href itself
proves it.

## Mirror view — the locus-map plan's section 2.2, shipped 2026-09-08

The two-strand, haplotype-native view: the syntenic HAP2 locus drawn flipped to face its
HAP1 counterpart, with ribbons between allele pairs. New card on the gene page, right below
Locus, rendered only for a gene that itself has an allele partner (a gene with none has
nothing to anchor the view on).

No new data build. Reuses the same locus tiles the Locus card already fetches -- which
already carry each gene's allele-partner id -- plus the ordinary per-gene shard lookup
(`getGene`) to resolve a partner's own position, structure and Ks. Ribbon crossing (a local
inversion) and copy-number asymmetry are not detected by special-case code; they fall out
for free from mapping each side by its own true coordinate, the same "let the data draw
itself" approach as the rest of this project's figures.

**A hemizygous gene reads as a gap, honestly.** The two haplotypes are independently
assembled genomes with no shared coordinate system, so "an empty slot on the other strand"
(the plan's own phrase) is drawn as simply no ribbon reaching that gene, rather than a
fabricated shared axis pretending to align two different physical sequences. Verified
against a real case: `PtXaTreH.12G001200`'s neighbourhood runs into a confirmed HAP1-only
stretch (checked against the PAV layer's own `confirmed` flag before treating it as a good
test case), and the card correctly reports "9 with none" alongside the 8 that do have a
partner.

**Deliberately not drawn**: tandem-array brackets grouping array members into one visual
unit. The ribbon view already shows a size mismatch as an uneven ribbon count landing in a
shorter span; a dedicated bracket is a follow-up, not silently pretended here.

**A real caching trap, worth recording.** The card worked when called directly in the
console but did not appear on the actual page after a hash-only navigation, a full
`index.html` reload, and even a brand-new tab -- all three still showed the pre-existing
site with no trace of the new module. Root cause, confirmed by fetching the same URL with
and without `cache: 'no-store'`: the browser's ordinary HTTP cache was serving a stale
`registry.js` left over from earlier in this same long-lived session, and modules imported
by a stale file are never fetched at all, so the new file's own correctness was never in
question. Fixed by serving from a fresh port with no cache history, not by changing any
code -- worth remembering for the next feature added in this same browser session.

**Checks.** `check.mjs` gains three: the card renders on a gene with a fully-resolved
neighbourhood, renders on a gene whose neighbourhood has genuine hemizygous gaps and reports
them in its own count, and a driven click on the OTHER haplotype's strip actually navigates
to a real gene on that haplotype -- 44/44 total pass. Screenshots reviewed for a fully-paired
neighbourhood, a neighbourhood with real gaps, and the phone layout (no horizontal scroll,
the same reduced flank the Locus card already uses on narrow screens).

## Genome map — the locus-map plan's section 2.4, shipped 2026-09-07

Semantic zoom from all 19 chromosomes down to one chromosome's genes, then a click hands
off to the already-shipped locus card for the final resolve. New route `#/map`, new nav
link, reuses data the locus-card work (0.3.5) already built for exactly this purpose
(`data/locus/overview.json`, `data/locus/index/{hap}/{chr}.json`) -- no new data build.

**Overview tier**: one horizontal strip per chromosome, drawn to its own physical length
(a real ideogram proportion, not 19 equal bars), coloured by a selectable 100kb-bin
density -- gene count, tandem fraction, LSG-pool fraction, or mean τ. Click a chromosome
to zoom in. **Chromosome tier**: one tick per gene at its true coordinate, coloured by
duplication class with the same palette and the same convention as the locus card. Click
a gene to open its page.

**Reused, not duplicated, the locus card's canvas machinery.** The palette-resolution
helper (`fillFor`/`palette`, the fix for canvas fillStyle not resolving CSS custom
properties) moved to a new `js/core/palette.js` so the locus card and the genome map read
the exact same colours and can never drift apart -- a direct instance of the plan's own
"one renderer" principle. The DPR/ResizeObserver fitting discipline is reused as a small
`makeStage()` helper rather than copy-pasted a second time.

**WGD-block and syntenic-run overlays are NOT drawn at the chromosome tier.** The plan's
own section 1.3 flagged that data layer as unmeasured and not yet built; this ships the
two tiers the existing data supports rather than silently promising a third. The
chromosome-view caption says so explicitly and points back to the gene page's locus card,
which already carries allele and duplication-array relationships today.

**A design mistake caught by rereading my own code, not by the render suite.** A first
draft wired hover state through by directly reconstructing the canvas context and
re-invoking the draw function inline, bypassing the stage's own hit-test bookkeeping --
harmless here only because tick positions do not move with hover, so it happened not to
surface as a visible bug, but it was still wrong and would not have stayed harmless
through the next change. Rewritten so the stage exposes two real entry points,
`refresh()` for a resize and `redraw()` for a pure repaint, and both render tiers use only
those. **A second bug the render suite DID catch**: the chromosome-view check initially
asserted the word "genes" appears in the page text, which can never pass -- that count is
drawn inside the canvas, like the locus card's own captions, and canvas text is invisible
to `innerText`. Fixed the check, not the (correctly working) feature.

**Checks.** `validate_data.py` gains four: `overview.json` covers both haplotypes, every
overview chromosome has a matching per-chromosome index file, the two independently-built
files agree on gene count per chromosome, and every gene an index file names is a real
atlas gene -- 30/30 pass. `check.mjs` gains three, including one that drives the full
chain: load the overview, click a chromosome, confirm the chromosome view rendered, click
a gene tick, confirm the browser actually navigated to that gene's real page -- 39/39
pass. Screenshots reviewed for the overview (both haplotypes) and one chromosome zoom.

## 0.3.9 — 2026-09-06

**Added — LSG evidence-quality flags, per gene (TODO 23)**
The site has long carried a general-purpose prose warning that a young phylostratum is
not proof of a young gene. This makes that warning specific: a per-gene "Evidence
quality" line on the phylostratigraphy card, sourced from the ms2-lsg agent's already
Chen-approved `sources/lsg_qc_flags.tsv.gz` (1,725 rows, the LSG pool only -- the other
62,235 genes render nothing here).

A gene can carry: a Salix tblastn hit that contradicts the young call outright; an
abSENSE verdict, rendered as its own string (not collapsed into a yes/no gene-age claim),
with an explicit caution note wherever the flag is `detection_failure_plausible` -- an
ancestral homolog could exist and be undetectable at this sensitivity, which is not the
same claim as "the gene is old"; a minimum Ks in the salicoid-WGD era, meaning it may be
an ohnolog rather than a novelty; a contested orthogroup slot from an independent
12-genome OrthoFinder rerun; a short ORF, a known annotation-artifact class; or (10 genes
only) a flag that the chapter's headline result changes if this one gene is excluded.

**Three constraints enforced, not just followed, because this is a public page over
chapter-adjacent data.** (1) Flags, not filters -- nothing here changes which genes are
in the published pool (842 HAP1 + 883 HAP2), and the card has no filter control that
could. (2) Two fields must never reach the site: `qc_survivor` and
`in_idesia_corrected_pool` silently encode an Idesia polycarpa pool correction Chen has
not adopted (it would move the pool to 776/835; the chapter still cites 842/883).
`patch_lsg_qc.py` asserts both are absent from the source file's own header before
reading a row, and `validate_data.py` gains a check that searches every shard's
serialized `qc` record as text for either name -- not a fixed key list a future rename
could slip past. (3) abSENSE speaks to the reliability of the age call, not the gene;
enforced by rendering its verdict field directly rather than re-deriving a boolean.

**Checks.** `validate_data.py` gains three (no forbidden field on any shard, every `qc`
record sits on an actual pool gene, manifest count matches the shard count) -- 26/26
pass. `check.mjs` renders a flagged gene and a clean gene, then separately loads a page
and searches its full rendered text for either forbidden field by string, independent of
the two content checks -- 35/35 pass. Screenshots reviewed for both.

## 0.3.8 — 2026-09-06

**Fixed — the "missing" duplication and PAV sources were never actually missing (TODO 21)**
The 2026-09-05 audit's `docs/DATA_AUDIT.md` and this file's own `TODO.md`/`HANDOFF.md`
claimed the canonical `tier1_floor` PAV table and `master_duplication_table_v6.csv` were
absent from the ms1-dup mirror. Checked directly instead of trusted, and both are present,
under names the audit never searched for: `hemizygous_pav_diamond.csv` (PAV) and
`master_duplication_table_v9.csv` (duplication -- v6 is itself superseded by v9, so
chasing the file this TODO literally named would have imported an already-stale table).

**Duplication moved from v8 to v9 -- and 0 genes actually changed.** Checked before
assuming: the atlas's existing `dupclass_membership_v8.csv` source had already been
carrying the adopted WGD rule 5c letters (byte-identical from the v8 freeze, per that
table's own build history) and the current TD union set (6,663/6,385 tandem genes,
matching the canonical numbers exactly) despite its name. The swap is kept anyway --
provenance should point at the table that is actually canonical, not one whose own name
and this repo's own comments both claimed staleness that measurement showed was untrue.

**PAV/hemizygosity added for the first time.** Not a swap: the atlas has never shipped
this layer. `hemizygous_pav_diamond.csv` is a 6,092-gene candidate set (from an
asymmetric HAP1/HAP2 orthogroup), of which 805 HAP1 / 859 HAP2 are DIAMOND-confirmed
hemizygous -- exactly the numbers already cited elsewhere in this project as canonical.
Shown as a "Presence" card only on genes in the candidate set (no key at all for the
other ~58,000, same convention as ESMFold's coverage-limited layer): confirmed genes get
a plain verdict, unconfirmed ones name the contradicting DIAMOND hit and are captioned as
a likely detection gap in the original orthogroup call, not a confirmed absence.

**A real bug, caught by the render suite before it ever loaded a page.** The first draft
of the PAV card's nested ternary lost track of one closing parenthesis, which broke
`duplication.js`'s module parse -- and because ES modules fail atomically, every route on
the site went blank with a single `pageerror`, not just the duplication card. Rewritten
with intermediate variables instead of deep nesting specifically to make this class of
mistake harder to make, not just to fix this one instance.

**Checks.** `validate_data.py` gains three: tandem gene counts match the canonical union
totals per haplotype, PAV-confirmed counts match the canonical 805/859, and every
"not confirmed" PAV record's named target resolves to a real gene. `check.mjs` gains two,
a DIAMOND-confirmed gene and a not-confirmed one with a named contradicting hit, so a
swapped confirmed/not-confirmed branch cannot hide behind whichever case happens to
render. Screenshots reviewed for both.

## 0.3.7 — 2026-09-06

**Added — ComBat-seq batch-corrected values, opt-in per gene (TODO 18)**
TODO 18 had stood on a wrong premise: the shipped ComBat-seq matrix was believed to be an
older, incompatible gene generation and to need a fresh 63,960-gene rerun. Checked instead
of trusted, and it was wrong. Joining the two directly: **0 sample mismatches** (652 of 652,
exact 1:1 on the metadata's own `column` field, which already stores the matrix's
accession-style header verbatim) and **0 gene-naming mismatches** once the trailing
transcript-style suffix is stripped (`PtXaTreH.T003800.1` -> `PtXaTreH.T003800`). No rerun
needed; this is a local join, `scripts/build_combat.py`.

The real gap, 59,599 of 63,960 genes, is not a mismatch at all. Measured, not assumed: the
4,361 excluded genes have a median max-TPM of 0.84 across all 652 samples (91.2% never
exceed 5 TPM anywhere), against 26.73 (11.2% under 5 TPM) for the 59,599 included --
consistent with a low-count filter ahead of the original ComBat-seq run, which needs count
signal to fit its model, not with an incomplete or differently-versioned gene set.

**Offered per gene, not as a site-wide feature.** A gene without a ComBat value has nothing
to show, so the toggle is present only when the shard carries `x.cb` -- there is no
disabled state or "not available" message, since either would imply a value that does not
exist. Wired as a source toggle (Raw / ComBat-corrected) above the existing By
condition / By sample tabs, swapping which vector feeds both, rather than tripling the tab
count. Labeled explicitly as a cross-study comparison view: raw TPM stays primary
everywhere else on the site, per the existing caution that batch is confounded with tissue
for roughly 70% of the 652 samples.

**Checks.** `validate_data.py` gains three: the manifest's `combat_eligible_genes` count
matches the shards carrying `x.cb`, every `x.cb` pointer resolves to a real bucket entry,
and no ComBat-eligible gene lacks a raw baseline. `check.mjs` drives the toggle on a known
eligible gene (confirms the rendered numbers actually change, not just that the button
exists) and confirms the toggle is absent on a known ineligible one. A first draft of the
check used an unscoped `#view tbody tr` selector and silently graded the promoter card's
table instead of the expression profile's -- caught because the two source's values came
back identical, not because the selector looked wrong. Fixed by giving the profile's own
container a stable id (`#expr-profile`) rather than guessing a more specific CSS path.

## 0.3.6 — 2026-09-06

**Added — the promoter / CRE card**
Every gene page now shows its 1 kb promoter's GC content, TATA-box status, and a
transcription-factor-family motif strip, from the ms2-lsg agent's genome-wide JASPAR scan
(reviewed before ingestion: 63,960/63,960 genes matched the atlas exactly, family sums equal
the stored totals, and its `tata_core` rate over the LSG pool reproduces the dissertation
chapter's own `promoter_ness.tsv` to six decimals on both haplotypes).

Deliberately NOT a bare pass-through of the source columns:
- Two family names that read as specific cis-elements in the source (`ABRE_bZIP`,
  `DREB_ERF`) are TF-family groupings, not confirmed cis-regulatory elements, and are
  renamed at ingestion to `bZIP` / `AP2_ERF` -- the family names -- so the card cannot
  imply "this promoter has an ABRE" from a PWM hit to a bZIP-family matrix.
- Bars are normalized per matrix (hits ÷ matrices-in-that-family), not raw counts, because
  the families are built from 17 to 73 matrices each and the hit threshold is a fraction of
  each matrix's own score -- a family with more matrices racks up more hits for reasons
  that are about the matrix library, not the gene.
- `cre_LFY` is dropped entirely: identically zero for all 63,960 genes (one 19bp matrix
  that never clears the length-biased threshold anywhere in the genome).
- TATA is rendered as two DIFFERENT facts, not one: whether a canonical TATA box sits in
  the core promoter (−45..−20bp), versus a TATA-like hexamer found elsewhere in the window,
  which is not the same claim. **A bug in the first draft of this card inverted the
  distance** (reported "122 bp upstream" for a match that was actually 878bp upstream) --
  caught by checking a known tata_core=True gene against the raw data before trusting the
  rendered text, not by the render-check suite, which only asserted the text existed.

**Added — a search results page for ambiguous queries**
The header search dropdown can show an id and one line of description: enough to recognise
a gene you already know, not enough to pick the right one out of many (searching "kinase"
returns 4,351 genes; "MYB" and "dehydrin" return dozens of paralogs sharing one description).
`#/search/<query>` now shows the columns that actually distinguish paralogs -- synteny
class, duplication class, chromosome, phylostratum, peak tissue, τ -- side by side,
paginated 40 at a time. The dropdown gains a "N results — compare them all →" link when a
query has more matches than it can show; Enter on an ambiguous query (more matches than the
dropdown shows) goes to this page instead of blindly opening an arbitrary top hit.

One implementation lesson worth keeping: the comparison table's own horizontal-scroll
check (no page-level scroll) passed on the first try, and the page still looked bad on a
phone -- the table's DESCRIPTION column was wrapping every row onto 4+ lines instead of the
table scrolling sideways, turning a side-by-side comparison into a tall wall of text. A
global `white-space: nowrap` fix was tried first and broke the promoter card's family table,
which relies on its header wrapping to fit a phone. Scoped to a `.compare` modifier instead,
applied only to tables that need it. Caught by looking at the screenshot both times, not by
the scroll-width assertion, which was satisfied throughout.

**Checks**
`validate_data.py` gains three: every gene carries a `cre` record, family counts sum to the
stored total, TATA position lies inside the promoter window. `check.mjs` gains: the
promoter card on both a TATA-true and a TATA-false gene (so an inverted-branch bug like the
one above can't hide behind whichever case happens to render), and the search-refinement
flow end to end (dropdown → "compare them all" → paginated results).

## 0.3.5 — 2026-09-06

**Added — the locus card, and the data layer under it**
Every gene page now draws its neighbourhood: gene arrows with exon structure, forward strand
above the line and reverse below, coloured by duplication class, focal gene boxed. Built from
the v5.1 annotation, which lives in OneDrive rather than on Sapelo2 — so `scripts/build_locus.py`
runs off-cluster, unlike the rest of the build. Isoform choice is the annotation's own
`longest=1` flag, not a length recomputed here.

Three outputs sized for how they are fetched: per-megabase tiles (median 6.9 KB gzipped, the
locus card's only fetch), per-chromosome position indexes for the coming genome map, and a
100 kb-bin overview. Validated by merging abutting CDS/UTR segments into exons and comparing
against the exon counts the atlas derived independently on Sapelo2 from a different annotation
file: **63,960 of 63,960 agree, zero disagreements.**

**Fixed — the whole site scrolled horizontally on every phone**
Found while testing the locus card at 375 px, and it predates it: the header nav was one
unwrappable 502 px flex row, which set a 522 px minimum width for *every page on the site*.
Wrapping the nav, letting the search input flex, and giving the card grid `minmax(0, 1fr)` with
`min-width: 0` (a grid item defaults to `min-width: auto`, so the single widest card was
stretching all of them) removes it. Verified at 320, 375 and 393 px, and in landscape: no
horizontal page scroll on any route. Wide tables now scroll inside their own box, as intended.

Also fixed: the τ caption added in 0.3.4 joined tissue names with `/` and no spaces, making one
unbreakable 299 px token that overflowed a 320 px viewport. Now joined with ` / `.

**Mobile is now a designed target, not a media query**
The locus window shrinks on small screens (4 genes each side instead of 10) because genes are
tap targets and 21 of them across a 375 px phone gives 16 px each, under the WCAG 2.2 SC 2.5.8
floor — the view drops genes rather than silently clamping. Panning has always-visible 44 px
step buttons and arrow keys, since SC 2.5.1 Pointer Gestures is Level A and a gesture-only pan
would fail it. Canvas fitting follows DPR discipline: ResizeObserver on the container with the
canvas absolutely positioned inside it, `device-pixel-content-box` with the Safari try/catch
fallback, a guarded width assignment (assigning it resets all 2D context state), a synchronous
redraw, and a self-re-arming dpr watcher.

One bug the screenshots caught that the assertions did not: canvas `fillStyle` does not resolve
CSS custom properties, so `var(--c-tandem)` was silently invalid and every gene drew grey. The
palette is now read off the document and re-read when the theme changes.

**Checks**
`validate_data.py` gains four locus checks (every gene has exactly one tile entry, structure
lies inside the gene span). `check.mjs` gains two: the canvas is actually painted, the DPR
backing buffer matches, controls stay at 44 px, and a phone viewport does not scroll sideways.

## 0.3.4 — 2026-09-05

**Fixed — the expression baseline and tau pooled leaf_young + leaf_old into one "leaf" bucket**
`build_expression.py` grouped WT-control samples by the metadata's `tissue` column, which has
no finer distinction than "leaf" for 46 samples (all study 1: 23 young, 23 old). Silent, no
error, a plausible-looking mean: one manually-verified case moved from a single reported 8.12
TPM to two values 3x apart once un-pooled (leaf_young 13.74, leaf_old 4.52). The same bug
pooled the "By condition" replicate-mean drill-down and the study-1 sample table's Tissue
column, both of which grouped or displayed on the same coarse field.

Fixed by joining a new `tissue_analysis` field (`sources/sample_tissue_analysis.tsv`, derived
from MS1_2026's own curated 652-sample panel, sha256'd and dated in its sidecar) and grouping
on it everywhere the old code grouped on `tissue`: the gene-card baseline and tau, the
by-condition table, `studies.json`'s per-study tissue list, and the study-page sample table.
`TISSUE_ORDER` and the tau caption's tissue list were updated to match (9 tissues, not 8; the
caption now builds its list from the data rather than a second hand-written copy of it).

Corrected in place (no raw-source rebuild needed — the per-sample TPM vectors were never
wrong, only their aggregation): `scripts/patch_leaf_tissue_analysis.py`, verified gene-by-gene
against a hand computation before running genome-wide, patched all 63,960 gene shards'
baseline summary. `build_expression.py` is fixed at the source for the next full rebuild, with
a hard assert if any future sample lacks a `tissue_analysis` mapping — the exact failure mode
that caused this, so it is a stop, not a warning.

`validate_data.py` gained a check that every gene's baseline tissue set matches the manifest's
denominator table. `check.mjs` now asserts `leaf_young`/`leaf_old` appear on the module,
study-1, and the manually-verified gene page. Full account: `docs/DATA_AUDIT.md`.

## 0.3.3 — 2026-09-05

**Fixed — the audit removals had not actually reached the data**
The 2026-09-05 audit removed the PAV and n=202-tau layers from the build code and the UI, but
`build_layers.py` only ever ADDS keys to a shard. The values earlier runs had already written
stayed in `data/`, so the published JSON was still carrying both — invisible in the interface,
but present and downloadable. A full ordered rebuild purges them: 0 genes now carry `pav` or
`tau202`. This is exactly the failure mode `scripts/build_all.sh` now exists to prevent.

**Added**
- `scripts/build_all.sh` — all eight stages in the only order that yields a complete `data/`.
- `scripts/preflight.py` — verifies all 13 source groups before anything is written, and stops
  with an explanation on any machine that is not Sapelo2 rather than half-building.
- `docs/HANDOFF.md` — what a fresh agent on another machine cannot infer from the code.

**Verified**
- The build is deterministic: two consecutive full rebuilds produce byte-identical output for
  all 277 gene shards and every index file. Only `manifest.json` differs, by its `built`
  timestamp, which is intended.

## 0.3.2 — 2026-09-05

**Added**
- **P. trichocarpa syntenic ortholog** on every gene page, with an outbound Phytozome link —
  46,141 reciprocal 1:1 pairs, 6,329 flagged ambiguous, 11,490 genes with no syntenic hit.
  A Potri id is the key that unlocks PopGenIE and Phytozome for someone holding a 717 gene,
  which is the lookup a community visitor arrives wanting. Derived from this atlas's own
  GENESPACE run rather than an imported table, so it carries no external staleness risk.
  Ambiguous relationships keep their multiplicity instead of being resolved by a top hit.

**Fixed during development**
- Reciprocity was first computed over the pooled gene set, which counted the expected
  HAP1+HAP2 pairing of a phased diploid as ambiguity and collapsed the 1:1 set to 724 of
  52,470. Computing it within each haplotype gives 46,141.

**Deferred with a reason**
- The 377-sample P. trichocarpa xylem expression atlas is NOT joined in. Doing so would place
  TPMs from a different genome, annotation version and quantification pipeline beside this
  atlas's own values, inviting a comparison the numbers do not support. The ortholog link
  above lets a visitor make that jump deliberately, at PopGenIE, where the data belongs.

## 0.3.1 — 2026-09-05

Data audit. Chen flagged that some Sapelo2 outputs are stale; every ingested layer was
re-checked against what its source repo says about itself. Full verdicts in `docs/DATA_AUDIT.md`.

**Removed**
- **PAV / hemizygosity.** The available table is the orthogroup-based PAV call that ms1-dup
  explicitly tells readers not to use (it gives 2,356 / 2,117 and has an `n_ogs` column; the
  canonical DIAMOND `tier1_floor` figures are 805 / 859). The canonical table is not in the
  mirror, so the atlas ships no PAV layer rather than the wrong one.
- **Independent tau (n=202).** Computed on a panel the source repo records as superseded on
  2026-08-24.

**Replaced with locally derived equivalents** — each was offered by a table with no canonical
status, sitting in a case-study, calibration or "structural explorations" folder:
- Exon/intron counts, now from the v5.1 `gene_exons.gff3` (longest isoform).
- TE distance, now from the v5.1 repeatmasked GFF3, excluding simple and low-complexity repeats.
- Genomic order, now sorted from the atlas's own coordinates.

**Verified rather than repeated**
- The "coil is a pLDDT proxy" warning was checked against the table: r = −0.49 for coil vs mean
  pLDDT across 40,685 genes, against +0.16 for helix. The page now quotes the measured value.
- ESMFold usage confirmed inside the source's stated safe envelope: it says aggregate
  `helix_frac` is safe and long-run helix content is not, and the atlas serves only the former.

**Privacy pass**
- Tandem-array curation notes were shipping internal lab process to a public page: curator
  initials and dates (`cj_20260827`), verbatim quotes (`curator wrote: "no"`), and a named
  personal exception. Notes are now reduced to their meaning — "manually rejected during
  curation", "flagged pseudogene-like", "curated verdict disagrees with the automatic gate" —
  which is what a visitor can use. Zero shards now carry a curator identity or raw quote.
- Confirmed separately that LSG candidate labels (LSG1.14g, XO14gHAP2 …) appear nowhere in the
  shipped data or UI, so no candidate identity is public. The `lsg` flag is only PS ≥ 18,
  derived from the public genEra rank.

**Surfaced for Chen**
- ms1-dup's `CLAUDE.md` contradicts itself on the canonical expression panel: §B says n=202 was
  superseded by n=222 on 2026-08-24, §D still says "the current canonical n is 202". Line 197
  breaks the tie for n=222. Worth fixing so the next reader is not misled.

## 0.3.0 — 2026-09-05

Seven genome-wide computed layers ingested from the MS1 and MS2 analysis repos, and a new
protein module. Every gene now carries duplication class, TE proximity, gene structure,
HAP1:HAP2 pangene relationship, disorder, and mass-spec evidence.

**Added**
- **Duplication class**, genome-wide: salicoid WGD / ancient WGD / tandem / dispersed / none,
  from the MS1 duplication analysis. This closes the gap the module previously declared —
  it no longer has to say "no WGD ohnolog call exists".
- **TE proximity**: distance to the nearest transposable element, per superfamily.
- **New protein module**: predicted disorder (63,910 genes), ESMFold secondary structure and
  pLDDT (40,685, 64%), and peptide evidence from three independent mass-spec datasets kept
  separate — detection is strong evidence a predicted protein is translated, which is the
  sharpest credibility test available for a young lineage-specific gene.
- **Gene structure** (exons/introns) on the location card; LSGs are known intron-poor.
- **HAP1:HAP2 pangene relationship** including hemizygosity, shown on the allele card — and
  shown especially when there is NO allele, since hemizygosity usually explains why.
- **Neighbourhood co-expression** (k=5, k=10) on the expression card.
- **Organelle-homology warning**: 362 genes have plastid/mito homology, a real false-positive
  source for novel-gene claims.

**Added (batch 2)**
- **Tandem array identity**: which genes share an array, from ms1-dup's hand-curated union set
  (13,663 genes, 4,371 arrays) — which that repo explicitly says supersedes its own v8 tandem
  tables. Carries array size, median Ks, age bin, pseudogene flags and the curator's verdict.
  This closes the "array identity is not resolved" gap the module used to declare.
- **Perturbation responsiveness**: median |log2 fold-change| across eligible contrasts
  (49,289 genes).
- **Independent tau** from a separate 202-sample panel, shown BESIDE the atlas's own
  652-sample value rather than replacing it — two panels, two answers, and their agreement is
  itself informative.
- **Previous/next gene navigation** along the chromosome, from genomic rank order.

**Not ingested, deliberately**
- `master_duplication_table_v4.csv` is superseded: it still carries the `W_excluded` category
  that ms1-dup's own CLAUDE.md says was eliminated in v5. The canonical v6 master is not
  present in this mirror, so the v8 membership file — whose A/S/T/D/C legend is confirmed by
  ms1-dup `RESOURCES.md` — is the most current per-gene duplication call available, with the
  tandem component taken from the union set above.

**Guarded**
- Duplicate source rows are collapsed only when the columns actually ingested agree. The
  proteomics tables repeat 5,024 genes that are both a `conserved` gene and an LSG's
  `matched_control`, and `PtXaAlbH.14G133000` appears twice under two canonical labels
  (LSG1.14g and XO14gHAP2). Measurements agree in every case; a disagreement is fatal.
- Coil fraction is flagged on every gene page as largely a pLDDT proxy, not evidence of
  disorder — the easiest misreading of the structure table.
- Where the duplication class says "none detected" but paralogs are listed, the card explains
  that the two rows answer different questions rather than leaving an apparent contradiction.

## 0.2.1 — 2026-09-04

**Added**
- Study pages render the full sample metadata that `samples.json` already carried: tissue,
  treatment, genotype, growth condition, control/perturbation role, layout, reads, alignment
  rate and per-sample processing notes.
- Expression gene card gains a **By condition** view: replicate means per experimental
  condition, grouped by study, alongside the existing per-sample strip. For LSG4.5g in study
  27 bark this reads as drought 78.4 vs control 43.0 in WT — the question a reader actually
  has, which 652 individual dots do not answer.
- Duplication module (see below) and its checks.

**Corrected**
- Condition grouping uses the metadata fields, not a `_repN` suffix strip. Study 27 encodes
  replicates as `DR1/DR2/DR3`, so label-parsing split all 72 of its samples into singleton
  "conditions". Metadata grouping gives 204 groups with a median of 3 replicates.
- `check.mjs` assertions were case-sensitive against `innerText`, which returns RENDERED text.
  Since `table.data th` is `text-transform:uppercase`, asserting "% aligned" could never match
  "% ALIGNED" — two checks failed against a page that was correct.

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

- Browse / query builder: filter all 63,960 genes across synteny, phylostratigraphy,
  expression and annotation at once, over a 274 KB facet index rather than the 250 MB of
  shards. Named gene sets and TSV export. Filtering `private_no_ortholog` ∩ PS ≥ 18 returns
  923 genes, independently reproducing the step-7 report's LSG-pool figure (275 + 648).
- `scripts/validate_data.py` grew facet checks, including a sampled cross-check that facet
  values equal the gene shards they were derived from.

**Corrected**
- PAML reports `omega = 99.0` where it cannot estimate the ratio — the 716 pairs whose
  Ks is 0. Previously this would have rendered as extreme positive selection. Now nulled,
  with the pair flagged as "identical at synonymous sites".
- One pair carries `=`/`w` sentinels for Ks and Ka but a numeric omega of 0.0000, which
  displayed as "strong purifying selection". Dropped.

- The facet index encoded "no orthogroup" (0 genomes) as missing data, so 1,575
  OrthoFinder-unassigned genes displayed as "—" in the browse table instead of "none".

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
