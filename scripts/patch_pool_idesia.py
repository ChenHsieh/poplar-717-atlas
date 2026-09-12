#!/usr/bin/env python3
"""TODO 26: adopt the Idesia-corrected LSG pool, and SHOW the correction.

The atlas shipped the frozen 12-species genEra panel (842 HAP1 / 883 HAP2). Upstream
withdrew that pool on 2026-09-09 and replaced it with 776 / 835 (ms2-lsg
docs/CORRECTIONS.md C2, "Decision: ADOPTED (Chen, 2026-09-09)"). This script swaps in the
corrected call and keeps the frozen one visible on the 766 genes where they disagree.

WHY A PATCHER AND NOT A REBUILD. A full build cannot run on Sapelo2 -- four stages read the
OneDrive MS1_2026 tree, which is not mounted here, and build_all.sh refuses rather than
wipe data/genes it could not restore. So this patches the committed shards in place, the
same way patch_lsg_qc.py and patch_dup_v9_and_pav.py do.

FOUR CONSTRAINTS, ENFORCED HERE RATHER THAN TRUSTED:

  1. THE GATE. The source's `frozen_rank` must reproduce the rank the atlas is currently
     serving, for every gene, with no gene in one set and not the other. That is what makes
     this an auditable one-step correction instead of a re-derivation. If it ever fails,
     the two layers have drifted and swapping would silently mix panels -- so this refuses
     to write anything.

     The gate is checked against `ps.frz.rank` when a previous run already moved the gene,
     so re-running is idempotent rather than self-defeating.

  2. NO GENE ENTERS THE POOL. Upstream's evidence that Idesia adds real homology signal is
     that movement is one-directional: 66 + 48 leave, none enter. If a row ever claims
     otherwise the premise is broken, so `entered_pool_under_idesia` is asserted false on
     every row.

  3. THE EMBARGOED LABELS CANNOT SHIP. `canonical_label` and `group` name 10 unpublished
     candidate genes. TODO 22's hold is unchanged by C2's adoption -- the pool moving does
     not release the names. Asserted absent from the source header before a row is read,
     the same construction patch_lsg_qc.py uses for its two forbidden fields.

  4. PS18 AND PS19 ARE NEVER POOLED. 179 genes move PS19 -> PS18 and stay in the pool. A
     summary that adds the two strata together would hide the single most consequential
     part of this correction, so the manifest records them separately.

AFTER THIS RUNS, build_facets.py MUST RUN. It carries rank and the LSG flag, and TODO 24
is the record of what a stale facet index costs: Browse contradicting the gene pages it
links to, for 54,705 genes, passing every check.
"""
import csv
import gzip
import io
import json
import os
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SRC = os.path.join(ROOT, "sources", "lsg_pool_idesia.tsv.gz")

FORBIDDEN_COLUMNS = {"canonical_label", "group"}


def tf(v):
    return str(v).strip().lower() in ("true", "1")


def iv(v):
    v = (v or "").strip()
    return None if v in ("", "NA", "nan", "None") else int(float(v))


def fv(v):
    v = (v or "").strip()
    return None if v in ("", "NA", "nan", "None") else float(v)


def shard_paths(root):
    for dp, _, fs in os.walk(root):
        for fn in sorted(fs):
            if fn.endswith(".json"):
                yield os.path.join(dp, fn)


def main():
    with gzip.open(SRC, "rt") as fh:
        rows = list(csv.DictReader(io.StringIO(fh.read()), delimiter="\t"))
    header = set(rows[0])
    leaked = FORBIDDEN_COLUMNS & header
    assert not leaked, f"embargoed column(s) present in the shipped source: {leaked}"
    print(f"source: {len(rows)} rows, header clean of {sorted(FORBIDDEN_COLUMNS)}")

    src = {}
    for r in rows:
        assert not tf(r["entered_pool_under_idesia"]), (
            f"{r['gene_id']} claims to ENTER the pool under Idesia. Upstream's evidence that "
            "the correction adds real signal is that movement is one-directional; this row "
            "breaks that premise, so stop rather than publish it.")
        src[r["gene_id"]] = r

    # ---- gate: the source's frozen column must be the layer the atlas is serving ---------
    paths = list(shard_paths(os.path.join(DATA, "genes", "hap1"))) + \
            list(shard_paths(os.path.join(DATA, "genes", "hap2")))
    live = {}
    for p in paths:
        for gid, rec in json.load(open(p)).items():
            ps = rec.get("ps") or {}
            # idempotent: once patched, the frozen rank lives under ps.frz
            live[gid] = (ps.get("frz") or {}).get("rank", ps.get("rank"))

    only_atlas, only_src = set(live) - set(src), set(src) - set(live)
    assert not only_atlas and not only_src, (
        f"gene sets differ: {len(only_atlas)} only in atlas, {len(only_src)} only in source")
    bad = [(g, live[g], iv(src[g]["frozen_rank"])) for g in live
           if live[g] != iv(src[g]["frozen_rank"])]
    assert not bad, (
        f"GATE FAILED: {len(bad)} genes where the source's frozen_rank is not the rank this "
        f"atlas serves, e.g. {bad[:5]}. The two layers have drifted -- swapping now would mix "
        "panels silently. Refusing to write.")
    print(f"GATE PASS: frozen_rank reproduces the served rank for all {len(live)} genes")

    # ---- patch ---------------------------------------------------------------------------
    moved, pool, transitions = 0, Counter(), Counter()
    strata = Counter()
    tr_changed = 0
    for p in paths:
        shard = json.load(open(p))
        for gid, rec in shard.items():
            r = src[gid]
            ps = rec.setdefault("ps", {})
            frozen_rank = iv(r["frozen_rank"])
            new_rank = iv(r["rank"])
            frozen_name = (ps.get("frz") or {}).get("name", ps.get("name"))

            if new_rank != frozen_rank:
                # keep the withdrawn call visible; the gene page renders both
                ps["frz"] = {"rank": frozen_rank, "name": frozen_name,
                             "lsg": tf(r["frozen_is_lsg"])}
                moved += 1
                transitions[f"{frozen_rank}->{new_rank}"] += 1
            else:
                ps.pop("frz", None)

            ps["rank"] = new_rank
            ps["name"] = r["phylostratum"] or None
            ps["lsg"] = tf(r["is_lsg"])
            # tax_rep is a percentage over the PANEL, and the panel gained a genome, so it
            # moves for genes whose rank did not. Counted rather than changed quietly.
            tr = fv(r["tax_rep"])
            if tr != ps.get("tr"):
                tr_changed += 1
            if tr is not None:
                ps["tr"] = tr
            else:
                ps.pop("tr", None)
            if ps["lsg"]:
                pool[r["hap"]] += 1
                strata[f"{r['hap']}_PS{new_rank}"] += 1
        with open(p, "w") as fh:
            json.dump(shard, fh, separators=(",", ":"), sort_keys=True)

    # is_lsg must remain exactly `rank >= 18` -- the RULE did not change, only the ranks did
    off = [g for g, r in src.items() if tf(r["is_lsg"]) != ((iv(r["rank"]) or -1) >= 18)]
    assert not off, f"{len(off)} genes where is_lsg disagrees with rank >= 18, e.g. {off[:5]}"

    print(f"patched {len(src)} genes; {moved} carry a changed rank")
    print(f"  tax_rep rewritten on {tr_changed} genes (0 on a re-run -- this is idempotent). "
          "tax_rep moves for genes whose RANK did not: it is a percentage over the panel, and "
          "the panel gained a genome.")
    print("  pool:", dict(pool), "total", sum(pool.values()))
    print("  PS18/PS19, never pooled:", {k: v for k, v in sorted(strata.items())})
    print("  largest transitions:", dict(transitions.most_common(5)))
    assert sum(pool.values()) == 1611, f"expected the adopted pool of 1611, got {sum(pool.values())}"

    # ---- manifest -------------------------------------------------------------------------
    # The overview page reads man.phylostrat.ladder and .by_rank. Those are AGGREGATES over
    # the ranks this script just changed, and build_phylostrat.py -- which owns them -- needs
    # sources this machine cannot reach. Leaving them would put a 1,725-gene pool on the
    # overview page and a 1,611-gene pool on the gene pages and in Browse. That is precisely
    # the failure TODO 24 recorded: an aggregate that renders fine, validates fine, and
    # disagrees with the records it summarises. So recompute them here, from the shards.
    man_path = os.path.join(DATA, "meta", "manifest.json")
    man = json.load(open(man_path))

    by_rank, names = {"hap1": Counter(), "hap2": Counter()}, {}
    for gid, r in src.items():
        hap = "hap1" if r["hap"] == "HAP1" else "hap2"
        rk = iv(r["rank"])
        by_rank[hap]["NA" if rk is None else str(rk)] += 1
        if rk is not None and r["phylostratum"]:
            names[rk] = r["phylostratum"]
    ps_man = man.setdefault("phylostrat", {})
    old_lsg = sum(v for h in ("hap1", "hap2")
                  for k, v in (ps_man.get("by_rank", {}).get(h, {}) or {}).items()
                  if k != "NA" and int(k) >= 18)
    ps_man["by_rank"] = {h: dict(sorted(c.items())) for h, c in by_rank.items()}
    ps_man["ladder"] = {h: [{"rank": rk, "name": names[rk], "n": by_rank[h][str(rk)]}
                            for rk in sorted(names)]
                        for h in ("hap1", "hap2")}
    # summary.ps_rank is a THIRD copy of the same distribution, written by build_data.py (which
    # wipes data/genes and so cannot run here) and read by the HOME PAGE to compute
    # "lineage-specific candidates". It was missed when the ladder was fixed, and the home page
    # spent three versions showing the withdrawn 1,725 while every other page said 1,611.
    # Recomputed here from the same counts, so the two cannot diverge again.
    # TWO CONVENTIONS for "no rank", both pre-existing and both correct for their consumer:
    # phylostrat.by_rank uses "NA" (phylostrat.js reads `.NA`), summary.ps_rank uses "None"
    # (what build_data.py wrote, and what validate_data.py and check_aggregates.py compare
    # against). Translate rather than propagate, or this writes a key its readers do not know.
    summ = man.setdefault("summary", {})
    merged = Counter()
    for hcnt in by_rank.values():
        for k, v in hcnt.items():
            merged["None" if k == "NA" else k] += v
    ge18 = lambda d: sum(v for k, v in (d or {}).items() if k.isdigit() and int(k) >= 18)
    old_ps = summ.get("ps_rank")
    summ["ps_rank"] = dict(sorted(merged.items()))
    if old_ps != summ["ps_rank"]:
        print(f"summary.ps_rank recomputed; home-page PS>=18 total "
              f"{ge18(old_ps)} -> {ge18(merged)}")

    new_lsg = sum(by_rank[h][str(rk)] for h in ("hap1", "hap2") for rk in range(18, 20))
    print(f"phylostrat ladder recomputed from the shards: LSG total {old_lsg} -> {new_lsg}")
    assert new_lsg == 1611, f"ladder disagrees with the shards: {new_lsg}"
    ps_man["note"] = (
        "LSG pool = rank >= 18 (PS18 Populus + PS19 hybrid-only), per the chapter definition. "
        "PS17 Saliceae is flanking context and is not in the pool. Ranks are the "
        "Idesia-corrected 13-genome panel adopted 2026-09-09; the withdrawn 12-genome call is "
        "kept per gene under ps.frz wherever the two disagree.")
    man["lsg_pool"] = {
        "canonical": {"hap1": pool.get("HAP1", 0), "hap2": pool.get("HAP2", 0),
                      "total": sum(pool.values()),
                      "panel": "13 genomes, Idesia polycarpa added"},
        "withdrawn": {"hap1": 842, "hap2": 883, "total": 1725,
                      "panel": "12 genomes, frozen genEra panel"},
        "adopted": "Chen, 2026-09-09; ms2-lsg docs/CORRECTIONS.md C2",
        "genes_with_a_changed_rank": moved,
        "genes_with_a_changed_tax_rep": tr_changed,
        "tax_rep_note": "tax_rep is the fraction of the panel's genomes represented in the "
                        "gene's stratum, so it moves for genes whose RANK did not: the "
                        "denominator went from 12 genomes to 13. Not a re-call, a re-scaling.",
        "left_pool": 114, "entered_pool": 0,
        "ps18_ps19": {k: v for k, v in sorted(strata.items()) if k.endswith(("PS18", "PS19"))},
        "note": "PS18 and PS19 are never pooled. 179 genes moved PS19 -> PS18 and stayed in "
                "the pool; none moved the other way. Numbers published against the frozen "
                "pool are correct statements about that pool and are not retracted -- they "
                "must name it.",
        "not_licensed": "The corrected pool is not evidence that the surviving calls are "
                        "modelled-safe. abSENSE corrects detection FAILURE (sensitivity); a "
                        "missing genome is taxon SAMPLING (coverage). 86% of the genes Idesia "
                        "removed were `no_prediction` in the frozen abSENSE run.",
    }
    with open(man_path, "w") as fh:
        json.dump(man, fh, indent=1, sort_keys=True)
    print(f"manifest: lsg_pool block written")
    print("\nNEXT: run build_facets.py -- it carries rank and the LSG flag (TODO 24's rule).")


if __name__ == "__main__":
    main()
