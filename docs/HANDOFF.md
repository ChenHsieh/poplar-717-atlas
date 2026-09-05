# Handoff

For whoever picks this up next, on any machine. Read this before touching `data/`.

## The one thing that will bite you

**`scripts/build_data.py` wipes and rewrites `data/genes/`. Every other build script patches
those shards.** Run it alone and you get a `data/` directory that looks fine, loads fine, and is
silently missing eleven layers.

Never run the build scripts individually. Use:

```bash
scripts/build_all.sh        # preflight, then all 8 stages in the only correct order
```

**The build only runs on UGA Sapelo2.** Every source lives under `/scratch/ch29576` or
`/work/cjtlab`. `scripts/preflight.py` checks all 13 source groups and refuses to start
elsewhere, rather than half-building. On any other machine:

- You **can**: edit the site, serve it, run `scripts/validate_data.py`, run `scripts/check.mjs`,
  and deploy. The committed `data/` **is** the artifact.
- You **cannot**: rebuild `data/`. Don't try; you'll destroy it.

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
| **Still missing from the mirror** | the canonical `tier1_floor` PAV table, and `master_duplication_table_v6.csv`. If either appears, wire it in — the atlas currently ships no PAV layer and the v8 duplication call |
| **Read-only** | `ms2-lsg/pipeline/out/*.tsv` and `GOI_CANONICAL.tsv`, by Chen's standing instruction |
| **Never publish** | LSG candidate labels (`LSG1.14g`, `XO14gHAP2`…) while the chapter is unpublished, and curator identity or verbatim curation quotes. `build_layers.py:sanitise_note` enforces the second |

## Checks — run both, they catch different things

```bash
python3 scripts/validate_data.py                    # 16 data-integrity checks, no browser
python3 -m http.server 8931 --bind 127.0.0.1 &
node scripts/check.mjs                              # 28 rendered views + 3 driven interactions
node scripts/check.mjs https://chenhsieh.github.io/poplar-717-atlas shots-live   # against live
```

CI runs both on every push. Two lessons already paid for:

- `check.mjs` asserts against `innerText`, which is **rendered** text. Assertions are
  case-insensitive because `table.data th` is uppercase — a styling rule should not decide
  whether a content assertion passes.
- A passing text assertion does not mean the page is right. The phylostratigraphy chart once
  rendered as stacked text with no bars at all while every check passed, because the bar CSS
  classes were missing. **Look at a screenshot after any visual change.**

## Numbers that should stay stable

If a rebuild moves any of these, something changed upstream — find out what before shipping.

| quantity | value |
|---|---|
| gene models | 63,960 (HAP1 32,137 / HAP2 31,823) |
| `private_no_ortholog` | 1,642 |
| private ∩ PS ≥ 18 (browse query) | **923** — matches the step-7 report's 275 + 648 |
| LSG pool, PS ≥ 18 | 1,725 (842 HAP1 + 883 HAP2) |
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
