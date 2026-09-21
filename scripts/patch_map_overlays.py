#!/usr/bin/env python3
"""TODO 40: more overlays on the genome map, recomputed on Sapelo2.

The map colours 100 kb bins by one of four density metrics. Those bins live in
data/locus/overview.json, written by build_locus.py -- which cannot run here, because it
reads the v5.1 GFF3 from the OneDrive tree. But the bins themselves are computed from the
SHARDS (build_locus only needs the GFF for coordinates and exon structure, which the shards
already carry), so they can be rebuilt here without that tree.

THE GATE IS THE POINT. Before adding anything, this reproduces the FOUR EXISTING metrics from
the shards and compares them to the shipped file, bin for bin. If the reconstruction of
build_locus.py's own arithmetic is wrong, that shows up here and nothing is written.

One mismatch IS expected and is allowed, for a stated reason: `lsg` counts genes with
ps.lsg, and the pool patcher (patch_pool_frozen.py) can change ps.lsg after overview.json was
written. It did twice: 2026-09-10 swapped in the Idesia rerun's pool (776/835), and 2026-09-21
restored the frozen genEra call (842/883) on Chen's ruling. A mismatch confined to `lsg` is that
pool change reaching the map, and gets rewritten here from the shards. A mismatch in n, td or tau
cannot be explained that way and means the reconstruction is wrong -- so those refuse.
"""
import json, os, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OV = os.path.join(DATA, "locus", "overview.json")
BIN = 100_000


def shard_paths(root):
    for dp, _, fs in os.walk(root):
        for fn in sorted(fs):
            if fn.endswith(".json"):
                yield os.path.join(dp, fn)


def main():
    ov = json.load(open(OV))
    assert ov["bin"] == BIN, f"bin size changed: {ov['bin']}"

    bins = defaultdict(lambda: defaultdict(lambda: {
        "n": 0, "td": 0, "lsg": 0, "tau": 0.0, "ntau": 0,
        "w": 0.0, "nw": 0, "ms": 0, "acr": 0, "nacr": 0}))
    for hap in ("hap1", "hap2"):
        for p in shard_paths(os.path.join(DATA, "genes", hap)):
            for gid, r in json.load(open(p)).items():
                ps, x = r.get("ps") or {}, r.get("x") or {}
                dup, ks = r.get("dup") or {}, r.get("ks") or {}
                ms = (r.get("prot") or {}).get("ms") or {}
                atac = r.get("atac") or {}
                b = bins[(hap, r["chr"])][r["start"] // BIN]
                b["n"] += 1
                if dup.get("td"):
                    b["td"] += 1
                if ps.get("lsg"):
                    b["lsg"] += 1
                if x.get("tau") is not None:
                    b["tau"] += x["tau"]; b["ntau"] += 1
                if ks.get("w") is not None:
                    b["w"] += ks["w"]; b["nw"] += 1
                if ms.get("n"):
                    b["ms"] += 1
                if atac.get("ex"):
                    b["nacr"] += 1
                    if atac.get("acr"):
                        b["acr"] += 1

    # ---- gate: reproduce the four shipped metrics --------------------------------------
    diff = defaultdict(int)
    for hap, chroms in ov["hap"].items():
        for chrom, rows in chroms.items():
            mine = bins[(hap, chrom)]
            for i, row in enumerate(rows):
                b = mine.get(i)
                got = ([b["n"], b["td"], b["lsg"],
                        round(b["tau"] / b["ntau"], 3) if b["ntau"] else None]
                       if b else [0, 0, 0, None])
                for k, name in enumerate(("n", "td", "lsg", "tau")):
                    if row[k] != got[k]:
                        diff[name] += 1
    print("gate, bins disagreeing with the shipped file:", dict(diff) or "none")

    # The real invariant is that no gene is lost or gained: per chromosome, the total gene
    # count must match EXACTLY. A per-bin difference on top of that can only be a gene sitting
    # on a bin edge, which is benign; a total mismatch means the reconstruction is wrong.
    # Diagnosed on the first run: PtXaAlbH.11G039800 starts at 7,699,999, one base below a
    # 100 kb boundary, so build_locus's OneDrive-GFF3 coordinate and the shard's differ by at
    # least 1 bp and it lands in a different bin. tau differs by 0.001 in two bins, which is
    # summation order, not arithmetic.
    tot_bad = []
    for hap, chroms in ov["hap"].items():
        for chrom, rows in chroms.items():
            want = sum(r[0] for r in rows)
            got = sum(b["n"] for i, b in bins[(hap, chrom)].items() if i < len(rows))
            if want != got:
                tot_bad.append((hap, chrom, want, got))
    if tot_bad:
        raise SystemExit(f"REFUSING: per-chromosome gene totals disagree {tot_bad[:4]} -- this "
                         "script's reconstruction of build_locus.py's arithmetic is wrong.")
    print(f"  per-chromosome gene totals match exactly for all "
          f"{sum(len(c) for c in ov['hap'].values())} chromosomes")
    if diff.get("tau", 0) > 4 or diff.get("n", 0) > 4 or diff.get("td"):
        raise SystemExit(f"REFUSING: {dict(diff)} is more per-bin drift than bin-edge "
                         "coordinates and rounding can explain.")
    if diff.get("lsg"):
        print(f"  {diff['lsg']} bins' LSG count differs from the shards (the pool in ps.lsg "
              "changed since overview.json was written); rewritten from the shards.")

    # ---- write: first four positions unchanged in meaning, three appended --------------
    for hap, chroms in ov["hap"].items():
        for chrom, rows in chroms.items():
            mine = bins[(hap, chrom)]
            for i in range(len(rows)):
                b = mine.get(i)
                if not b:
                    rows[i] = [0, 0, 0, None, None, None, None]
                    continue
                rows[i] = [
                    b["n"], b["td"], b["lsg"],
                    round(b["tau"] / b["ntau"], 3) if b["ntau"] else None,
                    round(b["w"] / b["nw"], 3) if b["nw"] else None,
                    round(b["ms"] / b["n"], 3) if b["n"] else None,
                    round(b["acr"] / b["nacr"], 3) if b["nacr"] else None,
                ]
    ov["cols"] = ["n", "tandem", "lsg", "tau", "omega", "ms_frac", "acr_frac"]
    ov["note"] = ("100 kb bins. omega is the mean Nei-Gojobori omega against P. trichocarpa "
                  "over binned genes that HAVE an ortholog; ms_frac is the fraction of all "
                  "genes in the bin with a peptide in any of five datasets; acr_frac is the "
                  "fraction of leaf-expressed ORTHOLOGS with accessible chromatin, so its "
                  "denominator is smaller than the bin and it is a property of "
                  "P. trichocarpa, not of 717.")
    with open(OV, "w") as fh:
        json.dump(ov, fh, separators=(",", ":"))
    print(f"wrote {OV}: {os.path.getsize(OV)/1e3:.0f} KB, 7 metrics per bin")


if __name__ == "__main__":
    main()
