#!/usr/bin/env bash
# The data build, in the ONE order that produces a complete data/ directory.
#
# TWO THINGS MAKE THIS SCRIPT NECESSARY, and both have already caused real damage:
#
#   1. build_data.py WIPES and rewrites data/genes/; every later stage PATCHES those shards.
#      Run out of order, or run alone, and you get a plausible-looking data/ that is silently
#      missing layers.
#
#   2. NO SINGLE MACHINE CAN RUN EVERY STAGE. The core stages read Sapelo2-local sources
#      (/scratch, /work). Four later stages read the OneDrive MS1_2026 tree, which is on
#      Chen's Mac and is NOT mounted on Sapelo2. So a complete build is a two-machine
#      sequence, and this script refuses to start a build it cannot finish -- BEFORE
#      build_data.py destroys the layers this machine would be unable to restore.
#
# Usage:
#   scripts/build_all.sh                  full build; aborts unless every stage can run here
#   scripts/build_all.sh --allow-partial  run only the stages available here (see warning)
#
# Two-machine sequence, when no one machine has both source trees:
#   Sapelo2 : scripts/build_all.sh --allow-partial   then commit and push
#   The Mac : git pull && scripts/build_all.sh --allow-partial   then commit and push
# The second machine's run re-applies its own stages and finishes with the facet index.
set -euo pipefail
cd "$(dirname "$0")/.."

ALLOW_PARTIAL=0
[ "${1:-}" = "--allow-partial" ] && ALLOW_PARTIAL=1

# --- what each stage needs -------------------------------------------------------------
# env|script|description.  Order is load-bearing; build_facets.py must stay last.
STAGES=(
  "sapelo2|build_data.py --tier full|gene shards (WIPES data/genes)"
  "sapelo2|build_expression.py|expression"
  "sapelo2|build_annotation.py|annotation + search index"
  "sapelo2|build_phylostrat.py|phylostratigraphy context"
  "sapelo2|build_duplication.py|duplication (paralog dS)"
  "sapelo2|build_layers.py|external genome-wide layers"
  "sapelo2|build_crossspecies.py|cross-species orthologs"
  "onedrive|patch_dup_v9_and_pav.py|duplication v9 + PAV (after build_duplication)"
  # NOT PREVIOUSLY LISTED, and that was a real gap: `td.mem` and every `para[].r` on the
  # shards are written by patch_duplicate_partners.py, which no stage ran. A full rebuild
  # therefore dropped the array-member lists and the duplicate co-expression the Duplication
  # card renders, and nothing failed -- the card just quietly lost its table. Found while
  # adding the stage below, which depends on td.mem.
  "repo|patch_duplicate_partners.py|array members + duplicate co-expression (after build_layers, which writes td and arrays.json)"
  "repo|patch_td_pair_ks.py|per-PAIR tandem dS (after patch_duplicate_partners, which writes the td.mem it keys on)"
  "repo|patch_wgd_combined_call.py|route C combined Ks+topology WGD call, BESIDE the canonical letters (after patch_dup_v9_and_pav, which writes the dup.s/dup.a it is compared against)"
  "repo|patch_pool_idesia.py|Idesia-corrected LSG pool (after build_phylostrat; MUST precede patch_lsg_qc)"
  "repo|patch_lsg_qc.py|LSG evidence-quality flags (after patch_pool_idesia -- it drops rows for genes the corrected pool no longer holds)"
  "repo|patch_proteomics_v2.py|proteomics re-search, genome-wide (after build_layers, which writes the Tier-1 shape this replaces)"
  "repo|patch_kaks.py|Ka/Ks vs P. trichocarpa"
  "repo|build_cre.py|promoter/CRE layer"
  "repo|patch_chromatin.py|GSE128434 chromatin at the P. trichocarpa ortholog (after build_crossspecies)"
  "repo|patch_karyotype.py|ancestral eudicot karyotype, route C, exploratory (before build_facets, which indexes it)"
  "onedrive|build_combat.py|ComBat-seq view (after build_expression)"
  # MUST come after both expression stages and before build_facets. It reads the bucket trees,
  # packs one gzip member per gene into per-haplotype blobs, writes [offset, length] onto each
  # shard, and the buckets are then deleted. Skipping it leaves shards pointing at ranges that
  # do not exist; running it twice is harmless (it rewrites the blobs from the buckets).
  "onedrive|build_expr_ranges.py|range-addressable expression blobs (after build_expression AND build_combat)"
  "onedrive|build_contrasts.py|contrast index (after build_expression)"
  "onedrive|build_locus.py|locus tiles + genome map"
  "any|build_facets.py|facet index (MUST be last)"
)
# DELIBERATELY NOT STAGES: make_proteomics_v2_source.py and make_kaks_source.py. They read
# /scratch analysis output and REGENERATE sources/*.tsv.gz, which is a different job from
# building data/ -- the committed source file is the artifact, exactly as data/ is. Run them
# by hand on Sapelo2 when the upstream analysis produces a new result, then run the matching
# patch_*.py stage below. Both refuse to write unless they reproduce their owning analysis's
# published summary table. make_karyotype_source.py is the same kind of script, except that it
# reads the OneDrive tree, so it runs on the Mac; its patch stage, patch_karyotype.py, is above.
#
# DELIBERATELY NOT A STAGE: patch_leaf_tissue_analysis.py. It is a one-time correction to
# already-shipped data; build_expression.py is fixed at source, so a real rebuild already
# produces the corrected baseline and re-running the patch would be a no-op at best.

# --- can this machine run each class? --------------------------------------------------
have_sapelo2=0
if python3 scripts/preflight.py >/tmp/preflight.$$ 2>&1; then have_sapelo2=1; fi

# Ask the scripts themselves where the OneDrive tree is, so this probe cannot drift from them.
MS1_ROOT="$(python3 - <<'PY'
import re
src = open("scripts/patch_dup_v9_and_pav.py").read()
m = re.search(r'^MS1\s*=\s*"([^"]+)"', src, re.M)
print(m.group(1) if m else "")
PY
)"
have_onedrive=0
[ -n "$MS1_ROOT" ] && [ -d "$MS1_ROOT" ] && have_onedrive=1

avail() {
  case "$1" in
    sapelo2)  [ "$have_sapelo2"  = 1 ] ;;
    onedrive) [ "$have_onedrive" = 1 ] ;;
    *)        true ;;
  esac
}

echo "== source availability =="
echo "  Sapelo2 sources (/scratch, /work) : $([ $have_sapelo2  = 1 ] && echo present || echo ABSENT)"
echo "  OneDrive MS1_2026 tree            : $([ $have_onedrive = 1 ] && echo present || echo ABSENT)"
[ "$have_sapelo2" = 0 ] && { echo; echo "  preflight said:"; sed 's/^/    /' /tmp/preflight.$$; }
rm -f /tmp/preflight.$$

missing=()
for s in "${STAGES[@]}"; do
  IFS='|' read -r env script desc <<< "$s"
  avail "$env" || missing+=("$script  ($env)")
done

if [ ${#missing[@]} -gt 0 ]; then
  echo
  echo "  ${#missing[@]} stage(s) cannot run on this machine:"
  printf '    %s\n' "${missing[@]}"
  if [ "$ALLOW_PARTIAL" = 0 ]; then
    echo
    echo "REFUSING TO BUILD. build_data.py would wipe data/genes and this machine could not"
    echo "restore the layers listed above -- you would be left with a data/ that fails"
    echo "validation and cannot be repaired here."
    echo
    echo "  To do your half of a two-machine build:  scripts/build_all.sh --allow-partial"
    echo "  To recover a wiped tree at any time:     git checkout -- data/"
    exit 1
  fi
  echo
  echo "  --allow-partial given: running this machine's stages only."
  echo "  data/ WILL BE INCOMPLETE and validation WILL FAIL until the other machine runs."
fi

# --- run -------------------------------------------------------------------------------
n=0; total=${#STAGES[@]}
for s in "${STAGES[@]}"; do
  IFS='|' read -r env script desc <<< "$s"
  n=$((n + 1))
  if ! avail "$env"; then
    echo; echo "== $n/$total SKIPPED ($env unavailable): $desc =="
    continue
  fi
  echo; echo "== $n/$total $desc =="
  # shellcheck disable=SC2086
  python3 scripts/$script
done

echo; echo "== validate =="
if [ ${#missing[@]} -gt 0 ]; then
  echo "  (skipped: partial build, failures here would be expected and uninformative)"
else
  python3 scripts/validate_data.py
fi

echo; echo "== shard-derivable aggregates =="; python3 scripts/check_aggregates.py

echo; echo "== numbers stated in prose =="; python3 scripts/check_prose_numbers.py

echo; echo "== version consistency =="; python3 scripts/check_version.py

echo
if [ ${#missing[@]} -gt 0 ]; then
  echo "PARTIAL build complete. Commit and push, then run the same command on the machine"
  echo "that has the missing sources -- it finishes the job and rewrites the facet index."
else
  echo "Build complete. Now run the render checks:"
  echo "  python3 -m http.server 8931 --bind 127.0.0.1 &"
  echo "  node scripts/check.mjs"
fi
