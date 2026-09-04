# poplar-717-atlas

Gene atlas for hybrid poplar 717 (*Populus tremula* × *alba*), haplotype-resolved v5.1.
Static site — no server, no build step, no framework.

> **⚠ GitHub Pages is PUBLIC even from a private repository.** There is no auth-gated Pages
> below GitHub Enterprise. This repo is private and the site is **not deployed**. Before ever
> enabling Pages, build with `--tier public`, which withholds fields marked private in
> `FIELD_TIERS` (currently LSG-pool membership — the unpublished candidate list).

## Architecture

**The gene is the primitive.** Every module is a facet of a gene, plus browse views over the
gene set. Same shape as Phytozome / NCBI Gene / PopGenIE.

### The gene ID encodes its own shard — so there is no index file

```
PtXaTreH.05G120200  ->  data/genes/hap1/Chr05.json
PtXaAlbH.14G133000  ->  data/genes/hap2/Chr14.json
PtXaTreH.T000100    ->  data/genes/hap1/scaffolds.json   (T-form: 131 genes, HAP1 only)
```

A gene page is **one fetch with zero lookups**. Shards are ≤113 KB gzipped.

That rule is load-bearing, so `build_data.py` **asserts** it reproduces the real BED
coordinate for all 63,960 genes and fails the build if the annotation ever breaks the
convention. The same rule is mirrored in `site/js/core/data.js`; the two must agree.

### Layout

```
index.html                shell (site is served from the repo root, for Pages)
scripts/build_data.py     data build; --tier full|public
scripts/check.mjs         headless render checks -- run before every commit
data/genes/{hap}/{chr}.json   sharded gene records
data/meta/manifest.json   module list, counts, summary stats, per-source sha256
js/core/                  router, loader, gene-set store, dom helper
js/modules/               ONE FILE PER MODULE
```

## Checks

```bash
python3 scripts/validate_data.py                  # data integrity, no browser needed
python3 -m http.server 8931 --bind 127.0.0.1 &
node scripts/check.mjs                            # headless render
```

`validate_data.py` checks the committed data against itself: the ID→shard rule, expression
bucket pointers, allele links (existing, cross-haplotype, reciprocal), the absence of the PAML
omega sentinel, and search postings in range. `check.mjs` renders every view and fails on any
console error or missing content — the site fetches JSON, so `file://` is not a valid test.
Both run in CI on every push.

## Build order

The data scripts are **not** independent — the later two patch the shards the first one writes:

```bash
python3 scripts/build_data.py --tier full     # writes shards (synteny + phylostratigraphy)
python3 scripts/build_expression.py           # adds x: tissue baseline, tau, bucket pointer
python3 scripts/build_annotation.py           # adds ann / allele / pres, builds the search index
```

Running `build_data.py` alone will drop the expression and annotation layers.

## Colour

The five synteny classes use slots 1-5 of a validated categorical palette (worst adjacent
CVD dE 9.1 light / 8.4 dark; normal-vision 19.6 / 19.3). Three light-mode hues sit under 3:1
contrast on the surface, so **every class swatch ships with its text label** -- identity is
never carried by colour alone.

### Adding a module = one file + one registry line

Each module exports:

```js
export default {
  id: 'synteny', label: 'Synteny',
  geneCard(gene)  { ... },   // a card on the gene page
  browseView()    { ... },   // optional standalone view
  filters: [...],            // optional facets for the query builder
}
```

Modules never import each other. They interact only through the shared `GeneSet` store, which
is what makes "filter to PS≥18, then inspect their expression" work across modules.

## Data provenance

`data/meta/manifest.json` records a sha256 and mtime for every input file read. Regenerate:

```bash
python3 scripts/build_data.py --tier full
```

Sources live on Sapelo2 (`/scratch/ch29576/…`) and are not in this repo, so the build is not
reproducible from a clone alone — the committed `data/` is the artifact.

## Local viewing

```bash
cd site && python3 -m http.server 8080     # then open http://localhost:8080
```

## Status

See `TODO.md`.
