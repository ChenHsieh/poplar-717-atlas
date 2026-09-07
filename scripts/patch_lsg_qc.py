#!/usr/bin/env python3
"""TODO 23: fold the ms2-lsg agent's per-gene LSG evidence-quality flags into the shard.

Source already delivered and Chen-approved for shipping: sources/lsg_qc_flags.tsv.gz
(1,725 rows, the LSG pool only) + its provenance sidecar. This script only builds the
per-gene card data from that already-settled file -- read-only against it.

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
    patched, not_in_pool, missing = 0, [], []
    for hap in ("hap1", "hap2"):
        for dp, _, fs in os.walk(os.path.join(genes_dir, hap)):
            for fn in fs:
                if not fn.endswith(".json"):
                    continue
                p = os.path.join(dp, fn)
                shard = json.load(open(p))
                changed = False
                for gid, rec in shard.items():
                    if gid not in qc:
                        continue
                    ps = rec.get("ps") or {}
                    if (ps.get("rank") or -1) < 18:
                        not_in_pool.append(gid)  # would violate constraint 1 -- must not happen
                    rec["qc"] = qc[gid]
                    changed = True
                    patched += 1
                if changed:
                    with open(p, "w") as fh:
                        json.dump(shard, fh, separators=(",", ":"), sort_keys=True)

    assert not not_in_pool, f"{len(not_in_pool)} qc records attached outside the LSG pool: {not_in_pool[:5]}"
    print(f"patched {patched} of {len(qc)} pool genes with a qc record")
    if patched != len(qc):
        unfound = set(qc)
        for hap in ("hap1", "hap2"):
            for dp, _, fs in os.walk(os.path.join(genes_dir, hap)):
                for fn in fs:
                    if fn.endswith(".json"):
                        unfound -= set(json.load(open(os.path.join(dp, fn))))
        assert not unfound, f"{len(unfound)} qc genes never matched a shard: {list(unfound)[:5]}"

    man_path = os.path.join(DATA, "meta", "manifest.json")
    man = json.load(open(man_path))
    man["lsg_qc"] = {
        "pool_genes": len(qc),
        "flags": {
            "tblastn_retract": sum(1 for v in qc.values() if v["ret"]),
            "absense_reject": sum(1 for v in qc.values() if v["abs"]),
            "wgd_flagged": sum(1 for v in qc.values() if v["wgd"]),
            "synteny_contested_any": sum(1 for v in qc.values() if v["syn_any"]),
            "qc_clean": sum(1 for v in qc.values() if v["clean"]),
        },
        "note": "flags, not filters -- the LSG pool size (842 HAP1 + 883 HAP2) is unchanged "
                "by this data and must never be filtered by these fields.",
    }
    parts = [int(x) for x in man["data_version"].split(".")]
    parts[-1] += 1
    man["data_version"] = ".".join(map(str, parts))
    with open(man_path, "w") as fh:
        json.dump(man, fh, indent=1, sort_keys=True)
    print(f"manifest: data_version -> {man['data_version']}")
    print(f"flags: {man['lsg_qc']['flags']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
