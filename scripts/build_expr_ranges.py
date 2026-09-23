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
import gzip
import io
import json
import os
import re
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
LEVEL = 6          # 9 buys ~2% for ~4x the build time on 128k members
HAPS = ("hap1", "hap2")
BUCKET_NAME = re.compile(r"^(\d+)\.json$")


def shard_paths(root):
    for dp, dirs, fs in os.walk(root):
        dirs.sort()
        for fn in sorted(fs):
            if fn.endswith(".json"):
                yield os.path.join(dp, fn)


def bucket_names(directory):
    """Return the numeric bucket files in a stable order.

    Finder and editors commonly leave dotfiles in a directory. Ignore those, but fail on
    any other unexpected name rather than silently producing a partial range blob.
    """
    names, seen = [], set()
    for name in os.listdir(directory):
        if name.startswith("."):
            continue
        match = BUCKET_NAME.fullmatch(name)
        if not match:
            raise RuntimeError(f"{directory}: unexpected entry {name!r}; expected <number>.json")
        number = int(match.group(1))
        if number in seen:
            raise RuntimeError(f"{directory}: duplicate numeric bucket {number}")
        seen.add(number)
        names.append((number, name))
    if not names:
        raise RuntimeError(f"{directory}: no bucket files found")
    return [name for _, name in sorted(names)]


def gzip_member(payload):
    """Produce a byte-stable gzip member regardless of the wall clock."""
    out = io.BytesIO()
    # gzip.compress() defaults its mtime to the current time. GzipFile lets us pin both
    # the timestamp and the optional filename field, so unchanged input has unchanged bytes.
    with gzip.GzipFile(fileobj=out, mode="wb", compresslevel=LEVEL, mtime=0, filename="") as fh:
        fh.write(payload)
    return out.getvalue()


def build_one(tree, out_name, staged):
    """Stage one bucket tree as per-haplotype blobs and return their range index.

    Nothing at the destination is replaced here. A missing or malformed ComBat tree must
    not leave freshly written raw blobs paired with stale shard offsets.
    """
    src = os.path.join(DATA, "expr", tree)
    if not os.path.isdir(src):
        raise RuntimeError(f"required expression bucket tree is absent: {src}")
    index, totals = {}, {}
    for hap in HAPS:
        hdir = os.path.join(src, hap)
        if not os.path.isdir(hdir):
            raise RuntimeError(f"required bucket directory is absent: {hdir}")
        # Bucket files and gene IDs are sorted so an unchanged matrix has an unchanged blob.
        names = bucket_names(hdir)
        out_path = os.path.join(DATA, "expr", f"{out_name}_{hap}.gzb")
        fd, temp_path = tempfile.mkstemp(prefix=f".{out_name}_{hap}.", suffix=".tmp",
                                         dir=os.path.dirname(out_path))
        os.close(fd)
        off = 0
        hap_index = {}
        try:
            with open(temp_path, "wb") as out:
                for name in names:
                    path = os.path.join(hdir, name)
                    with open(path) as fh:
                        bucket = json.load(fh)
                    if not isinstance(bucket, dict):
                        raise RuntimeError(f"{path}: bucket must be a JSON object")
                    for gid in sorted(bucket):
                        if gid in hap_index:
                            raise RuntimeError(f"{path}: duplicate expression record for {gid}")
                        payload = json.dumps(bucket[gid], separators=(",", ":"),
                                             ensure_ascii=False, allow_nan=False).encode("utf-8")
                        member = gzip_member(payload)
                        out.write(member)
                        hap_index[gid] = [off, len(member)]
                        off += len(member)
                out.flush()
                os.fsync(out.fileno())
        except Exception:
            os.unlink(temp_path)
            raise
        staged.append((temp_path, out_path))
        index[hap] = hap_index
        totals[hap] = off
        print(f"  {out_name}_{hap}.gzb  {off/1e6:8.1f} MB")
    return index, totals


def load_shards():
    """Read each shard once and return mutable records keyed by haplotype and path."""
    shards = {hap: [] for hap in HAPS}
    for hap in HAPS:
        root = os.path.join(DATA, "genes", hap)
        if not os.path.isdir(root):
            raise RuntimeError(f"required gene shard directory is absent: {root}")
        for path in shard_paths(root):
            with open(path) as fh:
                shards[hap].append((path, json.load(fh)))
    return shards


def expected_genes(shards, pointer):
    return {
        hap: {gid for _path, shard in shards[hap] for gid, rec in shard.items()
              if (rec.get("x") or {}).get(pointer)}
        for hap in HAPS
    }


def assert_index_matches(pointer, index, shards):
    """Reject a source/tree mismatch before either blobs or shard ranges are changed."""
    expected = expected_genes(shards, pointer)
    for hap in HAPS:
        missing = expected[hap] - set(index[hap])
        extra = set(index[hap]) - expected[hap]
        if missing or extra:
            raise RuntimeError(
                f"{pointer} ranges for {hap} do not match shard pointers: "
                f"{len(missing)} missing, {len(extra)} extra"
            )


def apply_ranges(shards, raw_index, combat_index):
    """Write range metadata only after both complete blob trees have been staged."""
    n_raw = n_combat = 0
    for hap in HAPS:
        for path, shard in shards[hap]:
            changed = False
            for gid, rec in shard.items():
                x = rec.get("x")
                if not x:
                    continue
                if x.get("b"):
                    if x.get("o") != raw_index[hap][gid]:
                        x["o"] = raw_index[hap][gid]
                        changed = True
                    n_raw += 1
                elif x.pop("o", None) is not None:
                    changed = True
                if x.get("cb"):
                    if x.get("co") != combat_index[hap][gid]:
                        x["co"] = combat_index[hap][gid]
                        changed = True
                    n_combat += 1
                elif x.pop("co", None) is not None:
                    changed = True
            if changed:
                with open(path, "w") as fh:
                    json.dump(shard, fh, separators=(",", ":"), sort_keys=True)
    return n_raw, n_combat


def main():
    staged = []
    try:
        print("packing raw expression")
        raw_idx, raw_tot = build_one("buckets", "raw", staged)
        print("packing ComBat expression")
        cb_idx, cb_tot = build_one("combat_buckets", "cb", staged)

        shards = load_shards()
        assert_index_matches("b", raw_idx, shards)
        assert_index_matches("cb", cb_idx, shards)

        # All inputs have now passed their coverage checks. Replace each finished blob
        # atomically, then update the shard metadata that points at it.
        for temp_path, out_path in staged:
            os.replace(temp_path, out_path)
        staged.clear()
        n_raw, n_cb = apply_ranges(shards, raw_idx, cb_idx)
    finally:
        for temp_path, _out_path in staged:
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    print(f"\n{n_raw:,} genes got a raw range; {n_cb:,} got a ComBat range")

    man_path = os.path.join(DATA, "meta", "manifest.json")
    with open(man_path) as fh:
        man = json.load(fh)
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
    with open(man_path, "w") as fh:
        json.dump(man, fh, indent=1, sort_keys=True)


if __name__ == "__main__":
    main()
