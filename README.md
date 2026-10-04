# poplar-717-atlas

> **Picking this up fresh? Read [`docs/HANDOFF.md`](docs/HANDOFF.md) first.**
> `scripts/build_data.py` wipes `data/genes/`; do not run individual data writers. Use
> `scripts/build_all.sh`, which audits the build graph before mutation and runs source-dependent
> stages in dependency order. The committed `data/` is the release artifact outside the build
> hosts.

Gene atlas for hybrid poplar 717 (*Populus tremula* × *alba*), haplotype-resolved v5.1.
Static site: no application server, framework, or browser-side build step.

> **GitHub Pages is public even when the repository is private.** Pages receives a fresh,
> allowlisted site tree, never the repository root. A successful `checks` run on `main` is the
> only deployment trigger; Pages then checks out that exact SHA, rebuilds the tree, validates it,
> browser-tests it, and uploads those bytes. The site is live with `noindex` until the chapter is
> out. See [the staged-release steps](#verify-the-public-artifact) before changing a fetched
> asset or data release.

## Architecture

**The gene is the primitive.** Every module is a facet of a gene, plus browse views over the
same gene set.

### The gene ID encodes its shard

```
PtXaTreH.05G120200  ->  data/genes/hap1/Chr05/4.json
PtXaAlbH.14G133000  ->  data/genes/hap2/Chr14/5.json
PtXaTreH.T000100    ->  data/genes/hap1/scaffolds.json
```

For chromosome genes, the numeric suffix divided by 25,000 selects a shard with at most 250
records. A gene page loads that shard after checking the manifest, with no search-index lookup.
The rule is mirrored by `scripts/build_data.py`, `js/core/data.js`, and
`scripts/validate_data.py`; the build checks it against all 63,960 annotation records.

### Versioned data and range reads

The manifest is fetched with `no-store` once per page load. Its `data_version` is added to every
subsequent data URL and client cache key, preventing fresh JavaScript from being combined with a
stale shard or index after a Pages deployment.

Full expression profiles live in one range-addressable `.gzb` blob per haplotype and matrix. A
shard carries the raw and, when available, ComBat offset and length. The loader accepts a profile
only when the server returns the requested `206` range with the exact `Content-Range`, byte
length, and expected numeric sample vector. GitHub Pages supports Range requests; local testing
must use `scripts/serve_ranges.py`, not `python3 -m http.server`.

### Layout

```
index.html                         application shell
scripts/build_all.sh               ordered, source-aware data build
scripts/check_stages.py            pre-write build-graph ownership and dependency gate
scripts/check_required_layers.py   read-only completeness gate after a rebuild
scripts/assemble_site.py           strict public-artifact assembler
scripts/check_site_artifact.py     public-artifact allowlist, budget, and identity gate
scripts/check.mjs                  browser render and interaction checks
data/genes/{hap}/{chr}/{bucket}.json  gene records
data/expr/{raw,cb}_{hap}.gzb       range-addressable full expression profiles
data/meta/manifest.json            release data version, modules, counts, provenance
js/core/                            router, loader, gene-set store, DOM helpers
js/modules/                         one file per module
```

## Build data safely

The data writers are not independent. `build_data.py` resets the gene shards, then later stages
restore expression, annotation, derived indexes, structure, map overlays, and other source-backed
layers. `build_facets.py` remains the final stage because it indexes the finished shards. The
production graph invokes `build_data.py --tier public`, and the public artifact gate requires
`manifest.tier` to be `public`. Phylostratigraphic ranks and LSG membership remain public because
membership is directly inferable from the displayed rank; candidate labels and group names must
remain absent from the release tree.

```bash
scripts/build_all.sh
```

A complete build needs the lab's upstream source trees (not public). Before it can erase
shards, `build_all.sh` runs `check_stages.py`; that gate verifies stage ownership, ordering, and
dependencies for every data writer, while classifying source generators separately. If a machine
lacks required sources, the default command stops before writing. `--allow-partial` explicitly
runs only the stages available on that machine for a two-machine handoff.

After all source-dependent stages have run, the following must pass before publication:

```bash
python3 scripts/check_required_layers.py  # source-backed fields, blobs, indexes, and overlays
python3 scripts/validate_data.py          # internal data invariants and public-content scan
```

`check_required_layers.py` is read-only, so it is safe after either half of a handoff. A partial
run reports incompleteness and deliberately does not treat the normal validator as a release
verdict. Run the remaining stages, then rerun the gates. The full build invokes them in the right
place already.

Source generators (`make_*_source.py`) are not build stages: they create a committed source
artifact from an upstream analysis. Regenerate and review that source separately, commit it, then
run its matching data stage. The only historical patch exception is documented in
`check_stages.py`; adding another writer without a stage is rejected.

## Verify the public artifact

CI validates and renders the staging tree, rather than the repository root. The assembler reads
both paths and bytes from Git `HEAD`, deliberately ignoring uncommitted or untracked working-tree
files. Commit the candidate revision before reproducing its release path locally with a new,
nonexistent output directory:

```bash
SITE_DIR=/tmp/poplar-atlas-site-next-release   # choose a path that does not exist
python3 scripts/check_version.py
python3 scripts/assemble_site.py --output "$SITE_DIR"
python3 scripts/validate_data.py   --data-dir "$SITE_DIR/data" --source-root "$PWD" --scan-root "$SITE_DIR"
python3 scripts/check_site_artifact.py   --site "$SITE_DIR" --commit "$(git rev-parse HEAD)" --write-release
python3 scripts/serve_ranges.py 8931 "$SITE_DIR" &
node scripts/check.mjs
```

The assembler streams allowlisted files from Git `HEAD` and refuses an existing output directory.
The artifact gate requires the expected site files, rejects hidden, extra, linked, or non-regular
files, requires `manifest.tier: "public"`, enforces a 900 MiB engineering budget, and writes
`data/meta/site-release.json` in the staging tree. That record binds the tested artifact to its
commit, data version, file count, and content digest; it is generated for release and is not a
source-data file to commit.

The public tree contains the shell, CSS, JavaScript (and its vendored license), current data
assets, reader-facing provenance sidecars, `LICENSE`, and `CITATION.cff`. Raw and ComBat bucket
trees are build inputs and compatibility fallbacks, explicitly excluded from Pages; the
range-addressable `.gzb` blobs are the released profile representation. If the client begins fetching a new asset
type, update the explicit rules in both `assemble_site.py` and `check_site_artifact.py`, then
rerun the staged checks. Do not copy files into `_site` by hand.

## Local viewing

```bash
python3 scripts/serve_ranges.py 8080 .
# open http://localhost:8080
```

The range-aware server mirrors the response semantics used in production. `file://` cannot load
the JSON modules, and `python3 -m http.server` ignores Range requests.

## Adding a module

Each module exports:

```js
export default {
  id: 'synteny', label: 'Synteny',
  geneCard(gene)  { ... },
  browseView()    { ... },
  filters: [...],
}
```

Modules do not import one another. They meet through the shared `GeneSet` store, which supports
queries such as “filter to PS≥18, then inspect expression.”

## Data provenance

`data/meta/manifest.json` records the release version, source hashes, counts, and module
metadata. The source inputs live on the build hosts and are not enough to reproduce a release
from a clone alone; the committed `data/` and the validated Pages artifact are the distributable
records.

## Status

See [`TODO.md`](TODO.md) for active work and [`CHANGELOG.md`](CHANGELOG.md) for release history.
