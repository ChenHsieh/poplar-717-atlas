# Roadmap — 717 Atlas

**Written:** 2026-09-04 · **Status of record:** `TODO.md` (task-level), this file (direction-level).

## 1. What this is

One artifact, two audiences, and they pull differently:

| audience | what it needs | what that implies |
|---|---|---|
| **Chapter companion** (MS2_2026, lineage-specific genes) | every claim inspectable per gene: synteny class, PS rank, expression | correctness and provenance first; the chapter's own definitions (private rule, τ over 8 tissues) must not drift |
| **Community resource** (Phytozome / PopGenIE-style, for the reference hybrid poplar) | find a gene by name, see what it is, see its allele, cite a version | search, annotation, cross-links, versioning, license, citation |

Design principles that stay fixed: **the gene is the primitive; modules are facets; the study is the citation unit; the gene ID encodes its shard; no server, no build step.**

## 2. Where it stands (2026-09-04, after v0.2)

| layer | state |
|---|---|
| Data — synteny | 12-genome GENESPACE, QC PASS, DIAMOND-sensitivity control (Jaccard 0.98) |
| Data — phylostratigraphy | genEra rank, ambiguity flags (44), unplaced (50), family origin + size |
| Data — annotation | 60,746 genes; 4,862-term GO dictionary; 51,862 allele links; 62,385 presence lists |
| Data — expression | 652 samples / 28 studies / 38 BioProjects |
| Data — duplication | 1,346 tier-2 paralog pairs with dS (NOT genome-wide); tandem arrays genome-wide |
| Site | gene hub, 6 modules, free-text search, browse/query builder, gene sets, TSV export, provenance |
| Integrity | `validate_data.py` (17 checks) + `check.mjs` (16 views + driven query), both in CI |
| Publishing | repo private; **Pages still not enabled** (API 404, plan reads Free); Artifact preview live |
| Repo | ~280 MB data, `.git` under 200 MB; `.nojekyll`, LICENSE, CITATION.cff, CHANGELOG in place |
| Sources | **archived** to `/work/cjtlab/ch29576_ms2/atlas_sources_20260904/` (3.35 GB), safe from purge |

All five planned modules ship. What remains is depth, not scaffolding.

## 3. The gaps that matter, ranked

1. **The gene page is not yet a hub.** A community user's first three questions — *what is this gene, where is its other allele, is it in P. trichocarpa* — are unanswered. All three are cheap: `annotation_info.txt` (Pfam / Panther / KOG / GO / best Arabidopsis hit with defline; 48,502 HAP1 transcripts carry an AT hit) is on-cluster; the 25,931-pair HAP1↔HAP2 syntelog map with Ka/Ks is on disk; the 12-genome presence list is already in every record (`of_genomes`). For a *haplotype-resolved* atlas, the missing allele link is the single most embarrassing gap.
2. **Search is ID-only.** A compact index (id, AT hit, defline, Pfam ids; ~2 MB gzipped, lazy-loaded) makes "LEA", "AT1G06515", "PF11779" all resolve — with no server.
3. **Nothing feeds the GeneSet store.** The cross-module payoff — PS ≥ 18 ∩ private ∩ τ ≥ 0.8 → export — needs a facet index (one row per gene: hap, chr, class, PS, τ, top tissue, tandem; ~3 MB gzipped) and a browse view. Everything else is already in place.
4. **Publication readiness is undefined.** A public site from a private repo needs an explicit policy: computational layers public; wet-lab private; **candidate labels (LSG1–6 / GOI names) held until the chapter is out** — gene IDs and PS ranks are fine, the names tie to unpublished phenotypes. Plus data versioning with a CHANGELOG, a human-readable provenance page, a license (code MIT, data CC-BY 4.0 proposed), `CITATION.cff`, and a Zenodo DOI at v1.
5. **Operational risks.**
   - **Sources live on `/scratch`, which purges at 30 days.** The build is not reproducible from a clone by design — so if `ms2_genespace/` and `expression/` purge, the committed `data/` is the only copy. Archive both to `/work/cjtlab` now.
   - Every rebuild rewrites ~250 MB; git history will bloat. Decide: squash-on-data-release, or a separate data branch.
   - Pages activation is gated on the plan upgrade propagating; the Artifact preview is the interim public face.
   - No `.nojekyll` — add before Pages goes live so Jekyll never touches the JSON tree.

## 4. Architecture — keep what works, extend the record

**Keep:** static site, ID→shard rule asserted at build, module contract, GeneSet store, two-level expression, headless checks.

**Extend the gene record** (all in the existing shard, no new fetch on the gene page):

```
ann      { pfam: [...], at: "AT1G06515", at_def: "...", panther: "..." }
allele   { id: "PtXaAlbH.05G118900", ks: 0.012, ka: 0.004 }      # HAP1<->HAP2 syntelog
pres     ["Pdeltoides","Ptrichocarpa",...]                          # 12-genome presence
```

**Add two indexes** under `data/index/`, both lazy: `search.json` (names/domains → ids) and `facets.json` (browse). Neither is loaded on a gene page.

**Add versioning:** `manifest.json` gains `data_version`; the footer shows it; `CHANGELOG.md` records what each data build changed and why.

**Fix study pages:** the sample table is label-only today; `samples.json` already carries tissue / treatment / genotype / growth / notes per sample — render it.

**CI:** GitHub Actions runs `check.mjs` on every push. The data build stays on Sapelo2 by design.

## 5. Phased plan

Each phase ships when `check.mjs` is green, build asserts pass, and one screenshot review is done. `TODO.md` tracks the tasks.

| release | theme | contents |
|---|---|---|
| ~~v0.2~~ | ~~Gene page becomes a hub~~ | **DONE** — allele link, annotation + search, presence, cross-links, publish hygiene, sources archived |
| ~~v0.3~~ | ~~Query~~ | **DONE early** — facet index, browse builder, gene sets, TSV export, phylostrat module |
| **v0.4** | Depth | study sample tables (metadata exists, table is label-only) · condition-grouped expression means · ComBat cross-study view after a 63,960-gene rebuild · tandem-array identity (which genes share an array) · genome-wide paralog scan if the WGD question matters |
| **v0.5** | Hybrid-specific | ASE module (needs a per-gene table from `ase_analysis/`) · cross-species *P. trichocarpa* xylem (377 samples) via synteny orthologs · allele-level expression once ASE lands |
| **v1.0** | Release | Zenodo DOI · `noindex` removed with the chapter · CC BY 4.0 activated on the data · docs |

**v0.2 and v0.3 both shipped on 2026-09-04.** The atlas is now a place a colleague would open
first: a gene page answers what the gene is, where its allele is, how old it is, which genomes
have it, where it is expressed, and what it duplicated from — and browse answers the same
questions across all 63,960 genes at once.

The single highest-value remaining item is not on the list above: **turn Pages on.** Everything
is built and checked; the site simply is not reachable by anyone but its author.

## 6. Decisions that are Chen's

- Candidate labels on the public site — hold until the chapter is out? (recommended: hold)
- License: MIT code / CC-BY 4.0 data?
- Repo growth: squash on data release, or a separate data branch?
- Domain: `chenhsieh.github.io/poplar-717-atlas` or a custom one?
- Already decided, stays: 12-genome panel, no *P. alba*; raw TPM primary, ComBat deferred.

## 7. What will not happen without asking

Enabling Pages (the API call is classifier-blocked in this session — run it with `!`), deleting anything, changing the chapter's definitions (private rule, τ tissues), or publishing any wet-lab data.
