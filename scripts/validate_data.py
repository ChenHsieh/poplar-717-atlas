#!/usr/bin/env python3
"""
Integrity checks over the COMMITTED data. Runs in CI, where the Sapelo2 source files do not
exist -- so it checks internal consistency, which is exactly what can rot when a build script
changes and the data is regenerated.

Every check here has failed, or could plausibly fail silently, in this project's history:
the ID->shard convention is load-bearing for every gene page; a dangling expression bucket
pointer would 404 only for the unlucky gene; an allele link to a nonexistent gene would be a
dead end a reader hits before a maintainer does.
"""
import json, os, re, sys
from collections import Counter

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
CHR_RE = re.compile(r"^PtXa(TreH|AlbH)\.(\d\d)G(\d+)$")
SCAF_RE = re.compile(r"^PtXa(TreH|AlbH)\.T\d+$")
BUCKET_SPAN = 25000   # mirrors build_data.py and js/core/data.js

fails = []
def check(name, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{'  — ' + detail if detail else ''}")
    if not ok:
        fails.append(name)

def shard_of(gid):
    m = CHR_RE.match(gid)
    if m:
        return ("hap1" if m.group(1) == "TreH" else "hap2"), \
               f"Chr{m.group(2)}/{int(m.group(3)) // BUCKET_SPAN}"
    m = SCAF_RE.match(gid)
    if m:
        return ("hap1" if m.group(1) == "TreH" else "hap2"), "scaffolds"
    return None

def main():
    man = json.load(open(f"{DATA}/meta/manifest.json"))
    genes, shard_files = {}, 0
    for hap in ("hap1", "hap2"):
        root = f"{DATA}/genes/{hap}"
        for dp, _, fs in os.walk(root):
            for fn in sorted(f for f in fs if f.endswith(".json")):
                shard_files += 1
                # key is the path under the haplotype dir, minus .json: "Chr05/4" or "scaffolds"
                key = os.path.relpath(os.path.join(dp, fn), root)[:-5]
                for gid, rec in json.load(open(os.path.join(dp, fn))).items():
                    genes[gid] = (hap, key, rec)

    print(f"\nvalidating {len(genes)} genes in {shard_files} shards (data v{man.get('data_version')})\n")

    check("manifest gene count matches shards", man["n_genes"] == len(genes),
          f"manifest {man['n_genes']} vs {len(genes)}")

    bad = [g for g, (h, k, _) in genes.items() if shard_of(g) != (h, k)]
    check("every gene ID resolves to the shard it is stored in", not bad,
          f"{len(bad)} mismatched, e.g. {bad[:3]}" if bad else "the client rule holds for all")

    missing_shard = [k for k in man["shards"] if not os.path.exists(f"{DATA}/genes/{k}.json")]
    check("every manifest shard exists on disk", not missing_shard, str(missing_shard[:3]))

    # Expression: the bucket pointer must resolve, and the vector must be the right length.
    n_samples = (man.get("expression") or {}).get("n_samples")
    buckets, bad_ptr, bad_len = {}, [], []
    for gid, (_, _, rec) in genes.items():
        x = rec.get("x")
        if not x:
            continue
        b = x.get("b")
        if b not in buckets:
            p = f"{DATA}/expr/buckets/{b}.json"
            buckets[b] = json.load(open(p)) if os.path.exists(p) else None
        if buckets[b] is None or gid not in buckets[b]:
            bad_ptr.append(gid)
        elif n_samples and len(buckets[b][gid]) != n_samples:
            bad_len.append(gid)
    check("every expression bucket pointer resolves", not bad_ptr,
          f"{len(bad_ptr)} dangling, e.g. {bad_ptr[:3]}" if bad_ptr else f"{len(buckets)} buckets")
    check(f"every expression vector has {n_samples} values", not bad_len,
          f"{len(bad_len)} wrong length" if bad_len else "")

    # Every gene's baseline must be keyed by the SAME tissue set as the manifest's own
    # denominator table -- if these drift, a gene page and the module overview page disagree
    # on what a tissue even is. Added 2026-09-05 after tissue_analysis vs tissue (see
    # docs/DATA_AUDIT.md): the failure mode is silent, so it needs a check, not a comment.
    want_tissues = set((man.get("expression") or {}).get("tissue_wt_control_n", {}))
    bad_tissue_keys = [gid for gid, (_, _, rec) in genes.items()
                        if rec.get("x") and set(rec["x"]["t"]) != want_tissues]
    check("every gene's tissue baseline uses the manifest's tissue set", not bad_tissue_keys,
          f"{len(bad_tissue_keys)} mismatched, e.g. {bad_tissue_keys[:3]}" if bad_tissue_keys
          else f"{len(want_tissues)} tissues: {sorted(want_tissues)}")

    # CRE / promoter layer: every gene must carry it, family counts must sum to the
    # stored total, and TATA position (when set) must lie inside the promoter window.
    cre_missing = [g for g, (_, _, r) in genes.items() if "cre" not in r]
    cre_bad_sum, cre_bad_tata = [], []
    win = (man.get("cre") or {}).get("promoter_window_bp")
    for g, (_, _, r) in genes.items():
        c = r.get("cre")
        if not c:
            continue
        if sum(c["fam"].values()) != c["tot"]:
            cre_bad_sum.append(g)
        p = c["tata"]["pos"]
        if p is not None and win is not None and not (0 <= p <= win):
            cre_bad_tata.append(g)
    check("every gene has a cre record", not cre_missing,
          f"{len(cre_missing)} missing, e.g. {cre_missing[:3]}" if cre_missing else "63960")
    check("cre family counts sum to the stored total", not cre_bad_sum, f"{len(cre_bad_sum)} bad")
    check("cre TATA position lies inside the promoter window", not cre_bad_tata,
          f"{len(cre_bad_tata)} out of range")

    # Locus layer: every gene must be in exactly one tile, and its structure must lie
    # inside its own span. A gene missing from the tiles is a blank locus card; a
    # segment outside the span draws off the end of the gene.
    ldir = f"{DATA}/locus/tile"
    if os.path.isdir(ldir):
        seen, bad_seg, bad_span = {}, [], []
        for dp, _, fs in os.walk(ldir):
            for fn in (f for f in fs if f.endswith(".json")):
                for r in json.load(open(os.path.join(dp, fn))):
                    seen.setdefault(r["g"], 0)
                    seen[r["g"]] += 1
                    span = r["e"] - r["s"]
                    for off, ln, _k in r["f"]:
                        if off < 0 or off + ln > span + 1:
                            bad_seg.append(r["g"])
                            break
                    if span <= 0:
                        bad_span.append(r["g"])
        missing = [g for g in genes if g not in seen]
        dupes = [g for g, n in seen.items() if n > 1]
        check("every gene has a locus tile entry", not missing,
              f"{len(missing)} missing, e.g. {missing[:3]}" if missing else f"{len(seen)} genes")
        check("no gene appears in two locus tiles", not dupes, f"{len(dupes)} duplicated")
        check("locus structure lies inside the gene span", not bad_seg,
              f"{len(bad_seg)} genes with a stray segment, e.g. {bad_seg[:3]}")
        check("locus gene spans are positive", not bad_span, f"{len(bad_span)} bad")

    # Allele links must point at a real gene, in the OTHER haplotype, and be reciprocal.
    dangling = [g for g, (_, _, r) in genes.items()
                if r.get("allele") and r["allele"]["id"] not in genes]
    same_hap = [g for g, (h, _, r) in genes.items()
                if r.get("allele") and r["allele"]["id"] in genes
                and genes[r["allele"]["id"]][0] == h]
    nonrecip = [g for g, (_, _, r) in genes.items()
                if r.get("allele") and r["allele"]["id"] in genes
                and (genes[r["allele"]["id"]][2].get("allele") or {}).get("id") != g]
    check("allele links point at existing genes", not dangling, f"{len(dangling)} dangling")
    check("allele links cross haplotypes", not same_hap, f"{len(same_hap)} same-haplotype")
    check("allele links are reciprocal", not nonrecip, f"{len(nonrecip)} one-way")

    # The omega sentinel must never reach the data again.
    w99 = [g for g, (_, _, r) in genes.items()
           if (r.get("allele") or {}).get("w") is not None and r["allele"]["w"] >= 99]
    check("no omega >= 99 (PAML 'cannot estimate' sentinel)", not w99, f"{len(w99)} records")
    wnok = [g for g, (_, _, r) in genes.items()
            if (a := r.get("allele")) and a.get("w") is not None
            and (a.get("ks") is None or a.get("ka") is None)]
    check("no omega reported without both Ka and Ks", not wnok, f"{len(wnok)} records")

    # Search index: postings must index into genes.json, and GO ids must be in the dictionary.
    idx = json.load(open(f"{DATA}/index/genes.json"))
    check("genes.json covers every gene", len(idx) == len(genes) and set(idx) == set(genes),
          f"{len(idx)} ids")
    terms = json.load(open(f"{DATA}/index/terms.json"))
    go_vocab = set(terms.get("go", {}))
    unknown = Counter()
    for gid, (_, _, rec) in genes.items():
        for t in (rec.get("ann") or {}).get("go", []):
            if t not in go_vocab:
                unknown[t] += 1
    check("every GO id on a gene is in the term dictionary", not unknown,
          f"{len(unknown)} unknown ids" if unknown else f"{len(go_vocab)} terms")

    # Facet index must be row-aligned with genes.json, or browse links to the wrong gene.
    fac_path = f"{DATA}/index/facets.json"
    if os.path.exists(fac_path):
        fac = json.load(open(fac_path))
        check("facet rows align with genes.json", len(fac["rows"]) == len(idx),
              f"{len(fac['rows'])} rows vs {len(idx)} genes")
        ncol = len(fac["cols"])
        ragged = sum(1 for r in fac["rows"] if len(r) != ncol)
        check("every facet row has the declared width", ragged == 0, f"{ragged} ragged")
        ci = fac["cols"].index("cls")
        vocab_n = len(fac["vocab"]["cls"])
        oob = sum(1 for r in fac["rows"] if r[ci] >= vocab_n)
        check("facet class codes are inside the vocabulary", oob == 0, f"{oob} out of range")
        # Spot-check against the shards: the facet class must equal the gene's class.
        pi = fac["cols"].index("ps")
        mism = 0
        for k in range(0, len(idx), 997):
            gid = idx[k]
            r = fac["rows"][k]
            rec = genes[gid][2]
            want = (rec.get("syn") or {}).get("cls")
            got = fac["vocab"]["cls"][r[ci]] if 0 <= r[ci] < vocab_n else None
            if want != got:
                mism += 1
            wps = (rec.get("ps") or {}).get("rank")
            if (wps if wps is not None else -1) != r[pi]:
                mism += 1
        check("facet values match the gene shards (sampled)", mism == 0, f"{mism} mismatches")

    sdir = f"{DATA}/index/search"
    oob = 0
    for fn in sorted(os.listdir(sdir)):
        for tok, ids in json.load(open(os.path.join(sdir, fn))).items():
            if ids and (ids[0] < 0 or ids[-1] >= len(idx)):
                oob += 1
    check("search postings are in range", oob == 0, f"{oob} tokens out of range")

    print()
    if fails:
        print(f"{len(fails)} CHECK(S) FAILED: {fails}")
        return 1
    print("ALL DATA CHECKS PASSED")
    return 0

if __name__ == "__main__":
    sys.exit(main())
