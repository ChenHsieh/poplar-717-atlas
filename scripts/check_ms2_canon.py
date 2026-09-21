#!/usr/bin/env python3
"""Check the atlas against ms2-lsg's canonical tables, gene by gene. The second check that
looks outward (check_facts.py is the first, for ms1-dup).

WHY. The LSG layers the atlas publishes -- the pool, both panels' ranks, the QC flags, the
peptide evidence -- are copies of ms2-lsg tables. Every other check here compares the atlas
with itself, and all of them passed while the site served a withdrawn pool for four days
(2026-09-06 to 09-10). A per-gene comparison against the owner's tables is stronger than any
count: a count can agree while the membership differs.

PINNED, NOT VENDORED. sources/ms2_canon.pin.json names an ms2-lsg commit and each table's git
blob ID and carries no values, because this repo's root is public. The tables are read through
`git show <commit>:<path>`, so whatever branch the local ms2-lsg clone has checked out does not
matter -- that clone is routinely on another session's branch.

REFUSES RATHER THAN SKIPS. No clone, a missing commit, or a blob ID that does not match the pin
all exit 1 with the reason. "Could not run" is not "passed".

Needs a clone of ChenHsieh/ms2-lsg (private), so it runs on a maintainer's machine, not in CI.
"""
import collections
import glob
import gzip
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
PIN = os.path.join(ROOT, "sources", "ms2_canon.pin.json")

MS2_CANDIDATES = [os.environ.get("MS2_LSG_ROOT", ""),
                  os.path.expanduser("~/dev/ms2-lsg"),
                  os.path.expanduser("~/dev/ms2-scratch/ms2-lsg"),
                  f"/scratch/{os.environ.get('USER', '')}/ms2lsg_wt_proteomics",
                  f"/scratch/{os.environ.get('USER', '')}/ms2-lsg"]

fails = []


def check(name, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  -- {detail}" if detail else ""))
    if not ok:
        fails.append(name)


def refuse(msg):
    print(f"\nREFUSED: {msg}")
    sys.exit(1)


def load_tables():
    if not os.path.exists(PIN):
        refuse(f"{os.path.relpath(PIN, ROOT)} is missing")
    pin = json.load(open(PIN))
    commit = pin["ms2_lsg_commit"]
    roots = [r for r in MS2_CANDIDATES if r and os.path.isdir(os.path.join(r, ".git"))]
    if not roots:
        refuse("no ms2-lsg clone found (set MS2_LSG_ROOT). This check does not skip.")
    for root in roots:
        ok = subprocess.run(["git", "-C", root, "cat-file", "-e", f"{commit}^{{commit}}"],
                            capture_output=True).returncode == 0
        if not ok:
            continue
        out = {}
        for path, blob in pin["tables"].items():
            got = subprocess.run(["git", "-C", root, "rev-parse", f"{commit}:{path}"],
                                 capture_output=True, text=True).stdout.strip()
            if got != blob:
                refuse(f"{path} at {commit[:9]} is blob {got or 'ABSENT'}, the pin says "
                       f"{blob}. The table moved or the pin is wrong: read it, then refresh.")
            raw = subprocess.run(["git", "-C", root, "cat-file", "blob", blob],
                                 capture_output=True, check=True).stdout
            if path.endswith(".gz"):
                raw = gzip.decompress(raw)
            lines = raw.decode().splitlines()
            head = lines[0].split("\t")
            out[path] = [dict(zip(head, ln.split("\t"))) for ln in lines[1:] if ln]
        print(f"ms2-lsg tables read from {root} @ {commit[:9]}, every blob ID matches the pin")
        return out
    refuse(f"commit {commit[:9]} is not in any ms2-lsg clone found ({', '.join(roots)}). "
           "Fetch it (safe: this reads a commit, not HEAD).")


def rank_of(v):
    return None if v in ("", "nan", "NA", None) else int(float(v))


def yes(v):
    return str(v).strip() == "True"


def load_shards():
    genes = {}
    for hap in ("hap1", "hap2"):
        paths = (sorted(glob.glob(os.path.join(DATA, "genes", hap, "*", "*.json")))
                 + sorted(glob.glob(os.path.join(DATA, "genes", hap, "*.json"))))
        for p in paths:
            for gid, rec in json.load(open(p)).items():
                genes[gid] = (hap.upper(), rec)
    return genes


def gene_class(r):
    """The owning analysis's age classes (make_proteomics_v2_source.py copies them)."""
    if r is None:
        return "unassigned"
    if r <= 2:
        return "PS1_2_ancient"
    if r <= 12:
        return "PS3_12_conserved"
    if r <= 15:
        return "PS13_15_rosids"
    if r <= 17:
        return "PS16_17_salicaceae"
    return "LSG_PS18_populus" if r == 18 else "LSG_PS19_hybrid"


def main():
    T = load_tables()
    genes = load_shards()
    man = json.load(open(os.path.join(DATA, "meta", "manifest.json")))
    print(f"atlas shards: {len(genes):,} genes\n")

    # ---- 1. phylostratigraphy: the frozen call, and the rerun kept beside it -------------
    # Chen, 2026-09-21: the pool is the frozen genEra call (842/883) and does not change; the
    # rerun that added Idesia is a flag. So ps.* must be lsg_pool.tsv, and ps.rr the rerun.
    print("[1] ps.* against lsg_pool.tsv (frozen call) and lsg_pool_idesia.tsv.gz (rerun)")
    frozen = {}
    for r in T["pipeline/out/lsg_pool.tsv"]:
        frozen[r["gene_id"]] = r          # one gene sits on two label rows; identical otherwise
    pool = {r["gene_id"]: r for r in T["pipeline/out/lsg_pool_idesia.tsv.gz"]}
    check("same 63,960 genes in both tables and the atlas",
          set(pool) == set(genes) == set(frozen) and len(pool) == 63960,
          f"canon-only {len(set(pool) - set(genes))}, atlas-only {len(set(genes) - set(pool))}")
    bad = collections.defaultdict(list)
    for gid, r in pool.items():
        f = frozen[gid]
        ps = (genes.get(gid, (None, {}))[1].get("ps")) or {}
        rank, rr_rank = rank_of(f["rank"]), rank_of(r["rank"])
        if ps.get("rank") != rank or rank != rank_of(r["frozen_rank"]):
            bad["frozen rank"].append(gid)
        if bool(ps.get("lsg")) != yes(f["is_lsg"]):
            bad["pool membership (frozen)"].append(gid)
        if f["phylostratum"] not in ("", "nan") and ps.get("name") != f["phylostratum"]:
            bad["stratum name"].append(gid)
        if rank is not None and f["tax_rep"] not in ("", "nan") and \
                (ps.get("tr") is None or abs(float(f["tax_rep"]) - ps["tr"]) > 0.051):
            bad["tax_rep"].append(gid)
        rr = ps.get("rr")
        if rr_rank != rank:
            if not rr or rr.get("rank") != rr_rank or bool(rr.get("lsg")) != yes(r["is_lsg"]):
                bad["rerun call"].append(gid)
        elif rr:
            bad["rerun call where the two agree"].append(gid)
        if "frz" in ps:
            bad["leftover ps.frz"].append(gid)
    for k in ("frozen rank", "pool membership (frozen)", "stratum name", "tax_rep", "rerun call",
              "rerun call where the two agree", "leftover ps.frz"):
        check(f"per-gene {k}", not bad[k], f"{len(bad[k])}, e.g. {bad[k][:3]}" if bad[k] else "")

    want = collections.Counter()
    for gid, r in pool.items():
        h = r["hap"]
        if yes(frozen[gid]["is_lsg"]):
            want[(h, "pool", rank_of(frozen[gid]["rank"]))] += 1
            if not yes(r["is_lsg"]):
                want[(h, "rerun_out")] += 1
        if yes(r["is_lsg"]):
            want[(h, "rerun", 0)] += 1
    lp = man.get("lsg_pool") or {}
    for h in ("HAP1", "HAP2"):
        p18, p19 = want[(h, "pool", 18)], want[(h, "pool", 19)]
        print(f"      {h}: pool {p18 + p19:,} ({p18} PS18 + {p19} PS19); at rank >= 18 in the rerun "
              f"{want[(h, 'rerun', 0)]}; pool genes below 18 there {want[(h, 'rerun_out')]}")
        check(f"manifest lsg_pool.pool {h}", (lp.get("pool") or {}).get(h.lower()) == p18 + p19)
        check(f"manifest lsg_pool.pool PS18/PS19 {h}",
              ((lp.get("pool") or {}).get("ps18_ps19", {}).get(f"{h}_PS18"),
               (lp.get("pool") or {}).get("ps18_ps19", {}).get(f"{h}_PS19")) == (p18, p19))
        rr_m = (lp.get("rerun") or {})
        check(f"manifest lsg_pool.rerun counts {h}",
              ((rr_m.get("at_rank_18_or_above") or {}).get(h.lower()),
               (rr_m.get("pool_genes_below_rank_18") or {}).get(h.lower()))
              == (want[(h, "rerun", 0)], want[(h, "rerun_out")]))

    # ---- 2. QC flags: every pool gene, every flag ------------------------------------------
    print("\n[2] qc.* against pipeline/out/lsg_pool_qc.tsv + lsg_pool_synteny.tsv")
    qc = {r["gene_id"]: r for r in T["pipeline/out/lsg_pool_qc.tsv"]}
    syn = {r["gene_id"]: r for r in T["pipeline/out/lsg_pool_synteny.tsv"]}
    pool_genes = {g for g, f in frozen.items() if yes(f["is_lsg"])}
    has_qc = {g for g, (_, rec) in genes.items() if rec.get("qc")}
    check("canon: the flag table covers exactly the frozen pool", set(qc) == pool_genes,
          f"{len(set(qc) ^ pool_genes)} genes differ")
    check("a qc record on every pool gene, and on nothing else", has_qc == pool_genes,
          f"missing {len(pool_genes - has_qc)}, extra {len(has_qc - pool_genes)}")
    fields = {"rr": ("in_idesia_corrected_pool", lambda v: not yes(v)),
              "ret": ("tblastn_retract", yes), "abs": ("hdf_reject", yes),
              "wgd": ("wgd_flagged", yes), "post": ("qc_survivor", yes),
              "hdf": ("HDF_flag", str), "verdict": ("verdict", str)}
    sfields = {"syn_any": "contested_any", "syn_og": "og_contested", "syn_twin": "twin_contested"}
    qbad = collections.defaultdict(list)
    for g in pool_genes & has_qc:
        q = genes[g][1]["qc"]
        for k, (col, cast) in fields.items():
            w = cast(qc[g][col])
            a = q.get(k) if cast is str else bool(q.get(k))
            if w != a:
                qbad[k].append(g)
        for k, col in sfields.items():
            if (syn[g][col] == "1") != bool(q.get(k)):
                qbad[k].append(g)
        if (syn[g]["sens_stable"] == "True") != (q.get("stable") is not False):
            qbad["stable (sens_stable)"].append(g)
    for k in list(fields) + list(sfields) + ["stable (sens_stable)"]:
        check(f"per-gene qc {k}", not qbad[k], f"{len(qbad[k])}, e.g. {qbad[k][:3]}" if qbad[k] else "")
    post = collections.Counter(r["hap"] for r in qc.values() if yes(r["qc_survivor"]))
    check(f"post-QC set per haplotype = {dict(post)} (589 / 625)", (post["HAP1"], post["HAP2"]) == (589, 625))

    # ---- 3. peptide evidence, per dataset x haplotype x age class ---------------------------
    print("\n[3] prot.ms against aspen_detection_by_class.tsv")
    n, det = collections.Counter(), collections.Counter()
    for gid, (hap, rec) in genes.items():
        ps = rec.get("ps") or {}
        c = gene_class((ps.get("rr") or ps).get("rank"))   # the owner reports rerun strata
        ds = ((rec.get("prot") or {}).get("ms") or {}).get("ds") or []
        n[(hap, c)] += 1
        for d in ds:
            det[(d, hap, c)] += 1
        if ds:   # the owner's table also carries a union row set: detected in ANY dataset
            det[("UNION_all_datasets", hap, c)] += 1
    cells = T["analyses/proteomics_translation_evidence/results/aspen_detection_by_class.tsv"]
    cbad = [f"{r['dataset']} {r['hap']} {r['gene_class']}" for r in cells
            if (n[(r["hap"], r["gene_class"])], det[(r["dataset"], r["hap"], r["gene_class"])])
            != (int(r["n_genes"]), int(r["n_detected"]))]
    check(f"all {len(cells)} dataset x haplotype x class cells", not cbad,
          f"{len(cbad)} differ, e.g. {cbad[:3]}" if cbad else "")

    print(f"\n{len(fails)} FAIL" + (f": {fails}" if fails else ""))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
