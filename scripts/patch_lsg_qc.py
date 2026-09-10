#!/usr/bin/env python3
"""TODO 23: fold the ms2-lsg agent's per-gene LSG evidence-quality flags into the shard.

Source already delivered and Chen-approved for shipping: sources/lsg_qc_flags.tsv.gz
(1,725 rows, the LSG pool only) + its provenance sidecar. This script only builds the
per-gene card data from that already-settled file -- read-only against it.

UPDATED 2026-09-10 (TODO 26/27). Two things changed under this script's feet:

  * The pool moved. `sources/lsg_qc_flags.tsv.gz` has 1,725 rows because it was cut against
    the frozen 12-species panel, which upstream WITHDREW on 2026-09-09 in favour of the
    Idesia-corrected 776/835. 114 of its rows are now for genes outside the pool. The
    source's own scope rule settles what to do with them -- "a non-pool gene has no
    young-age claim to qualify" -- so they are DROPPED, not carried and not silently kept.
    Nothing is lost by dropping them: patch_pool_idesia.py records the withdrawn call on
    every moved gene under `ps.frz`, so the gene page still shows that it used to be a pool
    gene and what it was called.
  * The abSENSE flags this file ships were calibrated for the first time (item 27), and the
    result is not reassuring. The numbers now travel with the flags, in manifest.lsg_qc.

Three constraints from the sidecar, load-bearing, checked here rather than just trusted:
  1. Flags, not filters. This script never changes which genes are in the pool -- it only
     adds a `qc` key to shards that are ALREADY in the pool (g.ps.rank >= 18), asserted.
  2. `qc_survivor` and `in_idesia_corrected_pool` are not in the source file at all --
     asserted absent from its header, so this script cannot ship them even by accident.
  3. abSENSE fields are copied as-is (hdf flag, verdict string), never re-derived into a
     yes/no "is this gene old" claim -- that reinterpretation is exactly what the sidecar
     warns against, so the JS card must render the flag names, not a paraphrase of them.
"""
import csv
import gzip
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SRC = os.path.join(ROOT, "sources", "lsg_qc_flags.tsv.gz")

FORBIDDEN_COLUMNS = {"qc_survivor", "in_idesia_corrected_pool"}


def tf(v):
    return v.strip().lower() == "true"


def main():
    with gzip.open(SRC, "rt") as fh:
        text = fh.read()
    rows = list(csv.DictReader(io.StringIO(text), delimiter="\t"))
    header = set(rows[0])
    forbidden_present = FORBIDDEN_COLUMNS & header
    assert not forbidden_present, f"forbidden column(s) present in the source file: {forbidden_present}"
    print(f"source: {len(rows)} rows, header clean of {FORBIDDEN_COLUMNS}")

    qc = {}
    for r in rows:
        qc[r["gene_id"]] = {
            "ret": tf(r["tblastn_retract"]),
            "abs": tf(r["absense_reject"]),
            "hdf": r["absense_hdf_flag"],
            "verdict": r["absense_verdict"],
            "wgd": tf(r["wgd_flagged"]),
            "clean": tf(r["qc_clean"]),
            "syn_og": r["synteny_og_contested"] == "1",
            "syn_twin": r["synteny_twin_contested"] == "1",
            "syn_any": r["synteny_contested_any"] == "1",
            "plen": int(r["protein_len"]) if r["protein_len"] else None,
            "short": r["protein_len_lt100"] == "1",
            "stable": tf(r["sens_stable"]),
        }

    genes_dir = os.path.join(DATA, "genes")
    patched, dropped, stale, missing = 0, 0, [], []
    shipped = set()   # the genes that actually carry a qc record when this finishes
    for hap in ("hap1", "hap2"):
        for dp, _, fs in os.walk(os.path.join(genes_dir, hap)):
            for fn in fs:
                if not fn.endswith(".json"):
                    continue
                p = os.path.join(dp, fn)
                shard = json.load(open(p))
                changed = False
                for gid, rec in shard.items():
                    ps = rec.get("ps") or {}
                    in_pool = (ps.get("rank") or -1) >= 18
                    if gid not in qc:
                        # a gene that ENTERED the pool would land here with no flags; the
                        # corrected panel adds none, and patch_pool_idesia.py asserts that.
                        if rec.pop("qc", None) is not None:
                            changed = True
                            dropped += 1
                        continue
                    if not in_pool:
                        # source row for a gene the corrected panel took out of the pool
                        stale.append(gid)
                        if rec.pop("qc", None) is not None:
                            changed = True
                            dropped += 1
                        continue
                    rec["qc"] = qc[gid]
                    shipped.add(gid)
                    changed = True
                    patched += 1
                if changed:
                    with open(p, "w") as fh:
                        json.dump(shard, fh, separators=(",", ":"), sort_keys=True)

    print(f"patched {patched} of {len(qc)} source rows with a qc record")
    print(f"  {len(stale)} source rows are for genes the corrected panel took out of the "
          "pool -- this file is cut against the withdrawn 842/883 -- and are not shipped "
          f"({dropped} qc records actually removed from shards this run; 0 on a re-run)")
    # every source row must be accounted for: either patched, or dropped because the
    # corrected panel took its gene out of the pool. Anything left over is a gene the
    # source names and no shard contains, which is a different and worse problem.
    if patched + len(stale) != len(qc):
        unfound = set(qc)
        for hap in ("hap1", "hap2"):
            for dp, _, fs in os.walk(os.path.join(genes_dir, hap)):
                for fn in fs:
                    if fn.endswith(".json"):
                        unfound -= set(json.load(open(os.path.join(dp, fn))))
        assert not unfound, f"{len(unfound)} qc genes never matched a shard: {list(unfound)[:5]}"
        raise AssertionError(
            f"{len(qc)} source rows, but {patched} patched + {len(stale)} out-of-pool does "
            "not account for them all, and every gene does exist in a shard")

    man_path = os.path.join(DATA, "meta", "manifest.json")
    man = json.load(open(man_path))
    # counted over what SHIPPED, not over the source file. The source is cut against the
    # withdrawn pool, so counting it would publish flag totals for 114 genes whose cards
    # do not exist -- the exact shape of defect TODO 24 was about.
    ship = [qc[g] for g in shipped]
    man["lsg_qc"] = {
        "pool_genes": len(ship),
        "source_rows": len(qc),
        "rows_dropped_out_of_corrected_pool": len(stale),
        "flags": {
            "tblastn_retract": sum(1 for v in ship if v["ret"]),
            "absense_reject": sum(1 for v in ship if v["abs"]),
            "wgd_flagged": sum(1 for v in ship if v["wgd"]),
            "synteny_contested_any": sum(1 for v in ship if v["syn_any"]),
            "qc_clean": sum(1 for v in ship if v["clean"]),
        },
        "flags_on_the_withdrawn_pool": {
            "note": "the same five counts over all 1,725 source rows, i.e. against the "
                    "frozen pool these flags were cut for. Kept so numbers already published "
                    "against that pool stay checkable.",
            "tblastn_retract": sum(1 for v in qc.values() if v["ret"]),
            "absense_reject": sum(1 for v in qc.values() if v["abs"]),
            "wgd_flagged": sum(1 for v in qc.values() if v["wgd"]),
            "synteny_contested_any": sum(1 for v in qc.values() if v["syn_any"]),
            "qc_clean": sum(1 for v in qc.values() if v["clean"]),
        },
        "note": "flags, not filters -- nothing here removes, renumbers or filters a gene, "
                "and the atlas must not use these fields to shrink the pool count. The pool "
                "size is set by data/meta manifest.lsg_pool, never by these flags.",
        "source_pool": "This file was cut against the WITHDRAWN frozen pool (1,725 rows). "
                       "Rows for genes the Idesia-corrected panel took out of the pool are "
                       "dropped here, per the source's own scope rule that a non-pool gene "
                       "has no young-age claim to qualify. The withdrawn call stays visible "
                       "on those genes under ps.frz.",
        "absense_calibration": {
            "headline": "abSENSE flags are worst calibrated at exactly the boundary that "
                        "defines this pool, and biased in the direction that over-calls a "
                        "young gene. Quote the flag with this number, never alone.",
            "measured": "2026-09-09, abSENSE --predall over 868,127 predicted-vs-observed "
                        "bitscore pairs (ms2-lsg analyses/absense_hdf, jobs 48015768_1/_2)",
            "global_fit": {"pearson_r_hap1": 0.9814, "pearson_r_hap2": 0.9827,
                           "mean_abs_error_bitscore": 44.5,
                           "coverage_of_nominal_99pct_PI_hap1": 0.8806,
                           "coverage_of_nominal_99pct_PI_hap2": 0.8715},
            "at_the_boundary_species": {
                "species": "Salix purpurea -- the rank-18 boundary. Every HDF flag on this "
                           "pool is a prediction at this species.",
                "coverage_of_nominal_99pct_PI_hap1": 0.610,
                "coverage_of_nominal_99pct_PI_hap2": 0.594,
                "median_bias_bitscore_hap1": 18.9,
                "median_bias_bitscore_hap2": 19.2,
                "direction": "abSENSE OVER-predicts what a Salix homolog would have scored. "
                             "An expected score that is too high makes an observed absence "
                             "look more surprising than it is, which under-estimates "
                             "detection_failure_prob and over-calls surprising_absence."},
            "for_contrast_in_genus": {"Populus trichocarpa": 0.982, "Populus nigra": 0.952,
                                      "Idesia polycarpa": 0.815},
            "this_is_the_optimistic_bound": "It is measured in-sample, and on the wrong "
                                            "genes: a Salix pair only exists for a gene that "
                                            "HAS a Salix homolog, which by definition is not "
                                            "an LSG. For a real PS18 gene the Salix "
                                            "prediction is pure out-of-sample extrapolation. "
                                            "0.59-0.61 is what the model achieves at that "
                                            "boundary on the easy cases.",
            "not_retracted": "Nothing in the QC layer is withdrawn by this, and the pool "
                             "correction does not rest on abSENSE at all -- 776/835 comes "
                             "from genEra ranks with Idesia added. What is qualified is the "
                             "per-gene HDF flag and any statement resting on it.",
        },
    }
    # NOTE: no data_version bump here. VERSION is the single source of truth and
    # build_facets.py stamps the manifest from it (see check_version.py). This script used to
    # bump the manifest key directly, which build_facets then silently overwrote -- so the
    # line it printed was never true. Bump VERSION instead.
    with open(man_path, "w") as fh:
        json.dump(man, fh, indent=1, sort_keys=True)
    print(f"flags: {man['lsg_qc']['flags']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
