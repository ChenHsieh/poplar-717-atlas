#!/usr/bin/env python3
"""
Builds data/index/facets.json -- one compact row per gene, in the SAME ORDER as
index/genes.json, holding every field the browse view can filter or sort on.

Why a separate index at all: filtering 63,960 genes by "PS >= 18 and private and tau >= 0.8"
would otherwise mean fetching all 39 gene shards (39 MB) and 257 expression buckets (208 MB).
The facet index is ~2 MB raw / ~500 KB gzipped and is the only thing browse loads.

Encoding is positional, with the vocabularies inlined, so the file stays small and needs no
schema knowledge on the client beyond `cols`.

PATCHER ORDER: runs LAST -- it reads fields written by all three earlier builds.
"""
import json, os, sys
from collections import Counter

ATLAS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# TODO 7e: "expressed in tissue Y" needs a per-tissue value, and the index carried only tau
# and the single peak tissue. Ten booleans per gene is one 10-bit integer, 0.26 MB raw over
# 63,960 genes, rather than ten columns. The ORDER lives in the file's own vocab so the
# client never hardcodes it and the two cannot drift.
#
# THE THRESHOLD IS DECLARED, NOT BURIED: median TPM > 1 across the WT-control baseline -- the
# same ">1" convention the chromatin layer already uses for "expressed in leaf". It is shown
# in the filter's own label so nobody reads "expressed" as an absolute claim.
XIN_TISSUES = ['leaf_young', 'leaf', 'leaf_old', 'xylem', 'bark', 'root', 'stem', 'bud', 'catkin', 'callus']
XIN_MIN_TPM = 1.0

def main():
    data = os.path.join(ATLAS, "data")
    order = json.load(open(f"{data}/index/genes.json"))

    recs = {}
    for hap in ("hap1", "hap2"):
        root = f"{data}/genes/{hap}"
        for dp, _, fs in os.walk(root):      # shards are nested since the bucketed split
            for fn in sorted(fs):
                if not fn.endswith(".json"):
                    continue
                for gid, r in json.load(open(os.path.join(dp, fn))).items():
                    recs[gid] = (hap, r)
    assert len(recs) == len(order), f"{len(recs)} genes vs {len(order)} in genes.json"

    chrs, clss, tops = [], [], []
    def idx(vocab, v):
        if v is None:
            return -1
        if v not in vocab:
            vocab.append(v)
        return vocab.index(v)

    rows = []
    for gid in order:
        hap, r = recs[gid]
        syn = r.get("syn") or {}
        ps = r.get("ps") or {}
        x = r.get("x") or {}
        ann = r.get("ann") or {}
        flags = syn.get("flags") or {}
        ks = r.get("ks") or {}
        ms = (r.get("prot") or {}).get("ms") or {}
        dup = r.get("dup") or {}
        kar = r.get("aek") or {}
        rows.append([
            0 if hap == "hap1" else 1,
            idx(chrs, r.get("chr")),
            idx(clss, syn.get("cls")),
            ps.get("rank") if ps.get("rank") is not None else -1,
            # tau as an integer percent keeps the JSON short; -1 means not computable
            int(round(x["tau"] * 100)) if x.get("tau") is not None else -1,
            idx(tops, x.get("top")),
            1 if r.get("allele") else 0,
            1 if ann.get("at") else 0,
            # WGD events from the curated gene-level letters, non-exclusive: bit 0 salicoid,
            # bit 1 gamma. A gene can carry both (and tandem/dispersed besides).
            (1 if dup.get("s") else 0) | (2 if dup.get("a") else 0),
            1 if flags.get("ar") else 0,
            # 0 is a REAL value here (OrthoFinder assigned no orthogroup), not missing data.
            # `or -1` collapsed it to null and the browse table showed those genes as "—".
            len(r.get("pres") or []),
            1 if ps.get("amb") else 0,
            sum(1 << i for i, t in enumerate(XIN_TISSUES)
                if (x.get("t") or {}).get(t) is not None
                and (x["t"][t] or 0) > XIN_MIN_TPM),
            # omega vs P. trichocarpa, as an integer per-mille so the JSON stays short.
            # -1 means "no reciprocal-best ortholog", which is a real state, not missing data:
            # a hybrid-only gene has nothing to measure against. -2 means a pair exists but
            # omega could not be estimated (Ks of 0).
            (-1 if ks.get("no") else
             (int(round(ks["w"] * 1000)) if ks.get("w") is not None else -2)),
            # datasets (of 5) in which a peptide from this gene was identified at 1% FDR
            (ms.get("n") if ms.get("n") is not None else -1),
            # ancestral karyotype (route C, exploratory) as one integer: chromosome*100 +
            # gamma copy*10 + salicoid copy, a 0 digit where no copy was assigned, -1 = not placed.
            # Copy numbers are ranks WITHIN one ancestral chromosome, so they are never split out.
            (kar["c"] * 100 + kar.get("g", 0) * 10 + kar.get("s", 0) if kar.get("c") else -1),
        ])

    out = {
        "cols": ["hap", "chr", "cls", "ps", "tau", "top", "allele", "at", "wgd",
                 "tandem", "npres", "amb", "xin", "w", "ms", "aek"],
        "vocab": {"chr": chrs, "cls": clss, "top": tops, "xin": XIN_TISSUES},
        "rows": rows,
    }
    p = f"{data}/index/facets.json"
    with open(p, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    size = os.path.getsize(p)
    print(f"facets: {len(rows)} rows x {len(out['cols'])} cols -> {size/1e6:.2f} MB raw")
    print(f"  chr vocab {len(chrs)}  class vocab {len(clss)}  tissue vocab {len(tops)}")
    print(f"  with tau: {sum(1 for r in rows if r[4] >= 0)}   in LSG pool: {sum(1 for r in rows if r[3] >= 18)}")
    print(f"  with omega: {sum(1 for r in rows if r[13] >= 0)}   "
          f"peptide-detected: {sum(1 for r in rows if r[14] > 0)}")
    print(f"  expressed (>{XIN_MIN_TPM} TPM) in at least one tissue: "
          f"{sum(1 for r in rows if r[12])}   in none: {sum(1 for r in rows if not r[12])}")
    print(f"  ancestral karyotype placed, HAP1: {sum(1 for r in rows if r[0] == 0 and r[15] >= 0)}   "
          f"HAP2: {sum(1 for r in rows if r[0] == 1 and r[15] >= 0)}")

    man_path = f"{data}/meta/manifest.json"
    man = json.load(open(man_path))
    man["facets"] = {"n_rows": len(rows), "cols": out["cols"], "bytes": size}
    # build_data.py stamps VERSION at the start of a full build, but it is also the stage that
    # wipes data/genes -- so on a machine that can only do half the two-machine build it never
    # runs. This script runs LAST in every path, so stamping here too means the manifest
    # converges on VERSION either way, and check_version.py stays honest.
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    man["data_version"] = open(os.path.join(root, "VERSION")).read().strip()
    json.dump(man, open(man_path, "w"), indent=1, sort_keys=True)
    return 0

if __name__ == "__main__":
    sys.exit(main())
