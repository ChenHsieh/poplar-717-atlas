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

ATLAS = "/scratch/ch29576/poplar-717-atlas"

def main():
    data = os.path.join(ATLAS, "data")
    order = json.load(open(f"{data}/index/genes.json"))

    recs = {}
    for hap in ("hap1", "hap2"):
        d = f"{data}/genes/{hap}"
        for fn in sorted(os.listdir(d)):
            for gid, r in json.load(open(os.path.join(d, fn))).items():
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
            1 if syn.get("changed") else 0,
            1 if flags.get("ar") else 0,
            # 0 is a REAL value here (OrthoFinder assigned no orthogroup), not missing data.
            # `or -1` collapsed it to null and the browse table showed those genes as "—".
            len(r.get("pres") or []),
            1 if ps.get("amb") else 0,
        ])

    out = {
        "cols": ["hap", "chr", "cls", "ps", "tau", "top", "allele", "at", "changed",
                 "tandem", "npres", "amb"],
        "vocab": {"chr": chrs, "cls": clss, "top": tops},
        "rows": rows,
    }
    p = f"{data}/index/facets.json"
    with open(p, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    size = os.path.getsize(p)
    print(f"facets: {len(rows)} rows x {len(out['cols'])} cols -> {size/1e6:.2f} MB raw")
    print(f"  chr vocab {len(chrs)}  class vocab {len(clss)}  tissue vocab {len(tops)}")
    print(f"  with tau: {sum(1 for r in rows if r[4] >= 0)}   in LSG pool: {sum(1 for r in rows if r[3] >= 18)}")

    man_path = f"{data}/meta/manifest.json"
    man = json.load(open(man_path))
    man["facets"] = {"n_rows": len(rows), "cols": out["cols"], "bytes": size}
    json.dump(man, open(man_path, "w"), indent=1, sort_keys=True)
    return 0

if __name__ == "__main__":
    sys.exit(main())
