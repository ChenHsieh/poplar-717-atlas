# Plan: locus map, genome map, and a less conventional way in

**Written:** 2026-09-05. **Status:** proposal, nothing built. Companion to
`PLAN_v0.5_correctness_and_wetlab.md` (which owns correctness, sequences, contrasts) and to the
CRE task handed to the ms2 agent (`ms2-lsg/pipeline/PLAN_genomewide_cre_for_atlas.md`).
Decisions marked **[Chen]** are Chen's.

Every number below was measured today on the real files, not estimated from memory. Where
something could not be measured off-cluster it says so and names the one command that would.

---

## 0. What this plan is answering

Two asks, one design:

1. **Nearby genes, repeats, and elements** for any gene, in a locus-map or genome-browser style.
2. **A way to explore this data that is not the usual stack of dropdowns and tracks.** More
   direct, more immersive, and honest about what the data can support at its scale.

The second ask constrains the first. The usability literature on genome tools is consistent: the
failures are navigation and search, not rendering, and biologists read in-line, figure-like
drawings (a gene arrow with its introns, the way a locus appears in a paper) more readily than
stacked tracks (Genome Explorer, mSystems 2024; Bioinformatics usability analysis, 2008). So
the locus view is drawn the way a Results figure draws a locus, and the whole-genome view is a
map you zoom, not a track list you configure.

---

## 1. What the data can carry, measured

### 1.1 Already in the shards, per gene, no new build needed

`chr`, `start`, `end`, `strand`; `ord` (previous/next gene, both haplotypes); `allele` (the
HAP1 to HAP2 syntelog with Ka/Ks); `dup` (A/S/T/D/C letters, tandem array id); `te` (nearest TE
distance per superfamily); `gs` (exon and intron **counts**, not intervals); `x` (tissue medians
over WT controls, tau, top tissue, bucket pointer); `resp` (perturbation responsiveness); `nb`
(co-expression with the 5 and 10 nearest genes); `para` (family paralogs with dS); `ps`, `syn`,
`pres`, `ptri`.

Two things matter for a locus view here. Expression buckets are **in genomic order**, 250 genes
per bucket, so a 50-gene window touches at most two bucket files. And `nb` already quantifies
"does this gene co-express with its neighbours", which is the single most interesting thing a
locus view can show and no browser I know draws.

### 1.2 Buildable locally, off-cluster

The v5.1 gene annotation is in OneDrive (`03_resources/bioPoplar Genome Files/
PtremulaxPopulusalbaALL_v5.1.gene.named.gff3`, 180 MB): 63,960 genes, 130,254 mRNAs,
853,601 CDS, 166,127 five-prime and 144,137 three-prime UTRs. Chromosomes are named
`Chr05_H1` / `Chr05_H2`, a one-line rename to the atlas's `Chr05` plus haplotype.

Measured on Chr05_H1 (2,051 genes, 22 one-megabase tiles): 4,201 mRNAs, 26,597 CDS, 10,055
UTRs. Longest-isoform structure as compact `[start, length]` integers comes to about 279 KB raw,
roughly 70 KB gzipped for the whole chromosome, **about 3 KB gzipped per 1 Mb tile**. Scaled to
the genome that is 2 to 3 MB total, fetched only as tiles the user actually looks at. This is
small. Gene structure is not the constraint.

Also buildable locally: **syntenic runs between haplotypes**. Walk `ord` on HAP1 and follow
`allele` links; consecutive genes whose alleles are also consecutive on HAP2 form a colinear run.
That gives block-level ribbons for a mirror view with no GENESPACE re-run. Intra-genome WGD
blocks are also available: the anchor table (`wgd_anchor_pairs_v8_reordered_20260902.csv`)
carries `multiplicon` and `chrpair` per anchor pair.

### 1.3 Not available off-cluster, and the one measurement that gates it

**Repeat intervals.** The atlas reduced the repeatmasked GFF3 to nearest-TE distance per gene.
A locus view needs the intervals themselves, and the GFF3 lives only under `/work/cjtlab` on
Sapelo2. Nothing local carries intervals; MS1's `data/32_te_proximity_threshold/` holds
per-gene distances and pair tables, not repeats. The volume is unmeasured. Expect hundreds of
thousands to low millions of intervals per haplotype for a 40 percent-repeat genome, which is
why this layer needs level of detail (section 3) and a real number before committing to tile
sizes. The first Sapelo2 command of this plan is a feature count per chromosome of that file.

**CRE positions.** The contract handed to the CRE agent yields motif **counts** per gene, which
is right for the gene card. A locus view wants **positions** along the 1 kb promoter to draw
ticks. That is a small addendum to the contract (a second file, `gene_id, family, offset`),
not a redesign. **[Chen]** decide whether to relay it now or wait for the first deliverable.

### 1.4 Scale summary

| layer | volume | fetch unit | size |
|---|---|---|---|
| gene positions, whole genome | 63,960 rows | per chromosome, per haplotype | ~50 to 150 KB gz each |
| gene structure (longest isoform) | ~440k CDS+UTR intervals | 1 Mb tile | ~3 KB gz |
| repeats | unmeasured | 1 Mb tile plus 100 kb density bins | TBD (spike R2.1) |
| expression along a locus | 652 values per gene | existing 250-gene bucket | already shipped |
| syntenic runs | derived | per chromosome | small |
| CRE positions | ~64k promoters | 1 Mb tile | small |

Nothing here strains a static host. The design freedom is real.

---

## 2. What to build, four views on one canvas

The views share one renderer, one coordinate system, one URL scheme, and one way of picking
things up (the existing GeneSet store). They differ in zoom level and in what is emphasised.

### 2.1 Locus card: the figure-style neighbourhood (ships first)

On every gene page, replace the "neighbours on the chromosome" line with a drawn locus: the gene
and its neighbours across a window of, by default, 10 genes each side or 100 kb, whichever is
smaller. Drawn like a manuscript locus schematic, not a track:

- Gene arrows with exon boxes and intron lines from the structure tile. Strand by arrow
  direction. Fill by duplication class using the site's existing class tokens; tandem array
  members bracketed as one group with the array id.
- Below the genes, repeats as low hatched blocks by superfamily, collapsed to a density strip
  when more than a threshold per pixel.
- The 1 kb promoter as a faint box upstream of each gene; CRE family ticks inside it once the
  positions file exists.
- Co-expression arcs from the focal gene to neighbours it co-expresses with, weight from `nb`.
- Hover shows a one-line card (id, description, class, top tissue). Click navigates. Left and
  right arrow keys walk the chromosome, which the `ord` chain already supports.

This alone answers ask 1 for the common case and costs two tile fetches.

### 2.2 Two-strand mirror: the haplotype-native view

The only public resource that knows both phased haplotypes should show them together. Below the
HAP1 locus, draw the syntenic HAP2 locus flipped to face it, with ribbons between allele pairs.
What becomes visible with no extra analysis:

- A hemizygous gene as an empty slot on the other strand (the PAV layer from the correctness plan,
  now drawn instead of tabulated).
- Tandem array copy-number asymmetry as a longer bracket on one strand.
- Local inversions as crossed ribbons.
- Ka/Ks as ribbon shade, so a diverged allele pair reads darker.

Data: `allele`, `ord`, positions, and the colinear runs from 1.2. Feasible today. Haplotype
colours should follow the lab convention, HAP1 `#0072B2`, HAP2 `#E69F00`, added as tokens.
**[Chen]** confirm those over the site's current palette.

### 2.3 Expression scrubber: paint the locus by condition

A strip of the 10 tissues, and a second strip of the perturbation contrasts grouped by treatment
family. Drag along it and the genes in the locus repaint by median TPM or log2 fold change. Watch
a tandem array light up in xylem and go dark in leaf. The data is already in the two bucket
files the locus fetched, so this is pure client work. It is also the most direct answer to the
wet-lab question "does anything around my gene respond to the same thing".

### 2.4 Genome map: semantic zoom from 19 chromosomes to one gene

One continuous canvas per haplotype, navigated like a map:

- Zoomed out: the 19 chromosomes as bars, painted by a chosen density (genes, repeats, tandem
  arrays, LSG pool, mean tau) from 100 kb bins. Any GeneSet, or any typed query (2.5), overlays
  as dots at their coordinates, so "drought-induced tandem arrays" is a picture of where they
  sit, not a table.
- Scroll to zoom into a chromosome: WGD blocks and syntenic runs appear as coloured segments.
- Keep zooming: the locus card of 2.1 resolves in place, with 2.2 and 2.3 available.

Ensembl's new browser proves the chromosome-to-base continuum works and is what users now
expect; it does it in Rust and WebGL. This data is two orders of magnitude smaller than a
vertebrate genome with variation, and Canvas 2D handles it: 64k gene rectangles is trivial, a
1 Mb tile of repeats is a few thousand rectangles. No framework is required, which keeps the
site's no-build rule intact. `d3-zoom` from a CDN is acceptable for the transform math alone.

### 2.5 Query as a sentence, not a form

Replace the browse page's dropdown grid as the primary entry with a single typed line that
becomes chips as you type: `tandem` `HAP1` `tau ≥ 0.85` `up in leaf under drought`. Autocomplete
from the facet vocabulary the site already has. Results land in the GeneSet store, appear on the
genome map, and export as before. The dropdowns stay as an "advanced" fold for people who want
them. The facets index needs one added column, `start`, to place every gene on the map instantly;
that takes it from 1.8 MB to roughly 2.3 MB, already a lazy load.

### 2.6 Deliberately not proposed as features

Hilbert-curve and Circos whole-genome views. Both are legitimate and gilbert shows a Hilbert map
can zoom from genome to base. For a 19-chromosome plant genome with a two-haplotype story, the
linear map is more legible and the mirror view is more distinctive. They are research spikes in
R1, not roadmap items, and they are dropped unless the spike shows something the linear map
cannot.

Also not proposed: adopting Gosling.js or igv.js as the primary renderer. Gosling embeds without a
server but requires React, ReactDOM, Pixi.js and HiGlass through an import map, several
megabytes, and imposes track semantics. igv.js is one file and loads JSON features statically,
which makes it an excellent **escape hatch**: a "classic browser" toggle for users who want
tracks, at near-zero cost. It is not the front door.

---

## 3. Data engineering: tiles, indexes, checks

Layout, following the site's existing "the gene id encodes its own shard" habit, extended to
coordinates:

```
data/locus/overview.json                   per 100 kb bin, per chr, per hap: gene n, repeat frac,
                                            tandem n, LSG n, mean tau        (~50 KB)
data/locus/index/{hap}/{chr}.json          gene positions + class + array + tau + top
data/locus/structure/{hap}/{chr}/{mb}.json longest-isoform exon/CDS/UTR intervals, [start,len]
data/locus/repeats/{hap}/{chr}/{mb}.json   repeat intervals, [class, start, len]
data/locus/repeats/density/{hap}.json      100 kb repeat fraction, for the zoomed-out map
data/locus/synteny/{hap}/{chr}.json        colinear allele runs; WGD blocks from multiplicon
data/locus/cre/{hap}/{chr}/{mb}.json       promoter hit positions, once the CRE addendum lands
```

Level of detail is the rule that makes repeats safe: above a zoom threshold the client reads the
density file, below it the tile. The threshold is set from the R2.1 measurement, not guessed.

Build: a new `scripts/build_locus.py` reading the local GFF3 for structure and positions, the
shards for everything else, and `sources/repeats_*.tsv.gz` once the Sapelo2 reduction exists.
It is one of the stage-0 reductions the correctness plan already calls for, so it rides the same
frozen-source pattern.

Checks, extending the two suites that already run in CI:

- `validate_data.py`: every gene's `start` falls in exactly one structure tile; every tile's gene
  set equals the index's genes for that megabase; overview bin totals sum to 63,960.
- `check.mjs`: render one locus at three zooms and the mirror view for one known syntenic block,
  assert the focal gene id and at least one neighbour id appear, no console errors.

URL state: `#/locus/hap1/Chr05:14057758-14158801` and `#/map/hap1` with zoom in the hash, so
every view is a link someone can paste into a lab notebook.

---

## 4. Research plan: creativity with a stopwatch

Four phases, each with an output that is a file, not a feeling.

### R1. Precedent teardown, 1 to 2 days

Take apart, in each case asking "what interaction idiom is this, and what does it cost":

- Genome tools: Ensembl beta (continuum zoom, WASM), gilbert (Hilbert map), SynVisio and
  AccuSyn (synteny ribbons, side-by-side genome and block views), Genome Explorer (in-line
  drawing), JBrowse 2, igv.js, Gosling (grammar, semantic zoom), WashU GenomeAlign track.
- Outside genomics: map apps (tiles, semantic zoom, the "you are here" pin), infinite-canvas
  tools (Figma's pan and zoom feel), scrollytelling for a narrated locus, command palettes for
  the query line.

Output: `docs/research/idioms.md`, a matrix of idiom by cost by fit, and a short steal list.

### R2. Feasibility spikes on the real data, 2 to 3 days

Throwaway code under `prototypes/`, each with a measured number written next to it:

1. **Repeats volume.** One `awk` over the repeatmasked GFF3 on Sapelo2: intervals per
   chromosome per class. Decides tile size and the density threshold. Blocks nothing else.
2. **Structure tiles.** Build `data/locus/structure/hap1/Chr05/*.json` from the local GFF3 and
   render 2 Mb in Canvas 2D. Record fetch bytes and frame time while panning. Target: under
   16 ms per frame, under 20 KB per view.
3. **Mirror view.** Chain allele runs for Chr05 and draw one syntenic block with ribbons. Record
   how many runs, how long, and how many genes fall outside any run (those are the interesting
   ones).
4. **Expression scrubber.** One locus, fetch its two buckets, repaint by tissue on drag. Record
   the time from drag to repaint.
5. **Query line.** Tokenise three example sentences against the facet vocabulary and place the
   hits on a chromosome bar. Record the size of facets plus `start`.

### R3. Two-person usability check, 1 day

Tasks on the paper mock and the R2 prototypes, with CJ and one wet-lab member, timed:

1. Find the neighbours of a given gene and which of them share its top tissue.
2. Find the HAP2 copy of a gene and say whether the two alleles differ.
3. Find tandem arrays on Chr14 whose members respond to drought in leaf.

Navigation and search are where the literature says these tools fail, so the tasks are all
navigation and search. Output: `docs/research/usability_r3.md`, times plus quotes.

### R4. Decide and record, half a day

Three architecture decision records: tiling scheme and LOD threshold (from R2.1), renderer
(Canvas 2D custom versus a library, from R2.2), URL and state scheme. Then the build order.

Total research budget: about a week of focused work before any production code.

---

## 5. Build order after research

| step | what | depends on |
|---|---|---|
| 1 | `build_locus.py` for positions and structure from the local GFF3; validate checks | nothing on Sapelo2 |
| 2 | Locus card (2.1) with genes and structure; arrow-key walking; URL state | 1 |
| 3 | Expression scrubber (2.3) | 2, buckets already shipped |
| 4 | Repeats reduction on Sapelo2; density and tile layers | R2.1 |
| 5 | Mirror view (2.2) | 1, allele chaining |
| 6 | Genome map (2.4) with overview bins and GeneSet overlay | 1, 4 |
| 7 | Query line (2.5); facets gain `start` | 6 |
| 8 | CRE ticks in the promoter box | CRE addendum delivered |
| 9 | igv.js classic toggle as escape hatch | 1, cheap |

Steps 1 to 3 need no cluster access and could ship as a data version on their own.

---

## 5b. Mobile is a first-class target, and it changes the design

Not a responsive afterthought. Two decisions below change what gets built, not how it is
styled. Grounded in the phone-shell material under `~/.claude/skills/mobile-web-shell`; note
that skill assumes a *pinned full-screen game*, and the atlas is a *scrolling document*, so the
`100svh` pinned-shell treatment is deliberately NOT adopted. Canvas fitting, touch targets and
input alternatives are.

### 5b.1 The locus window must shrink on small screens

Genes in the locus card are tap targets, so WCAG 2.2 SC 2.5.8 (AA) sets a **24 CSS px** floor
`[spec]`; Apple HIG says 44pt and Material 48dp for comfort `[platform guidelines]`. The
arithmetic against real viewports:

| viewport | usable width | 21 genes | 11 genes | 9 genes |
|---|---|---|---|---|
| iPhone SE, 375 px | ~343 | 16 px ✗ | 31 px ✓ | 38 px ✓ |
| iPhone 15, 393 px | ~361 | 17 px ✗ | 33 px ✓ | 40 px ✓ |
| laptop, 1280 px | ~1100 | 52 px ✓ | — | — |

**So the default window is viewport-dependent: 10 genes each side on desktop, 4 each side on a
phone**, with a "wider" control that pans rather than shrinks. This is the skill's option (a),
serve a smaller board on small viewports, chosen over silently clamping — which "looks fine in a
screenshot and fails in the hand". `fit()` returns a `clamped` flag and the view reacts to it
rather than swallowing it.

Corollary: **repeats and CRE ticks are not tap targets on mobile.** They are visual context
only, freeing them from the 24 px floor, and they collapse to a density strip earlier on a
narrow screen.

### 5b.2 Every gesture needs a button (Level A, not optional)

WCAG 2.2 SC 2.5.1 Pointer Gestures is **Level A**: path-based gestures must have a
single-pointer alternative unless the path is essential, and here it is not. Pinch-to-zoom and
drag-to-pan on the genome map are therefore *supplementary*. Shipping alongside them, always
visible:

- zoom in / zoom out buttons, ≥44 px
- step left / step right along the chromosome (the `ord` chain already does exactly this)
- a "jump to gene" field

Keyboard arrows cover the same alternative on desktop. Test the way the skill prescribes: turn
gesture handling off entirely and complete a full navigation task with taps only.

### 5b.3 Layout follows the thumb, not the fold

Bottom third of a phone is lowest effort but **occluded by the thumb** (~25 mm contact patch
plus the finger body); centre is where taps land most accurately `[Hoober 2013; NN/g]`. Layout
for the locus and map views on portrait:

| band | content |
|---|---|
| top ~15% | gene identity, breadcrumb. Nothing reactive |
| middle ~15–70% | the canvas. This is the precision zone |
| bottom ~30% | zoom/step controls, the tissue scrubber. Nothing you must read while touching |

The scrubber (2.3) belongs at the bottom specifically *because* it is dragged and its result is
read above the finger.

### 5b.4 Canvas discipline, the same code path everywhere

One `fit()` driven by a `ResizeObserver` on the **container**, with the canvas
`position: absolute` inside it so canvas size cannot feed back into container size and trigger
the RO loop error. Not from `innerHeight × devicePixelRatio`.

- `device-pixel-content-box` in a `try/catch`, falling back to `contentBoxSize × min(dpr, 2)`
  — Safari has never implemented the former and passing the unknown enum *throws*
  `[caniuse, 2026-01]`. The fallback is the path every iOS visitor runs, so it gets tested
  specifically.
- Guard on an actual dimension change: assigning `canvas.width` wipes the bitmap **and** resets
  all 2D context state, even when set to the value it already has `[spec: HTML]`. Redraw
  **synchronously** in the observer callback or every address-bar collapse flashes blank.
- A self-re-arming `matchMedia('(resolution: Ndppx)')` watcher, because a content-box observer
  does not fire when only dpr changes.
- `ctx.setTransform(dpr,0,0,dpr,0,0)`, never `ctx.scale()`, which multiplies and compounds.
- Hairlines at half-pixel offsets; cap dpr at 2 for fill rate.
- Hit-test through `getBoundingClientRect()` ratios, never `offsetX` — correct under browser
  zoom, CSS transform and buffer resize in one formula.

Genes sit at arbitrary genomic coordinates, so the skill's *integer tile* rule does not transfer;
the DPR, observer and context-reset rules do.

### 5b.5 Touch and viewport hygiene

`touch-action: none` on the canvas **only**, `manipulation` on buttons; never global, which
would block pinch-zoom for low-vision users `[WCAG 1.4.4]`. No `user-scalable=no`, no
`maximum-scale`. Add `viewport-fit=cover` to the existing meta and wrap safe-area insets in
`max(12px, env(...))` so non-notched devices keep a gutter. `overscroll-behavior: none` on the
canvas container to stop pull-to-refresh firing mid-pan.

### 5b.6 Cellular data budget

Mobile visitors pay per byte. The locus card's own fetches are already cheap: two ~3 KB
structure tiles plus at most two expression buckets. The real cost is the **facets index, 1.8 MB
today and ~2.3 MB once `start` is added** — it must stay lazy, loaded only when the query line
or genome map is opened, never on a gene page. Same for `search.json`. Budget: **a gene page on
a cold cache stays under 250 KB total**, asserted in the verification step.

### 5b.7 Verification

Extend `check.mjs` rather than inventing a second harness: render the locus and map at
**320×568, 375×667, 393×852**, a landscape ~390×360, and at **dpr 1, 1.5, 2, 3**. Assert no
horizontal page scroll, every interactive control ≥24 CSS px (targeting 44), no console errors,
and the gene-page byte budget. A 320 px viewport and a fractional dpr are both in the matrix
because they are where this breaks first.

---

## 6. Constraints carried from the rest of the project

- No build step, no framework, vanilla ES modules. A small CDN library for zoom math is
  acceptable; a React and WebGL stack is not.
- Colour never the only carrier of meaning, every class swatch keeps its text label, Wong
  palette for categorical, HAP1 blue and HAP2 orange as in the manuscript.
- Reduced-motion preference respected; the map must work with keyboard and trackpad.
- Everything drawn here is already public-tier data. Nothing new is exposed; `noindex` stays.
- Per-sample grouping anywhere in the expression scrubber goes through `tissue_analysis`, not
  `tissue`, and through the grouping check that was added for exactly that reason.

---

## 7. Decisions that are Chen's

1. Relay the CRE positions addendum to the ms2 agent now, or after its first deliverable.
2. Haplotype colour tokens: lab convention or the site's current palette.
3. Spend one R1 day on Hilbert and Circos spikes, or skip them.
4. Default locus window: 10 genes each side, 100 kb, or whichever is smaller.
5. Whether the igv.js classic toggle is worth shipping at all, or whether it dilutes the point.
6. Mobile locus window: 4 genes each side is the arithmetic answer at 24 px; 3 each side would
   be comfortable at 44 px. Which floor do we design to?

## 8. What this plan does not do

- No allele-specific expression, no BLAST, no coordinate-level variant view. Unchanged from the
  correctness plan.
- No claim that repeats can be shipped until R2.1 produces a number.
- No production code before R4. The temptation is to skip the research; the site's own history,
  a pooled-leaf bug that passed every check, is the argument for not skipping it.
