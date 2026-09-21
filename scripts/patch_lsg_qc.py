#!/usr/bin/env python3
"""Per-gene evidence flags on EVERY gene of the LSG pool, the rerun that added Idesia included.

RULING (Chen, 2026-09-21; MS2_2026 CLAUDE.md commit 1e698f2). The pool is the frozen genEra call,
842 HAP1 + 883 HAP2, and every check on it is a flag: "for most of the analysis they are applied
and we plot the post QC for stronger signal but when looking for available candidates they are
used to flag because the pool is already small". A gene page is a candidate view, so it shows
every flag and drops nothing.

WHAT CHANGED 2026-09-21. This script used to DROP the 114 genes that fall below rank 18 in the
Idesia rerun, because the atlas then treated that rerun as the pool. Those genes are pool genes
again, and the rerun is one of their flags. Two fields are added:
  rr    the gene falls below rank 18 in the rerun that added Idesia and searched the full
        comparison panel (66 HAP1 + 48 HAP2). Read from sources/lsg_pool_idesia.tsv.gz, and
        asserted to agree with the ps.rr that patch_pool_frozen.py wrote.
  post  the gene is in the chapter's post-QC set, i.e. passes all four checks: not rr, not a
        tblastn retraction, not an abSENSE rejection, not WGD-era Ks. 589 HAP1 + 625 HAP2. This
        is ms2-lsg's `qc_survivor` column; check_ms2_canon.py compares it gene by gene.
`clean` is gone: it meant the three checks without the rerun, it never meant "no flag", and the
card that printed it hid 389 genes' other flags behind "No evidence-quality flag raised".

Constraints, checked here rather than trusted:
  1. Flags, not filters. The pool is set by patch_pool_frozen.py; this adds `qc` to exactly the
     genes it put in the pool, and asserts every source row lands on one.
  2. abSENSE fields are copied as-is (hdf flag, verdict string), never re-derived into a yes/no
     "is this gene old" claim; the card renders the flag names, and the calibration travels in
     manifest.lsg_qc.
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
RERUN = os.path.join(ROOT, "sources", "lsg_pool_idesia.tsv.gz")

# The atlas DERIVES the rerun flag and the post-QC set from its own two sources and checks both
# against ms2-lsg (check_ms2_canon.py). A second copy arriving in the flag source could disagree
# with the derivation silently, so the source must not carry them.
FORBIDDEN_COLUMNS = {"qc_survivor", "in_idesia_corrected_pool", "canonical_label", "group"}
WANT = {"pool": {"HAP1": 842, "HAP2": 883}, "rr": {"HAP1": 66, "HAP2": 48},
        "post": {"HAP1": 589, "HAP2": 625}}


def tf(v):
    return v.strip().lower() == "true"


def main():
    with gzip.open(SRC, "rt") as fh:
        rows = list(csv.DictReader(io.StringIO(fh.read()), delimiter="\t"))
    forbidden_present = FORBIDDEN_COLUMNS & set(rows[0])
    assert not forbidden_present, f"forbidden column(s) present in the source file: {forbidden_present}"
    with gzip.open(RERUN, "rt") as fh:
        rerun = {r["gene_id"]: r for r in csv.DictReader(io.StringIO(fh.read()), delimiter="\t")}
    print(f"source: {len(rows)} rows, header clean of {sorted(FORBIDDEN_COLUMNS)}")

    qc, hap_of = {}, {}
    for r in rows:
        g = r["gene_id"]
        falls = tf(rerun[g]["frozen_is_lsg"]) and not tf(rerun[g]["is_lsg"])
        three = tf(r["qc_clean"])   # NOT tblastn AND NOT abSENSE reject AND NOT WGD-era, per s45
        qc[g] = {
            "rr": falls,
            "ret": tf(r["tblastn_retract"]),
            "abs": tf(r["absense_reject"]),
            "hdf": r["absense_hdf_flag"],
            "verdict": r["absense_verdict"],
            "wgd": tf(r["wgd_flagged"]),
            "post": three and not falls,
            "syn_og": r["synteny_og_contested"] == "1",
            "syn_twin": r["synteny_twin_contested"] == "1",
            "syn_any": r["synteny_contested_any"] == "1",
            "plen": int(r["protein_len"]) if r["protein_len"] else None,
            "short": r["protein_len_lt100"] == "1",
            "stable": tf(r["sens_stable"]),
        }
        # the three-check roll-up must be what s45 says it is, or `post` means something else
        assert three == (not qc[g]["ret"] and not qc[g]["abs"] and not qc[g]["wgd"]), g
        hap_of[g] = r["hap"]

    patched, orphan, mismatch = set(), [], []
    for hap in ("hap1", "hap2"):
        for dp, _, fs in os.walk(os.path.join(DATA, "genes", hap)):
            for fn in fs:
                if not fn.endswith(".json"):
                    continue
                p = os.path.join(dp, fn)
                shard = json.load(open(p))
                for gid, rec in shard.items():
                    ps = rec.get("ps") or {}
                    in_pool = bool(ps.get("lsg"))
                    if gid not in qc:
                        rec.pop("qc", None)
                        if in_pool:
                            orphan.append(gid)          # a pool gene with no flag row
                        continue
                    if not in_pool:
                        orphan.append(gid)              # a flag row for a non-pool gene
                        continue
                    rr = ps.get("rr")
                    if qc[gid]["rr"] != bool(rr and not rr.get("lsg")):
                        mismatch.append(gid)
                    rec["qc"] = qc[gid]
                    patched.add(gid)
                with open(p, "w") as fh:
                    json.dump(shard, fh, separators=(",", ":"), sort_keys=True)
    assert not orphan, (f"{len(orphan)} genes where the flag source and the pool disagree, e.g. "
                        f"{orphan[:5]}. Run patch_pool_frozen.py first; the pool is set there.")
    assert not mismatch, f"{len(mismatch)} genes where the rerun flag disagrees with ps.rr: {mismatch[:5]}"
    assert patched == set(qc), f"{len(set(qc) - patched)} source rows never reached a shard"

    by = lambda key: {h: sum(1 for g in qc if hap_of[g] == h and qc[g][key]) for h in ("HAP1", "HAP2")}
    got = {"pool": {h: sum(1 for g in qc if hap_of[g] == h) for h in ("HAP1", "HAP2")},
           "rr": by("rr"), "post": by("post")}
    assert got == WANT, f"counts {got}, expected {WANT}"
    print(f"flags on all {len(patched)} pool genes; per haplotype {got}")

    man_path = os.path.join(DATA, "meta", "manifest.json")
    man = json.load(open(man_path))
    man["lsg_qc"] = {
        "pool_genes": len(patched),
        "per_haplotype": {
            "pool": got["pool"],
            "falls_below_18_in_the_idesia_rerun": got["rr"],
            "tblastn_retract": by("ret"),
            "absense_reject": by("abs"),
            "wgd_flagged": by("wgd"),
            "synteny_contested_any": by("syn_any"),
            "short_orf": by("short"),
            "diamond_sensitivity_unstable": {h: sum(1 for g in qc if hap_of[g] == h and not qc[g]["stable"])
                                             for h in ("HAP1", "HAP2")},
            "in_the_chapter_post_qc_set": got["post"],
        },
        "note": "Flags, not filters. Every one of the 1,725 pool genes carries its flags; nothing "
                "here removes, renumbers or filters a gene. The chapter's post-QC set (passes all "
                "four checks: the Idesia rerun, tblastn, abSENSE, WGD-era Ks) is used for its group "
                "comparisons; on a gene page it is one line under the flags. Counts are pass or "
                "flag counts, never a pool.",
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
            "not_retracted": "Nothing in the QC layer is withdrawn by this, and neither the "
                             "pool nor the Idesia-rerun flag rests on abSENSE: both come from "
                             "genEra ranks. What is qualified is the per-gene HDF flag and any "
                             "statement resting on it.",
        },
    }
    # NOTE: no data_version bump here. VERSION is the single source of truth and
    # build_facets.py stamps the manifest from it (see check_version.py). This script used to
    # bump the manifest key directly, which build_facets then silently overwrote -- so the
    # line it printed was never true. Bump VERSION instead.
    with open(man_path, "w") as fh:
        json.dump(man, fh, indent=1, sort_keys=True)
    print(f"manifest lsg_qc: {man['lsg_qc']['per_haplotype']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
