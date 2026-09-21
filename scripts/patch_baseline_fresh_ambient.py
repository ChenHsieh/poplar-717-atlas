#!/usr/bin/env python3
"""One-time correction: the expression baseline is wild-type controls grown fresh at ambient CO2.

DECISION (Chen, 2026-09-21): "use WT fresh ambient-CO2 controls for the baseline". The rule, its
reasons and the median it takes live in scripts/expr_baseline.py, shared with build_expression.py
(fixed at source in the same commit) and validate_data.py.

WHAT CHANGES. Study 1's 500 ppm CO2 and recovered controls, 44 of its 58 wild-type controls, leave
the baseline. So every gene's tissue medians (x.t), sample counts (x.n), tau (x.tau) and peak
tissue (x.top) are recomputed. Two errors in the same arithmetic are fixed with it, because the
new baseline would have exposed both: an even-n "median" was the upper of the two middle values
(for the two-sample old-leaf baseline, the larger sample), and a gene whose every tissue median
is 0 was given a peak tissue (the first tissue in sample order, young leaf, for 2,154 genes).

WHY IT CAN RUN HERE. Nothing new is read. Every gene's 652-sample vector already ships, one gzip
member per gene in data/expr/raw_{hap}.gzb at [offset, length] = x.o, and the baseline is an
aggregation of it. Same approach as patch_leaf_tissue_analysis.py.

THE GATE. Before writing anything, the old rule and the old median must reproduce the shipped
x.t, x.n, x.tau and x.top for every one of the 63,960 genes. If they do not, this script's
reading of the vectors or of the old arithmetic is wrong, and it refuses.

Touches data/genes/**/*.json (x.t/n/tau/top only; x.b, x.o, x.co, x.cb and x.max are
untouched: none depends on which samples are the baseline), data/expr/samples.json (adds
`base`, true for a baseline sample) and data/meta/manifest.json. Then run build_locus.py,
patch_map_overlays.py and build_facets.py, which summarise x.tau and x.top.
"""
import gzip
import json
import os
import sys
from collections import Counter

import expr_baseline as eb

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# What the new rule must select, from the sample table read 2026-09-21. A different count means
# the sample table changed under this script, which is a reason to stop, not to adapt.
WANT_BASELINE_N = {"bark": 29, "bud": 5, "callus": 1, "catkin": 4, "leaf": 55, "leaf_old": 2,
                   "leaf_young": 3, "root": 18, "stem": 2, "xylem": 50}
WANT_LEFT_OUT = {"bark": 9, "leaf_old": 9, "leaf_young": 8, "root": 9, "xylem": 9}
WATCH = "PtXaTreH.05G120200"   # the gene the 2026-09-05 leaf split was verified on


def shard_paths(root):
    for dp, _, fs in os.walk(root):
        for fn in sorted(fs):
            if fn.endswith(".json"):
                yield os.path.join(dp, fn)


def main():
    sp = os.path.join(DATA, "expr", "samples.json")
    samples = json.load(open(sp))
    left_out = eb.audit(samples)
    old_idx = eb.tissue_index(samples, eb.is_wt_control)
    new_idx = eb.tissue_index(samples, eb.in_baseline)
    got_new = {t: len(v) for t, v in new_idx.items()}
    got_out = dict(Counter(s["tissue_analysis"] for s in left_out))
    assert dict(sorted(got_new.items())) == WANT_BASELINE_N, f"baseline n {got_new}"
    assert dict(sorted(got_out.items())) == WANT_LEFT_OUT, f"left out {got_out}"
    assert list(new_idx) == list(old_idx), "tissue order changed, so peak-tissue ties would move"
    kept1 = [s for s in samples if s["study"] == 1 and eb.in_baseline(s)]
    assert all(s["growth"] == "380CO2" and s["additional"] is None for s in kept1), \
        "a study 1 baseline sample is not a fresh 380 ppm control"
    print(f"baseline: {sum(got_new.values())} samples (was {sum(len(v) for v in old_idx.values())}); "
          f"left out {len(left_out)}, all study 1, per tissue {dict(sorted(got_out.items()))}")
    print(f"  study 1 keeps {len(kept1)} controls, all 380CO2 and fresh")

    blobs = {h: open(os.path.join(DATA, "expr", f"raw_{h}.gzb"), "rb").read()
             for h in ("hap1", "hap2")}

    def vector(hap, x):
        off, ln = x["o"]
        v = json.loads(gzip.decompress(blobs[hap][off:off + ln]))
        assert len(v) == len(samples), f"vector of {len(v)}, expected {len(samples)}"
        return v

    # ---- gate: the old rule reproduces what is shipped, for every gene ---------------------
    plan, bad, n = {}, [], 0
    for hap in ("hap1", "hap2"):
        for p in shard_paths(os.path.join(DATA, "genes", hap)):
            for gid, rec in json.load(open(p)).items():
                x = rec.get("x")
                if not x:
                    continue
                n += 1
                v = vector(hap, x)
                old = eb.summarise(v, old_idx, med=eb.upper_median, zero_has_peak=True)
                if old != {k: x.get(k) for k in ("t", "n", "tau", "top")}:
                    bad.append(gid)
                    continue
                plan[gid] = (old, eb.summarise(v, new_idx),
                             eb.summarise(v, new_idx, med=eb.upper_median))
    if bad:
        raise SystemExit(f"GATE FAILED: the old rule does not reproduce the shipped baseline for "
                         f"{len(bad)} of {n} genes, e.g. {bad[:5]}. Nothing written.")
    print(f"GATE PASS: the old rule and old median reproduce x.t, x.n, x.tau and x.top exactly "
          f"for all {n} genes")

    # ---- what moves, reported before it is written ---------------------------------------
    cells = sum(len(o["t"]) for o, _, _ in plan.values())
    moved = Counter(t for o, nw, _ in plan.values() for t in nw["t"] if nw["t"][t] != o["t"][t])
    by_median = sum(1 for _, nw, up in plan.values() for t in nw["t"] if nw["t"][t] != up["t"][t])
    tau_moved = sum(1 for o, nw, _ in plan.values() if nw["tau"] != o["tau"])
    top_moved = sum(1 for o, nw, _ in plan.values()
                    if o["top"] != nw["top"] and nw["top"] is not None)
    zero_old = sum(1 for o, _, _ in plan.values() if max(o["t"].values()) <= 0)
    zero_new = sum(1 for _, nw, _ in plan.values() if nw["top"] is None)
    tau_none_new = sum(1 for _, nw, _ in plan.values() if nw["tau"] is None)
    print(f"tissue medians changed: {sum(moved.values())} of {cells} gene x tissue values, by "
          f"tissue {dict(sorted(moved.items()))}")
    print(f"  of which the median rule alone (upper -> true median, on the new samples): {by_median}")
    print(f"  tau changed on {tau_moved} genes; tau not computable on {tau_none_new}")
    print(f"  peak tissue moved on {top_moved} genes; genes with no expressed tissue: "
          f"{zero_old} before (all given a peak tissue), {zero_new} now (none given one)")
    if WATCH in plan:
        o, nw, _ = plan[WATCH]
        print(f"  {WATCH}: before {o}\n  {' ' * len(WATCH)}  after  {nw}")

    if "--dry-run" in sys.argv:
        print("\n--dry-run: nothing written")
        return 0

    # ---- write ----------------------------------------------------------------------------
    patched = 0
    for hap in ("hap1", "hap2"):
        for p in shard_paths(os.path.join(DATA, "genes", hap)):
            shard = json.load(open(p))
            changed = False
            for gid, rec in shard.items():
                if gid not in plan:
                    continue
                _, nw, _ = plan[gid]
                cur = {k: rec["x"].get(k) for k in ("t", "n", "tau", "top")}
                if cur != nw:
                    rec["x"].update(nw)
                    changed = True
                    patched += 1
            if changed:
                with open(p, "w") as fh:
                    json.dump(shard, fh, separators=(",", ":"), sort_keys=True)
    print(f"patched {patched} gene records")

    for s in samples:
        s["base"] = eb.in_baseline(s)
    with open(sp, "w") as fh:
        json.dump(samples, fh, separators=(",", ":"))
    print(f"samples.json: `base` on all {len(samples)} rows, {sum(s['base'] for s in samples)} true")

    mp = os.path.join(DATA, "meta", "manifest.json")
    man = json.load(open(mp))
    e = man["expression"]
    before = e["tissue_wt_control_n"]
    e["tissue_wt_control_n"] = dict(sorted(got_new.items()))
    e["n_genes_with_baseline"] = sum(1 for _, nw, _ in plan.values() if nw["top"] is not None)
    e["baseline"] = {
        "rule": eb.RULE,
        "decided": eb.DECISION,
        "n_samples": sum(got_new.values()),
        "left_out": {"study": 1, "n": len(left_out), "per_tissue": dict(sorted(got_out.items())),
                     "why": "500 ppm CO2, or recovered after re-watering"},
        "median": eb.MEDIAN_RULE,
        "peak": "none when every tissue's median is 0",
        "tau": "Yanai's tau over the baseline medians of every tissue except callus",
    }
    man.setdefault("corrections", []).append({
        "date": "2026-09-21",
        "what": "expression baseline = wild-type controls grown fresh at ambient CO2",
        "why": eb.DECISION + ". Study 1's 500 ppm and recovered controls had been in it, "
               "because the baseline read the raw control flag.",
        "also": "an even-n median is now the mean of the two middle values (was the upper one), "
                "and a gene with no expressed tissue has no peak tissue (was young leaf)",
        "before_tissue_wt_control_n": before,
        "after_tissue_wt_control_n": e["tissue_wt_control_n"],
        "detail": "CHANGELOG.md 0.16.0, scripts/expr_baseline.py",
    })
    with open(mp, "w") as fh:
        json.dump(man, fh, indent=1, sort_keys=True)
    print("manifest: expression.tissue_wt_control_n, .baseline, .n_genes_with_baseline, and a "
          "corrections entry")
    print("\nNEXT: build_locus.py, patch_map_overlays.py, then build_facets.py.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
