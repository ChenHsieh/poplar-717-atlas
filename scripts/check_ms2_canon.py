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


def rank(v):
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

    # ---- 1. phylostratigraphy: both panels, every gene -----------------------------------
    print("[1] ps.* against pipeline/out/lsg_pool_idesia.tsv.gz")
    pool = {r["gene_id"]: r for r in T["pipeline/out/lsg_pool_idesia.tsv.gz"]}
    check("same 63,960 genes", set(pool) == set(genes) and len(pool) == 63960,
          f"canon-only {len(set(pool) - set(genes))}, atlas-only {len(set(genes) - set(pool))}")
    bad = collections.defaultdict(list)
    for gid, r in pool.items():
        ps = (genes.get(gid, (None, {}))[1].get("ps")) or {}
        want, fz = rank(r["rank"]), rank(r["frozen_rank"])
        if ps.get("rank") != want:
            bad["rank"].append(gid)
        if bool(ps.get("lsg")) != yes(r["is_lsg"]):
            bad["lsg"].append(gid)
        frz = ps.get("frz")
        if fz != want:
            if not frz or frz.get("rank") != fz or bool(frz.get("lsg")) != yes(r["frozen_is_lsg"]):
                bad["frozen call"].append(gid)
        elif frz:
            bad["frozen call where the panels agree"].append(gid)
        if r["phylostratum"] not in ("", "nan") and ps.get("name") != r["phylostratum"]:
            bad["stratum name"].append(gid)
        if r["tax_rep"] not in ("", "nan") and ps.get("tr") is not None \
                and abs(float(r["tax_rep"]) - ps["tr"]) > 0.051:
            bad["tax_rep"].append(gid)
    for k in ("rank", "lsg", "frozen call", "frozen call where the panels agree",
              "stratum name", "tax_rep"):
        check(f"per-gene {k}", not bad[k], f"{len(bad[k])}, e.g. {bad[k][:3]}" if bad[k] else "")

    want = collections.Counter()
    for r in pool.values():
        if yes(r["is_lsg"]):
            want[(r["hap"], "corrected", rank(r["rank"]))] += 1
        if yes(r["frozen_is_lsg"]):
            want[(r["hap"], "frozen", rank(r["frozen_rank"]))] += 1
    lp = man.get("lsg_pool") or {}
    for h in ("HAP1", "HAP2"):
        c18, c19 = want[(h, "corrected", 18)], want[(h, "corrected", 19)]
        f18, f19 = want[(h, "frozen", 18)], want[(h, "frozen", 19)]
        print(f"      {h}: corrected {c18 + c19:,} ({c18} PS18 + {c19} PS19), "
              f"frozen {f18 + f19:,} ({f18} + {f19})")
        check(f"manifest lsg_pool.canonical {h}", (lp.get("canonical") or {}).get(h.lower()) == c18 + c19)
        check(f"manifest lsg_pool.withdrawn (frozen) {h}", (lp.get("withdrawn") or {}).get(h.lower()) == f18 + f19)
        check(f"manifest lsg_pool.ps18_ps19 {h}",
              ((lp.get("ps18_ps19") or {}).get(f"{h}_PS18"), (lp.get("ps18_ps19") or {}).get(f"{h}_PS19")) == (c18, c19))

    # ---- 2. QC flags ----------------------------------------------------------------------
    print("\n[2] qc.* against pipeline/out/lsg_pool_qc.tsv + lsg_pool_synteny.tsv")
    qc = {r["gene_id"]: r for r in T["pipeline/out/lsg_pool_qc.tsv"]}
    syn = {r["gene_id"]: r for r in T["pipeline/out/lsg_pool_synteny.tsv"]}
    corr = {g for g, r in pool.items() if yes(r["is_lsg"])}
    left = {g for g, r in pool.items() if yes(r["frozen_is_lsg"]) and not yes(r["is_lsg"])}
    has_qc = {g for g, (_, rec) in genes.items() if rec.get("qc")}
    check("canon: in_idesia_corrected_pool is the corrected pool",
          {g for g, r in qc.items() if yes(r["in_idesia_corrected_pool"])} == corr)
    check("a qc record on every corrected-pool gene", corr <= has_qc, f"{len(corr - has_qc)} missing")
    check("no qc record outside the corrected pool (a pool-exit gene was never QC-evaluated)",
          has_qc <= corr, f"{len(has_qc - corr)} extra, {len((has_qc - corr) & left)} of them pool exits")
    fields = {"ret": ("tblastn_retract", yes), "abs": ("hdf_reject", yes),
              "wgd": ("wgd_flagged", yes), "clean": ("qc_survivor", yes),
              "hdf": ("HDF_flag", str), "verdict": ("verdict", str)}
    sfields = {"syn_any": "contested_any", "syn_og": "og_contested", "syn_twin": "twin_contested"}
    qbad = collections.defaultdict(list)
    for g in corr & has_qc:
        q = genes[g][1]["qc"]
        for k, (col, cast) in fields.items():
            w = cast(qc[g][col])
            a = bool(q.get(k)) if cast is yes else q.get(k)
            if w != a:
                qbad[k].append(g)
        for k, col in sfields.items():
            if (syn[g][col] == "1") != bool(q.get(k)):
                qbad[k].append(g)
        if (syn[g]["sens_stable"] == "True") != (q.get("stable") is not False):
            qbad["stable (sens_stable)"].append(g)
    for k in list(fields) + list(sfields) + ["stable (sens_stable)"]:
        check(f"per-gene qc {k}", not qbad[k], f"{len(qbad[k])}, e.g. {qbad[k][:3]}" if qbad[k] else "")

    # ---- 3. peptide evidence, per dataset x haplotype x age class ---------------------------
    print("\n[3] prot.ms against aspen_detection_by_class.tsv")
    n, det = collections.Counter(), collections.Counter()
    for gid, (hap, rec) in genes.items():
        c = gene_class((rec.get("ps") or {}).get("rank"))
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
