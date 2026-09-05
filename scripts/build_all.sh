#!/usr/bin/env bash
# The data build, in the ONE order that produces a complete data/ directory.
#
# build_data.py WIPES and rewrites data/genes/; every other script PATCHES those shards.
# Running build_data.py alone leaves a plausible-looking data/ that is silently missing
# eleven layers, so this script exists to make the order un-gettable-wrong.
#
# Sources are Sapelo2-only. preflight.py stops before anything is written if they are absent.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== preflight =="
python3 scripts/preflight.py

echo; echo "== 1/8 gene shards (WIPES data/genes) =="; python3 scripts/build_data.py --tier full
echo; echo "== 2/8 expression =="                    ; python3 scripts/build_expression.py
echo; echo "== 3/8 annotation + search index =="     ; python3 scripts/build_annotation.py
echo; echo "== 4/8 phylostratigraphy context =="     ; python3 scripts/build_phylostrat.py
echo; echo "== 5/8 duplication (paralog dS) =="      ; python3 scripts/build_duplication.py
echo; echo "== 6/8 external genome-wide layers =="   ; python3 scripts/build_layers.py
echo; echo "== 7/8 cross-species orthologs =="       ; python3 scripts/build_crossspecies.py
echo; echo "== 8/8 facet index (must be LAST) =="    ; python3 scripts/build_facets.py

echo; echo "== validate =="; python3 scripts/validate_data.py
echo
echo "Build complete. Now run the render checks:"
echo "  python3 -m http.server 8931 --bind 127.0.0.1 &"
echo "  node scripts/check.mjs"
