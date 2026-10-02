#!/usr/bin/env python3
"""Build sources/terminator_3end.tsv.gz -- per-gene 3' end evidence: annotated 3' UTR, polyadenylation-signal
(PAS) motifs, the empirical 3' end from stranded RNA-seq, and the next downstream gene.

Source: ms1-dup data/130_terminator_3end_20261001/terminator_3end_per_gene.tsv.gz (63,960 genes, both haplotypes;
README there has inputs with sha256, commands and Slurm ids). Pass the path as argv[1] to use another checkout.

What a card can say, and what it must not:
  * utr3 fields are the gene model's (primary transcript, longest=1). ~13% of genes have no annotated 3' UTR;
    that is an annotation state, not biology.
  * PAS counts are motif occurrences on the gene's strand from the stop codon to model end + 300 bp. AATAAA is the
    canonical hexamer; plant PAS are degenerate, so a missing AATAAA is weak evidence of anything.
  * The empirical end is "first base past the stop where summed sense depth over 1,212 stranded libraries stays
    below 5% of the gene's median CDS depth for 20 bases" (MAPQ >= 30). It is shown only for genes with median
    CDS depth >= 121 (0.1 read per library); otherwise the status is 'not_expressed'. 'runs_to_window_end' means
    no end inside stop .. min(model end + 2 kb, next gene + 500 bp).
  * end_into_next_gene with a downstream gap <= 100 bp is unreliable (ms1-dup data/126: the coverage rule
    over-calls when genes nearly touch). The card should say so rather than assert read-through.

GATE: 63,960 rows, unique gene_id, 32,137 HAP1 + 31,823 HAP2, and the expressed flag agrees with end5_status on every
gene -- or nothing is written. Not wired into a card yet (no patch stage); that is Chen's call.
"""
import csv, gzip, hashlib, io, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else \
    "/scratch/ch29576/ms1-dup/data/130_terminator_3end_20261001/terminator_3end_per_gene.tsv.gz"
OUT = os.path.join(ROOT, "sources", "terminator_3end.tsv.gz")
PROV = os.path.join(ROOT, "sources", "terminator_3end.provenance.json")
COLS = ["gene_id", "hap", "utr3_present", "utr3_len", "n_AATAAA", "n_pas_any_variant",
        "aataaa_nearest_end_rel_end", "median_cds_sense_depth", "end5_status", "end5_rel_stop",
        "end5_rel_annot_end", "end5_into_next_gene", "end1_rel_annot_end", "end10_rel_annot_end",
        "downstream_gene", "downstream_gap_bp", "downstream_orientation"]


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""): h.update(b)
    return h.hexdigest()


def main():
    rows = list(csv.DictReader(gzip.open(SRC, "rt"), delimiter="\t"))
    ids = [r["gene_id"] for r in rows]
    assert len(rows) == 63960 and len(set(ids)) == 63960, len(rows)
    nh = {h: sum(r["hap"] == h for r in rows) for h in ("HAP1", "HAP2")}
    assert nh == {"HAP1": 32137, "HAP2": 31823}, nh
    for r in rows:
        if r["end5_status"] != "found":   # never ship an end for a gene too quiet to have one
            for c in ("end5_rel_stop", "end5_rel_annot_end", "end1_rel_annot_end", "end10_rel_annot_end"):
                r[c] = ""
            if r["end5_status"] == "not_expressed": r["end5_into_next_gene"] = ""
    nexp = {h: sum(r["hap"] == h and r["end5_status"] != "not_expressed" for r in rows) for h in nh}
    exp_raw = {h: sum(r["hap"] == h and r["expressed"] == "True" for r in rows) for h in nh}
    assert nexp == exp_raw, (nexp, exp_raw)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=COLS, delimiter="\t", lineterminator="\n", extrasaction="ignore")
    w.writeheader(); w.writerows(rows)
    with open(OUT, "wb") as fh:
        with gzip.GzipFile(fileobj=fh, mode="wb", mtime=0) as gz:
            gz.write(buf.getvalue().encode())
    json.dump({
        "purpose": "Per-gene 3' end evidence: annotated 3' UTR, PAS motif counts, empirical 3' end from 1,212 stranded RNA-seq libraries, and the next downstream gene with gap and orientation.",
        "tier": "public",
        "why_public": "Derived from the published 717 v5.1 assemblies / annotation and public RNA-seq; per-gene coordinates and counts only.",
        "shipped_sha256": sha(OUT), "rows": len(rows), "join_key": "gene_id, bare locus",
        "expressed_per_hap": nexp,
        "generated_by": "scripts/make_terminator_source.py, from ms1-dup data/130_terminator_3end_20261001",
        "derived_from": {SRC: {"sha256": sha(SRC), "bytes": os.path.getsize(SRC)}},
        "caveats": ["3' UTR annotation is absent for ~13% of genes and differs by gene class",
                    "end_into_next_gene at gaps <= 100 bp is unreliable (ms1-dup data/126)",
                    "not wired into a card yet: needs a patch stage in build_all.sh (Chen's call)"],
    }, open(PROV, "w"), indent=1)
    print(f"wrote {OUT}: {len(rows)} rows; expressed {nexp}")


if __name__ == "__main__":
    main()
