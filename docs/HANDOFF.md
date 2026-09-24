# Handoff

For whoever picks this up next, on any machine. Read this before touching `data/`.

## The operating rules

### 1. The build destroys before it creates

**`scripts/build_data.py` wipes and rewrites `data/genes/`. Later stages restore the fields,
indexes, blobs, and overlays that the site needs.** Running a writer alone can leave a plausible
`data/` tree with whole layers absent. Conversely, a stale key can survive until the next full
rewrite because patchers normally add fields rather than remove them.

Never run individual data writers. Use:

```bash
scripts/build_all.sh
```

That graph invokes `build_data.py --tier public`; `manifest.tier` must remain `public` for a
Pages artifact. Phylostratigraphic rank and LSG membership are intentionally public because the
rank makes membership inferable. Candidate labels and group names remain embargoed and are
rejected from the public artifact.

Before `build_data.py` can touch the existing shards, that command runs
`python3 scripts/check_stages.py`. The source-level gate requires `build_data.py` first,
`build_facets.py` last, declared dependencies before their consumers, and every `build_*.py` and
`patch_*.py` writer to be either a stage or an explicitly documented historical exception.
`make_*_source.py` generators are classified separately because they create reviewed source
artifacts, not final data.

### 2. No single machine may have every source tree

Core stages read Sapelo2-local inputs (`/scratch/ch29576`, `/work/cjtlab`); several stages read
the OneDrive `MS1_2026` tree on Chen's Mac. A host with both can run the complete build. Otherwise
the default command refuses to begin before it wipes anything. `--allow-partial` is the explicit
opt-in to a two-machine handoff:

```bash
# On the machine with the first available source set
scripts/build_all.sh --allow-partial
# Review and commit the changed data, then transfer that commit.

# On the machine with the remaining source set
scripts/build_all.sh --allow-partial
```

The second run skips only unavailable stages and rebuilds its own derived outputs, including the
final facet index. Do **not** publish after the first half. Once all stages have run, require:

```bash
python3 scripts/check_required_layers.py
python3 scripts/validate_data.py
```

`check_required_layers.py` is read-only and compares the current shards and artifacts with their
source-backed contracts: range blobs and offsets, source-backed shard fields, derived indexes,
structure buckets, and map overlays. It catches complete-but-absent layers that a field-level
validator could otherwise pass vacuously. `build_all.sh` runs it after a complete build; a partial
run reports whether it is still incomplete and intentionally skips the normal validation verdict.
If a tree is accidentally wiped, `git checkout -- data/` restores the committed release artifact.

### 3. Keep output reproducible and public release separate

Stage ownership proves that every writer is scheduled; it does not prove that the writer produced
the expected result. The required-layer gate and `validate_data.py` cover that second question.
When a stage changes the bytes it writes, check a clean rerun before committing.

Writers must sort inputs before serialising. In particular, `build_expr_ranges.py` sorts bucket
files and gene IDs, emits gzip members with a fixed timestamp, validates every staged member
against its source vector, and transactionally replaces blobs, shard offsets, and the manifest.
Only after that succeeds does it retire the raw and ComBat bucket trees. A malformed input or a
publication failure leaves prior outputs and the input trees intact. Run its source-free fixture
with `python3 scripts/test_build_expr_ranges.py`; it covers successful retirement, packed reads,
legacy-bucket fallback, and an injected rollback.

`make_wgd_pairs_source.py` and `make_duplicate_coexpr_source.py` read `x.co` from packed ComBat
blobs. They retain a strict legacy-bucket fallback so a source can be regenerated from a checkout
before packing, but bucket trees are not release assets.

## What this is

A public, static gene atlas for hybrid poplar clone INRA 717-1B4 — 63,960 gene models across
two phased haplotypes. **https://chenhsieh.github.io/poplar-717-atlas/** (private repo, public
site, `noindex` until the chapter publishes).

Two audiences pull differently: it is a companion to a dissertation chapter on lineage-specific
genes, and a general resource for anyone working in this clone. See `docs/ROADMAP.md`.

## Architecture, in three facts

1. **The gene ID encodes its own shard**, so there is no index file.
   `PtXaTreH.05G120200` → `data/genes/hap1/Chr05/4.json`, because genes are numbered in steps
   of 100 and the shard is `floor(number / 25000)`. One fetch, ~59 KB gzipped, zero lookups.
   The rule lives in **three** places that must agree: `build_data.py:shard_of`,
   `js/core/data.js:shardOf`, `validate_data.py:shard_of`. The build asserts it against the
   real annotation for all 63,960 genes.
2. **A module is one file** exporting `{id, label, geneCard, overview, filters}`, registered in
   `js/core/registry.js`. Modules never import each other; they meet only through the
   `GeneSet` store. Adding one touches a single registry line.
3. **No application build step or framework.** Vanilla ES modules and static JSON are served as a
   static Pages artifact. `.nojekyll` keeps Jekyll away from that tree.

## Before you trust a data source

A 2026-09-05 audit found real staleness. **Read `docs/DATA_AUDIT.md` before adding any layer.**
Its habit is the important part: check what the source repo says about *itself*
(`CLAUDE.md`, `RESOURCES.md`, `CANONICAL_NUMBERS_v8.md`, per-analysis READMEs) before ingesting.

Standing verdicts:

| | |
|---|---|
| **Do NOT ingest** | `hemi_pav_crosstab.csv` (orthogroup PAV — ms1-dup explicitly forbids it), `tau_n202_*` (superseded panel), `master_duplication_table_v4.csv` (carries the eliminated `W_excluded` class) |
| **Resolved 2026-09-06 (TODO 21)** | neither was actually missing. `hemizygous_pav_diamond.csv` (PAV) and `master_duplication_table_v9.csv` (duplication -- v6 was already superseded) were in the mirror under different names than this line searched for. Both wired in; see CHANGELOG.md 0.3.8. |
| **Read-only** | `ms2-lsg/pipeline/out/*.tsv` and `GOI_CANONICAL.tsv`, by Chen's standing instruction |
| **Never publish** | LSG candidate labels (the `LSG<n>.<chr>g` names and the XO group names) while the chapter is unpublished, and curator identity or verbatim curation quotes. `build_layers.py:sanitise_note` enforces the second. `validate_data.py` enforces the first over the shards AND every tracked text file, because until 2026-09-21 Pages served the whole repo root (scripts/, docs/, sources/, CHANGELOG.md), and the names, two of them next to a gene ID, sat in files the site served while the shard-only check passed. Pages now publishes the site files only; the scan stays as the second guard. Never write a label into this repo, not even in a check |

## Verification and release gates

A complete source build invokes the build graph, required-layer gate, ordinary data validation,
and project-specific aggregate, prose, version, and source-agreement checks in its defined order.
The public release path has an additional requirement: validate the exact staged Pages tree rather
than only the checkout.

```bash
# Read-only source/data gates
python3 scripts/check_stages.py
python3 scripts/check_required_layers.py
python3 scripts/validate_data.py
python3 scripts/check_version.py

# Reproduce the public artifact. Choose a path that does not yet exist.
SITE_DIR=/tmp/poplar-atlas-site-next-release
python3 scripts/assemble_site.py --output "$SITE_DIR"
python3 scripts/validate_data.py \
  --data-dir "$SITE_DIR/data" --source-root "$PWD" --scan-root "$SITE_DIR"
python3 scripts/check_site_artifact.py \
  --site "$SITE_DIR" --commit "$(git rev-parse HEAD)" --write-release
python3 scripts/serve_ranges.py 8931 "$SITE_DIR" &
node scripts/check.mjs
```

`assemble_site.py` reads both the allowlist and file bytes from Git `HEAD`, ignoring dirty
working-tree files, and refuses to reuse an output directory. Commit the candidate revision before
using it as a release preview. `check_site_artifact.py` then verifies the allowlist, rejects
hidden paths, symlinks, and unexpected files, requires `manifest.tier` to be `public`, checks the
900 MiB budget and zero failed data gates, and generates
`data/meta/site-release.json`. The generated record identifies the exact commit, data version,
file count, and content digest of the staged tree; it is not committed back into `data/`.

Use `scripts/serve_ranges.py`, never `python3 -m http.server`, for a browser check. The profile
loader requires an exact `206` range response; the standard local server ignores Range and returns
`200` with a full blob, which the loader rejects.

On pull requests and pushes to `main`, CI checks the version, assembles `_site`, validates the
staged data and release artifact, and runs the browser suite against `_site`. A successful
`checks` run on `main` is the only Pages trigger. The Pages workflow checks out that run's exact
SHA, repeats the staging gates and browser test, then uploads that same directory. Cluster-only
source builds and source-repository agreement checks remain outside CI.

`check_version.py` keeps `VERSION`, `data/meta/manifest.json`, `CITATION.cff`, and the newest
versioned `CHANGELOG.md` heading aligned. To release changed data, update the release metadata,
run the full build and gates, then stage the public artifact as above.

Three lessons already paid for:

- `check.mjs` asserts against `innerText`, which is **rendered** text. Assertions are
  case-insensitive because `table.data th` is uppercase — a styling rule should not decide
  whether a content assertion passes.
- A passing text assertion does not mean the page is right. The phylostratigraphy chart once
  rendered as stacked text with no bars at all while every check passed, because the bar CSS
  classes were missing. **Look at a screenshot after any visual change.**
- Neither check catches a value that is *stable and wrong*. 834 PANTHER accessions were
  labelled with one arbitrary member gene's subfamily name (PTHR13832 was shipped as both
  "PROTEIN PHOSPHATASE 1D" and "PROTEIN PHOSPHATASE 1K", depending on the build). Every check
  passed throughout. It was found by diffing two rebuilds against each other, which is worth
  doing after any change to a build script.

## Numbers that should stay stable

If a rebuild moves any of these, something changed upstream — find out what before shipping.

| quantity | value |
|---|---|
| gene models | 63,960 (HAP1 32,137 / HAP2 31,823) |
| `private_no_ortholog` | 1,642 |
| private ∩ PS ≥ 18 (browse query) | **923** (445 HAP1 + 478 HAP2), on the frozen call; matches the step-7 report's 275 + 648 |
| LSG pool = rank ≥ 18 in the frozen genEra call (Chen, 2026-09-21: it does not change) | 1,725 = 842 HAP1 (392 PS18 + 450 PS19) + 883 HAP2 (454 + 429) |
| pool genes at rank ≥ 18 in the rerun that added Idesia (a pass count, not a pool; `ps.rr`, `qc.rr`) | 776 HAP1 + 835 HAP2; 66 + 48 fall below |
| pool genes in the chapter's post-QC set (`qc.post`, passes all four checks) | 589 HAP1 + 625 HAP2 |
| HAP1↔HAP2 allele pairs | 51,862 |
| expression | 652 samples, 28 studies, 38 BioProjects |
| P. trichocarpa reciprocal 1:1 | 46,141 |
| tandem arrays | 13,663 genes in 4,371 arrays |

## Traps already hit, so you don't hit them again

- **PAML reports ω = 99.0 when it cannot estimate the ratio** — exactly the 716 syntelog pairs
  with Ks = 0. Publishing it reads as extreme positive selection. Nulled and flagged.
- **Reciprocity in a phased diploid.** A Potri gene hits one HAP1 *and* one HAP2 gene. Testing
  reciprocity on the pooled set counts that as ambiguity and collapsed 46,141 orthologs to 724.
  Compute per haplotype.
- **`fread` returns an empty field as `""`, not `NA`** (R side). Every `is.na()` control was
  vacuously false once, so a control "passed" without running.
- **HAP2's `annotation_info.txt` has empty Pfam/PANTHER/GO columns** for all 65,212 rows. GO is
  recovered from `h2.custom.GO`, Pfam only partly from deflines (3,222 vs HAP1's 26,132). The
  gene card says so, because otherwise it reads as biology.
- **Coil fraction is largely a pLDDT proxy** — measured r = −0.49 across 40,685 genes, against
  +0.16 for helix. Serve `helix_frac`, never `max_helix_run` (the source README forbids it).
- **`du` under-reports on this Lustre mount.** Use `find -exec stat -c%s` for real sizes.
- **GENESPACE livelocks on Lustre.** Stage 4 forks one worker per genome pair and the metadata
  server serialises them: 0 of 45 pairs in 82 minutes. Run on `/lscratch`; 59 minutes, exit 0.

## Where things live

| | |
|---|---|
| Site source | repo root — `index.html`, `js/`, and `css/` |
| Public artifact | a fresh `_site` streamed from Git `HEAD` by `scripts/assemble_site.py`, validated by `scripts/check_site_artifact.py`, and deployed only from a successful `checks` run on `main` |
| Data | `data/` — committed release artifact; its published size is gated at staging |
| Build | `scripts/build_all.sh` (+ `preflight.py`, `check_stages.py`, and `check_required_layers.py`) |
| Direction | `docs/ROADMAP.md` · tasks in `TODO.md` · history in `CHANGELOG.md` |
| Data provenance | `docs/DATA_AUDIT.md`, and `data/meta/manifest.json` carries a sha256 per source |
| Archived sources | `/work/cjtlab/ch29576_ms2/atlas_sources_20260904/` — `/scratch` purges at 30 days |

## Open, and Chen's to decide

1. **Licence.** `LICENSE` currently says the data is **not** yet openly licensed; CC BY 4.0 is
   intended at publication. Code is MIT.
2. **`noindex`.** Stays in `index.html` until the chapter is out.
3. **The ms1-dup CLAUDE.md contradiction** about the canonical expression panel (§B says n=222,
   §D still says n=202). `docs/DATA_AUDIT.md` has the detail. Worth fixing at the source.
4. **Allele-specific expression** is deliberately not built — Chen did not pursue the analysis
   and `ase_analysis/` has no per-gene table. Building one would publish a new result as though
   it were established. Reopen only if Chen revives it.
