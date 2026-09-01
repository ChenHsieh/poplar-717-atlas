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
scripts/build_data.py     data build; --tier full|public
data/genes/{hap}/{chr}.json   sharded gene records
data/meta/manifest.json   module list, counts, summary stats, per-source sha256
site/js/core/             router, loader, gene-set store
site/js/modules/          ONE FILE PER MODULE
```

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
