# Expression module — design

The atlas carries a curated expression release with 652 samples, 697 runs, 38 BioProjects, and
28 studies. Quantification is kallisto k21 against the combined HAP1+HAP2 v5.1 primary
transcript set. The sample vector order in `data/expr/samples.json` is fixed and is the order
used by every stored profile.

## What the release contains

Raw TPM is the primary profile. ComBat-corrected TPM is an opt-in second profile for the 59,599
genes that entered the upstream batch-correction model. The other 4,361 atlas genes were
excluded by its low-count filter; a missing ComBat profile means that the model did not have
enough signal to fit, not that the gene is absent from the atlas.

Every gene shard carries the no-extra-fetch summary:

```text
x.t       median raw TPM for each WT-control tissue
x.n       WT-control sample count for each tissue
x.tau     Yanai tissue-specificity score
x.top     tissue with the largest median
x.max     maximum raw TPM across the full profile
```

The current WT-control panel has bark 38, bud 5, callus 1, catkin 4, leaf 55, leaf-old 11,
leaf-young 11, root 27, stem 2, and xylem 59 samples. Tau excludes callus and uses the remaining
nine analysis tissues. The display retains callus with its sample count.

## Full-profile storage

Full profiles are range-addressable, not one JSON bucket download per gene:

```text
x.o   [offset, length] in data/expr/raw_hap{1,2}.gzb
x.co  [offset, length] in data/expr/cb_hap{1,2}.gzb
x.b   former raw bucket key, retained for compatibility
x.cb  former ComBat bucket key, retained for compatibility and source regeneration
```

Each range identifies one deterministic gzip member whose uncompressed bytes are the exact JSON
array from the corresponding build bucket. This changes the container only; it neither rounds
nor transforms expression values. The client accepts a profile only after an exact `206` range
response has the requested `Content-Range`, byte length, and a valid numeric vector of the
expected sample length.

The released profile files are `raw_hap1.gzb`, `raw_hap2.gzb`, `cb_hap1.gzb`, and `cb_hap2.gzb`.
Raw and ComBat bucket trees are temporary build inputs. `build_expr_ranges.py` stages both blob
sets, validates every staged member against the input vector, stages changed shards and the
manifest, then publishes them with rollback backups. It retires the bucket trees only after the
whole publication succeeds. A failed pack or replacement preserves the previous release and both
input trees. Pages explicitly excludes either bucket tree if one is left in a future checkout.

`make_wgd_pairs_source.py` and `make_duplicate_coexpr_source.py` read ComBat vectors from `x.co`
and the packed blobs. Their legacy-bucket fallback is intentionally narrow: it is used only when
the packed pointer or blob is absent, and malformed packed data is an error rather than a silent
substitution.

## Data files

```text
data/expr/samples.json       one metadata row per vector position
data/expr/studies.json       study metadata and citations
data/expr/contrasts.json     contrast index
data/expr/raw_hap*.gzb       raw TPM vectors, one gzip member per gene
data/expr/cb_hap*.gzb        eligible ComBat TPM vectors, one gzip member per gene
data/genes/.../*.json        gene summaries and range pointers
```

## Build and verification

The ordered build is `scripts/build_all.sh`; do not invoke the expression writers as a substitute
for the graph. `build_expression.py` writes raw summaries and bucket inputs, `build_combat.py`
adds eligible ComBat inputs, and `build_expr_ranges.py` performs the final pack. The range packer
is source-host dependent, like its inputs.

After a complete build, run `python3 scripts/check_required_layers.py` and
`python3 scripts/validate_data.py`. The required-layer check confirms blob sizes, pointer counts,
and offsets. The regular validator samples ranges, decompresses them, and compares their vectors
with shard summaries. The focused, source-free transaction fixture is:

```bash
python3 scripts/test_build_expr_ranges.py
```

Use `scripts/serve_ranges.py` for local browser testing. `python3 -m http.server` returns a full
`200` response for a range request, which the profile loader deliberately rejects.

## Views

| route | content |
|---|---|
| `#/module/expression` | study catalogue, tissue and panel summaries, contrasts |
| `#/study/<n>` | BioProject links, citation, design factors, and sample metadata |
| gene card | shard summary followed by an on-demand full raw or eligible ComBat profile |
| `#/browse` | tau, top tissue, and expression filters |

The baseline is a single magnitude series, so it uses direct tissue labels rather than a
categorical colour encoding. The full-profile view provides a table as well as the chart.

## Deferred work

Allele-specific expression still needs a per-gene result table. Additional 717 datasets and the
*P. trichocarpa* xylem data need the same curation and provenance review before they join this
release.
