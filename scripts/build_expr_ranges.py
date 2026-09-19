#!/usr/bin/env python3
"""Range-addressable expression: one gzip member per gene, concatenated per haplotype.

THE PROBLEM. A gene page fetches `data/expr/buckets/<hap>/<n>.json` -- 250 genes x 652
samples, 786 KB raw -- to draw ONE gene's profile. The expression card is the slowest thing
on the site and it is slow for no reason. The two bucket trees together are 405 MB, 58% of
everything the site publishes.

THE FIX, and why it is safe on GitHub Pages. Pages sends `accept-ranges: bytes` and answers
a Range request with a real 206; a ranged response is served identity-encoded even when the
client offers gzip, so byte offsets are stable. (Verified against the live host before this
was written, not assumed.) So: gzip each gene's vector on its own, concatenate the members
into one file per haplotype, and store each gene's [offset, length] on its own shard record.
The client asks for exactly its own bytes.

MEASURED on data/expr/buckets/hap1/0.json: mean member 1,096 B, so the whole 63,960-gene
matrix is ~70 MB against 208 MB today, and a gene costs 1,096 B instead of 786 KB -- 717x.

VALUES ARE UNCHANGED. This is a container change, not a quantisation. The JSON inside each
member is byte-identical to the array that was in the bucket, so `docs/EXPRESSION_DESIGN.md`
decision 1 ("what a visitor sees is what they download") still holds literally. A lossy
uint16/float16 encoding was measured too and is both larger (83.4 MB) and approximate, so
there was no trade to make.

NO NEW INDEX FILE. The shard record already carries `x.b` (the bucket pointer). It becomes
`x.o = [offset, length]` for raw and `x.co` for ComBat, and the shard is already in hand when
the card renders -- so the range costs zero extra fetches.

WHAT WAS TESTED AND REJECTED: storing ComBat as a per-study offset table instead of a second
matrix. ComBat-seq's correction is NOT additive per study in log space here -- within-study
spread of log2(combat+1) - log2(raw+1) has median 0.43 and p90 1.15 across gene x study cells.
A 3.6 MB offset table would have been silently wrong. Both matrices are kept.
"""
import gzip, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
LEVEL = 6          # 9 buys ~2% for ~4x the build time on 128k members


def shard_paths(root):
    for dp, _, fs in os.walk(root):
        for fn in sorted(fs):
            if fn.endswith(".json"):
                yield os.path.join(dp, fn)


def build_one(tree, out_name, ptr_key, new_key):
    """Pack one bucket tree into per-haplotype blobs; return {gene: [off, len]}."""
    src = os.path.join(DATA, "expr", tree)
    if not os.path.isdir(src):
        print(f"  {tree}: not present, skipping")
        return {}
    index, totals = {}, {}
    for hap in ("hap1", "hap2"):
        hdir = os.path.join(src, hap)
        if not os.path.isdir(hdir):
            continue
        # Bucket files are named by integer; walk them in numeric order so the blob is
        # deterministic across rebuilds (a set-iteration order here would reshuffle the
        # whole file every build, exactly the defect TODO 24 found in the search index).
        names = sorted(os.listdir(hdir), key=lambda n: int(n.split(".")[0]))
        out_path = os.path.join(DATA, "expr", f"{out_name}_{hap}.gzb")
        off = 0
        with open(out_path, "wb") as out:
            for n in names:
                bucket = json.load(open(os.path.join(hdir, n)))
                for gid in sorted(bucket):
                    payload = json.dumps(bucket[gid], separators=(",", ":")).encode()
                    member = gzip.compress(payload, LEVEL)
                    out.write(member)
                    index[gid] = [off, len(member)]
                    off += len(member)
        totals[hap] = off
        print(f"  {out_name}_{hap}.gzb  {off/1e6:8.1f} MB")
    return index, totals


def main():
    print("packing raw expression")
    raw_idx, raw_tot = build_one("buckets", "raw", "b", "o")
    print("packing ComBat expression")
    cb_idx, cb_tot = build_one("combat_buckets", "cb", "cb", "co")

    n_raw, n_cb, n_miss = 0, 0, 0
    for hap in ("hap1", "hap2"):
        for p in shard_paths(os.path.join(DATA, "genes", hap)):
            shard = json.load(open(p))
            changed = False
            for gid, rec in shard.items():
                x = rec.get("x")
                if not x:
                    continue
                if gid in raw_idx:
                    x["o"] = raw_idx[gid]
                    n_raw += 1
                    changed = True
                elif x.get("b"):
                    n_miss += 1
                if gid in cb_idx:
                    x["co"] = cb_idx[gid]
                    n_cb += 1
                    changed = True
            if changed:
                with open(p, "w") as fh:
                    json.dump(shard, fh, separators=(",", ":"), sort_keys=True)

    print(f"\n{n_raw:,} genes got a raw range, {n_cb:,} got a ComBat range, "
          f"{n_miss:,} had a bucket pointer but no range")
    assert n_miss == 0, "every gene with a bucket pointer must get a range"

    man_path = os.path.join(DATA, "meta", "manifest.json")
    man = json.load(open(man_path))
    man["expr_ranges"] = {
        "raw_bytes": raw_tot,
        "combat_bytes": cb_tot,
        "genes_raw": n_raw,
        "genes_combat": n_cb,
        "encoding": "one gzip member per gene, concatenated; the member inflates to the "
                    "same JSON array the bucket held, byte for byte. Values are UNCHANGED - "
                    "this is a container change, not a quantisation.",
        "why": "A gene page fetched 786 KB of its 250 neighbours' expression to draw one "
               "card. A range request fetches ~1.1 KB.",
        "rejected": "Storing ComBat as a per-study offset table: measured NOT additive in "
                    "log space (within-study spread of the log2 delta, median 0.43, p90 "
                    "1.15), so both matrices are kept.",
    }
    json.dump(man, open(man_path, "w"), indent=1, sort_keys=True)


if __name__ == "__main__":
    main()
