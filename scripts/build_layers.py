#!/usr/bin/env python3
"""
Ingests the genome-wide computed layers from the MS1 and MS2 analysis repos.

Sources (all keyed on gene_id, all genome-wide unless noted):

  ms1-dup
    dupclass_membership_v8.csv        duplication class: S salicoid WGD / A ancient WGD /
                                      T tandem / D dispersed, concatenated; "C" = none of them
    gene_te_distances_*.csv           distance to the nearest TE, per superfamily
    gene_intron_counts.csv            exon / intron counts
    hemi_pav_crosstab.csv             HAP1:HAP2 relationship and strict PAV
  ms2-lsg
    predicted_disorder_genomewide.tsv mean disorder, disordered fraction
    secondary_structure_summary.tsv   ESMFold helix/strand/coil + pLDDT -- 40,685 of 63,960
                                      genes only (64%), so absence is coverage, not biology
    tier1_pxd*_by_gene.tsv            mass-spec peptide evidence, THREE datasets kept separate
                                      (detection rates differ 4x: 3,989 / 18,739 / 21,449)
    neighbor_coexpr_652.tsv           co-expression with genomic neighbours
    organelle_homology_by_gene.tsv    plastid/mito homology -- a real false-positive source
                                      for "novel gene" claims

`pipeline/out/*.tsv` are READ-ONLY by standing instruction: read, never write.

Two known data quirks, both asserted rather than assumed:
  * PtXaAlbH.14G133000 appears twice in the pipeline/out tables because it carries two
    canonical labels (LSG1.14g and XO14gHAP2), so those files have one row per (gene, label).
    The duplicate rows are identical; this script verifies that before collapsing them and
    fails if they ever diverge.
  * ESMFold gene ids carry a ".1.p" transcript suffix the other tables do not.

PATCHER -- runs after build_data.py, before build_facets.py.
"""
import csv, json, os, re, sys
from collections import defaultdict

MS1 = "/scratch/ch29576/ms1-dup"
MS2 = "/scratch/ch29576/ms2-lsg"
ATLAS = "/scratch/ch29576/poplar-717-atlas"
STRIP = re.compile(r"\.\d+\.p$")
PXD = ("023826", "025636", "064017")

def shard_paths(root):
    out = []
    for dp, _, fs in os.walk(root):
        out += [os.path.join(dp, f) for f in fs if f.endswith(".json")]
    return out

def num(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None

def read_rows(path, delim, key="gene_id", strip_suffix=False, value_cols=None):
    """One row per gene.

    Several sources carry one row per (gene, GROUP) rather than per gene: the proteomics
    tables repeat 5,024 genes that are both a `conserved` gene and an LSG's `matched_control`,
    and the pipeline/out tables repeat PtXaAlbH.14G133000 under two canonical labels. Those
    are selection metadata, not measurements.

    So duplicates are collapsed only when the columns this script actually INGESTS agree.
    A conflict in a measured value is still fatal -- collapsing there would silently pick one.
    """
    out, dupes = {}, 0
    same = (lambda a, b: a == b) if value_cols is None else \
           (lambda a, b: all(a.get(c) == b.get(c) for c in value_cols))
    with open(path) as fh:
        for r in csv.DictReader(fh, delimiter=delim):
            g = r.get(key) or ""
            if strip_suffix:
                g = STRIP.sub("", g)
            if not g:
                continue
            if g in out:
                if not same(out[g], r):
                    raise SystemExit(
                        f"FAIL {os.path.basename(path)}: duplicate rows for {g} disagree on a "
                        f"value this script ingests ({value_cols}).\n  {out[g]}\n  {r}\n"
                        "Collapsing would silently pick one. Resolve upstream.")
                dupes += 1
                continue
            out[g] = r
    if dupes:
        print(f"    ({dupes} duplicate row(s) collapsed in {os.path.basename(path)}; "
              f"they agree on {value_cols or 'every column'})")
    return out

def main():
    data = os.path.join(ATLAS, "data")
    L = defaultdict(dict)          # gene_id -> {field: value}
    cov = {}

    # ---- duplication class -------------------------------------------------------------
    d = read_rows(f"{MS1}/ms1-figures/data/dupclass_membership_v8.csv", ",")
    tf = lambda v: 1 if str(v).strip().lower() == "true" else 0
    for g, r in d.items():
        L[g]["dup"] = {"t": r["dup_type_v8"], "s": tf(r["has_S_v8"]), "a": tf(r["has_A_v8"]),
                       "td": tf(r["has_T_v8"]), "d": tf(r["has_D_v6"])}
    cov["duplication class"] = len(d)

    # ---- TE proximity ------------------------------------------------------------------
    d = read_rows(f"{MS1}/data/32_te_proximity_threshold/gene_te_distances_all_superfamilies.csv", ",")
    for g, r in d.items():
        te = {}
        for col, name in (("dist_all_TE", "all"), ("dist_DNA", "DNA"), ("dist_LINE", "LINE"),
                          ("dist_LTR", "LTR"), ("dist_RC", "RC"), ("dist_SINE", "SINE")):
            v = num(r.get(col))
            if v is not None:
                te[name] = int(v)
        if te:
            L[g]["te"] = te
    cov["TE distances"] = len(d)

    # ---- gene structure ----------------------------------------------------------------
    d = read_rows(f"{MS1}/data/goi_case_studies/cross_hap_cases/case10_retroduplication/gene_intron_counts.csv", ",")
    for g, r in d.items():
        ex, iv = num(r.get("n_exons")), num(r.get("n_introns"))
        if ex is not None:
            L[g]["gs"] = {"ex": int(ex), "in": int(iv) if iv is not None else None}
    cov["exon/intron counts"] = len(d)

    # ---- PAV / hemizygosity -------------------------------------------------------------
    d = read_rows(f"{MS1}/data/PAV_pangene_sweep/poplar_lo_list/hemi_pav_crosstab.csv", ",")
    for g, r in d.items():
        L[g]["pav"] = {"rel": r.get("relationship") or None,
                       "strict": tf(r.get("strict_pav_all"))}
    cov["PAV / hemizygosity"] = len(d)

    # ---- disorder ------------------------------------------------------------------------
    d = read_rows(f"{MS2}/analyses/strict_control_audit/results/predicted_disorder_genomewide.tsv", "\t")
    for g, r in d.items():
        md, fd = num(r.get("mean_disorder")), num(r.get("frac_disordered"))
        if md is not None:
            L[g].setdefault("prot", {}).update({"dis": round(md, 3), "disf": round(fd, 3)})
    cov["predicted disorder"] = len(d)

    # ---- ESMFold secondary structure (64% coverage) --------------------------------------
    d = read_rows(f"{MS2}/analyses/esmfold_secondary_structure/results/secondary_structure_summary.tsv",
                  "\t", strip_suffix=True)
    for g, r in d.items():
        ss = {k: num(r.get(c)) for k, c in
              (("h", "helix_frac"), ("e", "strand_frac"), ("c", "coil_frac"),
               ("plddt", "mean_plddt"), ("low", "frac_plddt_lt70"))}
        ss["n"] = int(num(r.get("n_residues")) or 0)
        L[g].setdefault("prot", {})["ss"] = {k: (round(v, 3) if isinstance(v, float) else v)
                                             for k, v in ss.items() if v is not None}
    cov["ESMFold structure"] = len(d)

    # ---- proteomics: three datasets, never pooled ----------------------------------------
    for p in PXD:
        d = read_rows(f"{MS2}/analyses/proteomics_translation_evidence/results/tier1_pxd{p}_by_gene.tsv",
                      "\t", value_cols=("n_tryptic_peptides", "any_peptide_detected"))
        for g, r in d.items():
            n = num(r.get("n_tryptic_peptides"))
            L[g].setdefault("prot", {}).setdefault("ms", {})[p] = [
                int(n) if n is not None else None,
                1 if str(r.get("any_peptide_detected")).strip().lower() == "true" else 0]
        cov[f"proteomics PXD{p}"] = len(d)

    # ---- neighbour co-expression ----------------------------------------------------------
    d = read_rows(f"{MS2}/pipeline/out/neighbor_coexpr_652.tsv", "\t")
    for g, r in d.items():
        k5, k10 = num(r.get("neighbor_coexpr_k5")), num(r.get("neighbor_coexpr_k10"))
        if k5 is not None:
            L[g]["nb"] = {"k5": round(k5, 3), "k10": round(k10, 3) if k10 is not None else None}
    cov["neighbour co-expression"] = len(d)

    # ---- organelle homology (flag only when a hit exists) ----------------------------------
    d = read_rows(f"{MS2}/pipeline/out/organelle_homology_by_gene.tsv", "\t",
                  value_cols=("organelle", "pident", "evalue", "bitscore"))
    norg = 0
    for g, r in d.items():
        if (r.get("organelle") or "").strip():
            L[g]["org"] = {"o": r["organelle"], "pid": num(r.get("pident")),
                           "e": r.get("evalue") or None}
            norg += 1
    cov["organelle homology"] = f"{len(d)} scanned, {norg} with a hit"

    print("source coverage:")
    for k, v in cov.items():
        print(f"  {k:<26} {v}")

    # ---- patch the shards ------------------------------------------------------------------
    genes_dir = os.path.join(data, "genes")
    applied = defaultdict(int)
    seen = set()
    for hap in ("hap1", "hap2"):
        for p in sorted(shard_paths(os.path.join(genes_dir, hap))):
            with open(p) as fh:
                shard = json.load(fh)
            hit = False
            for gid, rec in shard.items():
                seen.add(gid)
                for field, val in L.get(gid, {}).items():
                    rec[field] = val
                    applied[field] += 1
                    hit = True
            if hit:
                with open(p, "w") as fh:
                    json.dump(shard, fh, separators=(",", ":"), sort_keys=True)
    print("\nfields written:", dict(sorted(applied.items())))
    orphan = set(L) - seen
    if orphan:
        print(f"NOTE: {len(orphan)} source gene ids are not in the atlas "
              f"(e.g. {sorted(orphan)[:3]}) — ignored, not invented.")

    man_path = os.path.join(data, "meta", "manifest.json")
    man = json.load(open(man_path))
    dist = {}
    for g, f in L.items():
        if "dup" in f:
            dist[f["dup"]["t"]] = dist.get(f["dup"]["t"], 0) + 1
    man["layers"] = {
        "dup_class_dist": dict(sorted(dist.items(), key=lambda kv: -kv[1])),
        "coverage": {k: (v if isinstance(v, str) else v) for k, v in cov.items()},
        "applied": dict(sorted(applied.items())),
        "esmfold_note": "ESMFold structure covers 40,685 of 63,960 genes (64%). Absence is "
                        "coverage, not a structural claim.",
        "proteomics_note": "Three independent PXD datasets, reported separately. Detection "
                           "rates differ ~4x (3,989 / 18,739 / 21,449 genes), so a gene absent "
                           "from one is not undetected.",
        "dup_code": {"S": "salicoid WGD", "A": "ancient WGD", "T": "tandem",
                     "D": "dispersed", "C": "none detected"},
    }
    json.dump(man, open(man_path, "w"), indent=1, sort_keys=True)
    return 0

if __name__ == "__main__":
    sys.exit(main())
