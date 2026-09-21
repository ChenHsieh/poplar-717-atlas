#!/usr/bin/env python3
"""The LSG pool is the frozen genEra call; the rerun that added Idesia is information on a gene.

RULING (Chen, 2026-09-21; MS2_2026 CLAUDE.md commit 1e698f2): "the 842/883 is the frozen but the
various QC steps from Idesia to synteny to abSENSE ... are all for flagging". The pool is 842 HAP1
+ 883 HAP2 and does not change. The rerun that added Idesia polycarpa is one check among several,
and it becomes a per-gene flag (patch_lsg_qc.py), not the pool's definition.

HISTORY. This file was patch_pool_idesia.py, which on 2026-09-10 swapped the rerun's ranks IN
(776 / 835) and kept the frozen call under `ps.frz`. That is reversed here: `ps` carries the frozen
call again, and the rerun's call is kept under `ps.rr` wherever its rank differs. The rerun was
also the first run to search the full comparison panel (the frozen run searched NCBI nr only), so
a rank change there is not always due to Idesia, and nothing here says it is.

WHAT IT WRITES, per gene:
  ps.rank, ps.name, ps.lsg, ps.tr   the frozen call (sources/lsg_pool_frozen.tsv.gz)
  ps.rr = {rank, name, lsg}         the rerun's call, only where its rank differs (766 genes)
  ps.frz                            removed (it was the frozen call, now primary)
and the manifest aggregates that summarise those ranks, recomputed from the same counts.

GATES, enforced rather than trusted:
  1. The frozen source must reproduce the frozen rank the atlas is serving for every gene, in
     any of the three states a shard can be in: freshly built (ps.rank is frozen), swapped by
     the old patcher (ps.frz holds it), or already patched by this one (ps.rank again).
  2. The rerun never moves a gene INTO the pool (upstream's premise; asserted per row).
  3. No candidate-label column in either source.
  4. The pool is exactly 842 HAP1 + 883 HAP2, split PS18/PS19 392/450 and 454/429, never summed
     across strata in the manifest.

AFTER THIS RUNS, patch_lsg_qc.py must run (it flags the pool genes this defines), then
patch_map_overlays.py and build_facets.py (both summarise ps.lsg / ps.rank).
"""
import csv
import gzip
import io
import json
import os
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
FROZEN = os.path.join(ROOT, "sources", "lsg_pool_frozen.tsv.gz")
RERUN = os.path.join(ROOT, "sources", "lsg_pool_idesia.tsv.gz")

FORBIDDEN_COLUMNS = {"canonical_label", "group"}
WANT_POOL = {"HAP1": 842, "HAP2": 883}
WANT_STRATA = {"HAP1_PS18": 392, "HAP1_PS19": 450, "HAP2_PS18": 454, "HAP2_PS19": 429}


def tf(v):
    return str(v).strip().lower() in ("true", "1")


def iv(v):
    v = (v or "").strip()
    return None if v in ("", "NA", "nan", "None") else int(float(v))


def fv(v):
    v = (v or "").strip()
    return None if v in ("", "NA", "nan", "None") else float(v)


def read(path):
    with gzip.open(path, "rt") as fh:
        rows = list(csv.DictReader(io.StringIO(fh.read()), delimiter="\t"))
    leaked = FORBIDDEN_COLUMNS & set(rows[0])
    assert not leaked, f"{os.path.basename(path)} carries embargoed column(s) {leaked}"
    return {r["gene_id"]: r for r in rows}


def shard_paths(root):
    for dp, _, fs in os.walk(root):
        for fn in sorted(fs):
            if fn.endswith(".json"):
                yield os.path.join(dp, fn)


def main():
    frozen, rerun = read(FROZEN), read(RERUN)
    assert set(frozen) == set(rerun), "the frozen and rerun sources cover different genes"
    for g, r in rerun.items():
        assert not tf(r["entered_pool_under_idesia"]), f"{g} claims to ENTER the pool in the rerun"
        assert iv(r["frozen_rank"]) == iv(frozen[g]["rank"]), f"{g}: the two sources disagree"
    print(f"sources: {len(frozen)} genes, both free of {sorted(FORBIDDEN_COLUMNS)}")

    paths = list(shard_paths(os.path.join(DATA, "genes", "hap1"))) + \
            list(shard_paths(os.path.join(DATA, "genes", "hap2")))

    # ---- gate 1: the frozen rank the atlas serves, in whichever state the shard is in ------
    live = {}
    for p in paths:
        for gid, rec in json.load(open(p)).items():
            ps = rec.get("ps") or {}
            live[gid] = (ps["frz"]["rank"] if ps.get("frz") else ps.get("rank"))
    assert set(live) == set(frozen), (
        f"gene sets differ: {len(set(live) - set(frozen))} only in atlas, "
        f"{len(set(frozen) - set(live))} only in source")
    bad = [(g, live[g], iv(frozen[g]["rank"])) for g in live if live[g] != iv(frozen[g]["rank"])]
    assert not bad, (f"GATE FAILED: {len(bad)} genes where the frozen source is not the frozen rank "
                     f"this atlas serves, e.g. {bad[:5]}. Refusing to write.")
    print(f"GATE PASS: the frozen source reproduces the served frozen rank for all {len(live)} genes")

    # ---- patch ---------------------------------------------------------------------------
    pool, strata, moved, transitions = Counter(), Counter(), 0, Counter()
    for p in paths:
        shard = json.load(open(p))
        for gid, rec in shard.items():
            f, r = frozen[gid], rerun[gid]
            ps = rec.setdefault("ps", {})
            rank, rr_rank = iv(f["rank"]), iv(r["rank"])
            ps.pop("frz", None)
            ps["rank"] = rank
            ps["name"] = f["phylostratum"] or None
            ps["lsg"] = tf(f["is_lsg"])
            tr = fv(f["tax_rep"])
            # an unplaced gene carries no representativeness, as build_data.py always wrote it
            if tr is not None and rank is not None:
                ps["tr"] = tr
            else:
                ps.pop("tr", None)
            if rr_rank != rank:
                ps["rr"] = {"rank": rr_rank, "name": r["phylostratum"] or None,
                            "lsg": tf(r["is_lsg"])}
                moved += 1
                transitions[f"{rank}->{rr_rank}"] += 1
            else:
                ps.pop("rr", None)
            if ps["lsg"]:
                pool[f["hap"]] += 1
                strata[f"{f['hap']}_PS{rank}"] += 1
        with open(p, "w") as fh:
            json.dump(shard, fh, separators=(",", ":"), sort_keys=True)

    off = [g for g, f in frozen.items() if tf(f["is_lsg"]) != ((iv(f["rank"]) or -1) >= 18)]
    assert not off, f"{len(off)} genes where is_lsg disagrees with rank >= 18, e.g. {off[:5]}"
    assert dict(pool) == WANT_POOL, f"pool is {dict(pool)}, expected {WANT_POOL}"
    assert dict(strata) == WANT_STRATA, f"PS18/PS19 split is {dict(strata)}, expected {WANT_STRATA}"
    rr_pool = Counter(r["hap"] for r in rerun.values() if tf(r["is_lsg"]))
    rr_out = Counter(r["hap"] for g, r in rerun.items()
                     if tf(frozen[g]["is_lsg"]) and not tf(r["is_lsg"]))
    rr_strata = Counter(f"{r['hap']}_PS{iv(r['rank'])}" for r in rerun.values() if tf(r["is_lsg"]))
    print(f"patched {len(frozen)} genes; the rerun gives a different rank for {moved}")
    print(f"  pool (frozen call): {dict(pool)}  PS18/PS19: {dict(sorted(strata.items()))}")
    print(f"  at rank >= 18 in the rerun: {dict(rr_pool)}; falls below 18 there: {dict(rr_out)}")
    print(f"  largest rank changes in the rerun: {dict(transitions.most_common(5))}")

    # ---- manifest: every aggregate over these ranks, recomputed from the same counts --------
    man_path = os.path.join(DATA, "meta", "manifest.json")
    man = json.load(open(man_path))
    by_rank, names = {"hap1": Counter(), "hap2": Counter()}, {}
    for g, f in frozen.items():
        hap = "hap1" if f["hap"] == "HAP1" else "hap2"
        rk = iv(f["rank"])
        by_rank[hap]["NA" if rk is None else str(rk)] += 1
        if rk is not None and f["phylostratum"]:
            names[rk] = f["phylostratum"]
    ps_man = man.setdefault("phylostrat", {})
    ps_man["by_rank"] = {h: dict(sorted(c.items())) for h, c in by_rank.items()}
    ps_man["ladder"] = {h: [{"rank": rk, "name": names[rk], "n": by_rank[h][str(rk)]}
                            for rk in sorted(names)] for h in ("hap1", "hap2")}
    ps_man["note"] = (
        "LSG pool = rank >= 18 in the frozen genEra call (PS18 Populus + PS19 hybrid-only): "
        "842 HAP1 + 883 HAP2, and it does not change (Chen, 2026-09-21). Ranks here are that "
        "call. The rerun that added Idesia and searched the full comparison panel is kept per gene "
        "under ps.rr wherever its rank differs, and is a flag on pool genes, not the pool.")
    # summary.ps_rank is read by the home page; "NA" there is spelled "None" (build_data.py's key).
    merged = Counter()
    for hcnt in by_rank.values():
        for k, v in hcnt.items():
            merged["None" if k == "NA" else k] += v
    man.setdefault("summary", {})["ps_rank"] = dict(sorted(merged.items()))
    man["lsg_pool"] = {
        "pool": {"hap1": pool["HAP1"], "hap2": pool["HAP2"], "total": sum(pool.values()),
                 "ps18_ps19": dict(sorted(strata.items())),
                 "call": "the frozen genEra call (an NCBI nr search; its configured comparison "
                         "panel was never searched)"},
        "ruling": "Chen, 2026-09-21: the pool is the frozen 842/883 and does not change; every "
                  "check on it, the rerun that added Idesia included, is a per-gene flag. "
                  "MS2_2026 CLAUDE.md, commit 1e698f2.",
        "rerun": {"what": "the genEra rerun that added Idesia polycarpa and was the first to search "
                          "the full comparison panel",
                  "at_rank_18_or_above": {"hap1": rr_pool["HAP1"], "hap2": rr_pool["HAP2"]},
                  "ps18_ps19": dict(sorted(k_v for k_v in rr_strata.items())),
                  "pool_genes_below_rank_18": {"hap1": rr_out["HAP1"], "hap2": rr_out["HAP2"]},
                  "genes_with_a_different_rank": moved,
                  "note": "These are pass counts of one check, not a pool. A rank change here is "
                          "not always due to Idesia, because the frozen call never searched the "
                          "panel at all."},
        "never": "PS18 and PS19 are never pooled without their split.",
    }
    with open(man_path, "w") as fh:
        json.dump(man, fh, indent=1, sort_keys=True)
    print("manifest: phylostrat, summary.ps_rank and lsg_pool rewritten")
    print("\nNEXT: patch_lsg_qc.py, then patch_map_overlays.py, then build_facets.py.")


if __name__ == "__main__":
    main()
