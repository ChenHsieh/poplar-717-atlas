# Handoff

For whoever picks this up next, on any machine. Read this before touching `data/`.

## The three things that will bite you

### 1. The build destroys before it creates

**`scripts/build_data.py` wipes and rewrites `data/genes/`. Every later stage patches those
shards.** Run it alone and you get a `data/` directory that looks fine, loads fine, and is
silently missing a dozen layers.

The patchers only ADD keys — they never remove one. So if a layer is dropped from the build
code, its old values survive in `data/` until a full rebuild wipes the shards. That actually
happened: two audited-out layers stayed in the published JSON, invisible in the UI but
downloadable, until a full rebuild purged them.

Never run the build scripts individually. Use:

```bash
scripts/build_all.sh        # every stage, in the only correct order
```

### 2. No single machine can run every stage

The core stages read Sapelo2-local sources (`/scratch/ch29576`, `/work/cjtlab`). Four later
stages read the OneDrive `MS1_2026` tree, which is on Chen's Mac and is **not** mounted on
Sapelo2. So a complete `data/` is a two-machine sequence:

```bash
# on Sapelo2
scripts/build_all.sh --allow-partial   &&  git add -A data && git commit && git push
# on the Mac
git pull  &&  scripts/build_all.sh --allow-partial   # re-applies its stages, rewrites facets
```

`build_all.sh` classifies every stage by which source tree it needs, probes what is present,
and **refuses to start** unless it can finish — aborting *before* `build_data.py` wipes layers
the current machine could not restore. `--allow-partial` is the explicit opt-in to doing half
the job. If a tree does get wiped, `git checkout -- data/` restores it; the committed `data/`
**is** the artifact.

`scripts/validate_data.py` is the backstop: it asserts the canonical per-layer counts (PAV
805/859, TD 6663/6385, 191 contrasts, every gene has a `cre` record and a locus tile), so a
partial build fails loudly rather than shipping.

### 3. A patcher that is not a STAGE is an invisible hole (found 2026-09-18)

`build_all.sh` is only as complete as its `STAGES` list, and **nothing checked that list against
the scripts that exist**. `patch_duplicate_partners.py` was in neither the list nor either
"DELIBERATELY NOT A STAGE" paragraph, so a full rebuild dropped `td.mem` and every `para[].r` --
the array-member table and the duplicate co-expression on the Duplication card -- and every
check passed. That is the difference between this and problem 1: problem 1 leaves a STALE value,
which a recompute-and-diff gate catches (TODO 25). This leaves an ABSENT layer, and the
validator's per-field checks ("is r inside [-1,1]", "does this partner id exist") are all
vacuously true over zero rows. Only the count assertions above can see it, and there is no count
assertion for most layers.

A one-minute sweep -- every `patch_*.py` in `scripts/` diffed against the STAGES list -- found
**six more unowned patchers**: `patch_chromatin_profiles.py`, `patch_gene_model.py`,
`patch_map_overlays.py`, `patch_peptide_detail.py`, `patch_promoter_pos.py`,
`patch_structure.py`, `patch_wgd_pairs.py`. TODO 47 carries the list and the proposed
`scripts/check_stages.py` gate. **Before trusting a rebuild, run that diff.**

### Determinism

Two consecutive runs produce byte-identical output for all 277 gene shards and all 27 index
files, so `git status` after a rebuild is a real signal. That was **not** true until
2026-09-08: `build_annotation.py` iterated a `set` of locus ids, and Python randomises string
hashing per process, so every build silently reshuffled the search index and redrew which of
several conflicting descriptions labelled a PANTHER accession. Both are now sorted. If you
add a stage, sort anything you iterate before it reaches a file.

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
3. **No build step, no framework.** Vanilla ES modules and static JSON, served straight from
   the repo root. `.nojekyll` keeps Jekyll away from the JSON tree.

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
| **Never publish** | LSG candidate labels (the `LSG<n>.<chr>g` names and the XO group names) while the chapter is unpublished, and curator identity or verbatim curation quotes. `build_layers.py:sanitise_note` enforces the second. `validate_data.py` enforces the first over the shards AND every tracked text file, because Pages serves the whole repo root (scripts/, docs/, sources/, CHANGELOG.md): until 2026-09-21 the names, two of them next to a gene ID, sat in files the site served while the shard-only check passed. Never write a label into this repo, not even in a check |

## Checks — run all three, they catch different things

```bash
python3 scripts/validate_data.py                    # data-integrity gates, no browser
python3 scripts/check_version.py                    # VERSION == manifest == CITATION.cff
python3 scripts/check_ms2_canon.py                  # atlas vs ms2-lsg's canonical tables (needs ~/dev/ms2-lsg)
python3 scripts/serve_ranges.py 8931 . &            # NOT http.server: it ignores Range
node scripts/check.mjs                              # rendered views + driven interactions
node scripts/check.mjs https://chenhsieh.github.io/poplar-717-atlas shots-live   # against live
```

CI runs all three on every push.

`check_version.py` exists because `data_version` was *read* in three places — the validator,
the site footer, the About page — and *written* by nothing. It survived only as a hand-edit to
the committed manifest, so the next full rebuild would have dropped it, and nothing would have
failed: the footer hides the chip when the key is absent and About falls back to an em dash. A
citable dataset would have quietly stopped saying which version it was. **To release: edit
`VERSION`, add a `## X.Y.Z — date — title` entry to `CHANGELOG.md`, sync `CITATION.cff`, then
rebuild** (`build_data.py` stamps `VERSION` into the manifest).

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
| private ∩ PS ≥ 18 (browse query) | **902** (433 HAP1 + 469 HAP2) on the Idesia-corrected ranks; 923 (445 + 478) on the frozen ranks, which is the figure that matched the step-7 report's 275 + 648 |
| LSG pool, PS ≥ 18, Idesia-corrected (canonical since 2026-09-09, ms2-lsg C2) | 1,611 = 776 HAP1 (433 PS18 + 343 PS19) + 835 HAP2 (497 PS18 + 338 PS19) |
| LSG pool, frozen genEra call (the pool the chapter text reports; not called a "12-species panel" pool since MS2 audit A38 found that run searched nr only) | 1,725 = 842 HAP1 (392 + 450) + 883 HAP2 (454 + 429); carried per gene as `ps.frz` |
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
| Site | repo root — `index.html`, `js/`, `css/` |
| Data | `data/` — committed, 303 MB, **the artifact** |
| Build | `scripts/build_all.sh` (+ `preflight.py`) |
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
