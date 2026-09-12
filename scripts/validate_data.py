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
import gzip, json, os, re, struct, sys
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

STRUCT_SPAN = 2500   # mirrors patch_structure.py and js/core/data.js:structKey
SCAF_NUM_RE = re.compile(r"^PtXa(TreH|AlbH)\.T(\d+)$")

def struct_key(gid):
    m = CHR_RE.match(gid)
    if m:
        return f"{'hap1' if m.group(1) == 'TreH' else 'hap2'}/Chr{m.group(2)}/{int(m.group(3)) // STRUCT_SPAN}"
    m = SCAF_NUM_RE.match(gid)
    if m:
        return f"{'hap1' if m.group(1) == 'TreH' else 'hap2'}/scaffolds/{int(m.group(2)) // STRUCT_SPAN}"
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

    # ComBat-seq is opt-in per gene (TODO 18): x.cb present only where the source matrix had
    # enough count signal to batch-correct. Every gene claiming one must actually resolve.
    want_cb = (man.get("expression") or {}).get("combat_eligible_genes")
    cb_genes = [(gid, rec) for gid, (_, _, rec) in genes.items() if rec.get("x", {}).get("cb")]
    cb_bad_ptr = []
    cb_buckets = {}
    for gid, rec in cb_genes:
        b = rec["x"]["cb"]
        if b not in cb_buckets:
            p2 = f"{DATA}/expr/combat_buckets/{b}.json"
            cb_buckets[b] = json.load(open(p2)) if os.path.exists(p2) else None
        if cb_buckets[b] is None or gid not in cb_buckets[b]:
            cb_bad_ptr.append(gid)
    check("manifest combat_eligible_genes matches the shard count", want_cb == len(cb_genes),
          f"manifest {want_cb} vs {len(cb_genes)} genes carrying x.cb")
    check("every x.cb pointer resolves to a real ComBat bucket entry", not cb_bad_ptr,
          f"{len(cb_bad_ptr)} dangling, e.g. {cb_bad_ptr[:3]}" if cb_bad_ptr else f"{len(cb_buckets)} buckets")
    cb_no_raw = [gid for gid, rec in cb_genes if not rec.get("x", {}).get("b")]
    check("no ComBat-eligible gene lacks a raw baseline", not cb_no_raw, f"{len(cb_no_raw)} records")

    # TODO 21: duplication moved to v9, and a PAV layer was added. Both checked against the
    # canonical published totals, not just against each other.
    td_by_hap = Counter()
    for gid, (_, _, rec) in genes.items():
        d = rec.get("dup")
        if d and d.get("td"):
            td_by_hap["hap1" if gid.startswith("PtXaTreH") else "hap2"] += 1
    check("tandem (TD) gene counts match the canonical union set", td_by_hap == Counter(hap1=6663, hap2=6385),
          f"{dict(td_by_hap)}")

    pav_confirmed = Counter()
    bad_target = []
    for gid, (_, _, rec) in genes.items():
        p = rec.get("pav")
        if not p:
            continue
        if p["confirmed"]:
            pav_confirmed["hap1" if gid.startswith("PtXaTreH") else "hap2"] += 1
        elif p.get("target") and p["target"] not in genes:
            bad_target.append(gid)
    check("PAV confirmed counts match the canonical tier1_floor call", pav_confirmed == Counter(hap1=805, hap2=859),
          f"{dict(pav_confirmed)}")
    check("every PAV 'not confirmed' target names a real gene", not bad_target,
          f"{len(bad_target)} dangling, e.g. {bad_target[:3]}" if bad_target else "")

    # TODO 23: LSG evidence-quality flags. The forbidden fields encode an undecided pool
    # correction (see sources/lsg_qc_flags.provenance.json) and must never reach a shard,
    # under ANY key name -- checked by serialising each qc record and searching the text,
    # not by checking a fixed key list that a future edit could rename around.
    FORBIDDEN = ("qc_survivor", "in_idesia_corrected_pool")
    qc_bad = [gid for gid, (_, _, rec) in genes.items()
              if rec.get("qc") and any(f in json.dumps(rec["qc"]) for f in FORBIDDEN)]
    check("no forbidden LSG QC field reaches any shard", not qc_bad,
          f"{len(qc_bad)} records, e.g. {qc_bad[:3]}" if qc_bad else "")

    # Genome map (section 2.4): the overview's 100kb bins and the per-chromosome index
    # are two INDEPENDENTLY built views of the same gene set. They must agree on gene
    # count per chromosome, and every gene the index names must be a real atlas gene.
    overview_path = f"{DATA}/locus/overview.json"
    if os.path.exists(overview_path):
        ov = json.load(open(overview_path))
        bad_count, bad_gene, missing_index = [], [], []
        for hap in ("hap1", "hap2"):
            for chr_, bins in ov["hap"].get(hap, {}).items():
                ov_n = sum(b[0] for b in bins)
                ip = f"{DATA}/locus/index/{hap}/{chr_}.json"
                if not os.path.exists(ip):
                    missing_index.append(f"{hap}/{chr_}")
                    continue
                idx = json.load(open(ip))
                if len(idx) != ov_n:
                    bad_count.append(f"{hap}/{chr_}: overview {ov_n} vs index {len(idx)}")
        check("overview.json exists and covers both haplotypes", set(ov.get("hap", {})) == {"hap1", "hap2"},
              str(sorted(ov.get("hap", {}))))
        check("every overview chromosome has a matching index file", not missing_index,
              f"{len(missing_index)} missing, e.g. {missing_index[:3]}" if missing_index else "")
        check("overview and index agree on gene count per chromosome", not bad_count,
              f"{len(bad_count)} mismatched, e.g. {bad_count[:3]}" if bad_count else "")

        idx_bad_gene = []
        for hap in ("hap1", "hap2"):
            for chr_ in ov["hap"].get(hap, {}):
                ip = f"{DATA}/locus/index/{hap}/{chr_}.json"
                if not os.path.exists(ip):
                    continue
                for g in json.load(open(ip)):
                    if g["g"] not in genes:
                        idx_bad_gene.append(g["g"])
        check("every genome-map index gene is a real atlas gene", not idx_bad_gene,
              f"{len(idx_bad_gene)} unknown, e.g. {idx_bad_gene[:3]}" if idx_bad_gene else "")

    # Expression scrubber (section 2.3): every contrast's sample indices must be in
    # range for the 652-sample vectors they will index into, and both arms non-empty.
    contrasts_path = f"{DATA}/expr/contrasts.json"
    if os.path.exists(contrasts_path):
        contrasts = json.load(open(contrasts_path))
        n_samples = (man.get("expression") or {}).get("n_samples")
        bad_range, bad_empty = [], []
        for c in contrasts:
            idxs = c["ctrl"] + c["pert"]
            if any(i < 0 or (n_samples and i >= n_samples) for i in idxs):
                bad_range.append(c["id"])
            if not c["ctrl"] or not c["pert"]:
                bad_empty.append(c["id"])
        check("contrasts.json covers the full 191-contrast panel", len(contrasts) == 191,
              str(len(contrasts)))
        check("every contrast sample index is in range", not bad_range,
              f"{len(bad_range)} bad, e.g. {bad_range[:3]}" if bad_range else "")
        check("every contrast has both a control and a perturbation arm", not bad_empty,
              f"{len(bad_empty)} bad, e.g. {bad_empty[:3]}" if bad_empty else "")

    qc_outside_pool = [gid for gid, (_, _, rec) in genes.items()
                       if rec.get("qc") and (rec.get("ps") or {}).get("rank", -1) < 18]
    check("every qc record sits on an LSG-pool gene (PS >= 18)", not qc_outside_pool,
          f"{len(qc_outside_pool)} records, e.g. {qc_outside_pool[:3]}" if qc_outside_pool else "")

    n_qc = sum(1 for _, (_, _, rec) in genes.items() if rec.get("qc"))
    want_qc = (man.get("lsg_qc") or {}).get("pool_genes")
    check("manifest lsg_qc.pool_genes matches the shard count", want_qc == n_qc,
          f"manifest {want_qc} vs {n_qc} genes carrying qc")

    # ---- the Idesia-corrected pool (TODO 26) ----------------------------------------------
    # Three checks, and the second is the one that matters. The atlas shipped a withdrawn pool
    # for four days because nothing compared the manifest's AGGREGATES against the per-gene
    # records they summarise -- the same shape as TODO 24's stale facet index. Aggregates get
    # recomputed here from the shards, never trusted.
    pool_by_hap = Counter()
    for gid, (hap, _, rec) in genes.items():
        if ((rec.get("ps") or {}).get("rank") or -1) >= 18:
            pool_by_hap[hap] += 1
    want_pool = ((man.get("lsg_pool") or {}).get("canonical") or {}).get("total")
    check("manifest lsg_pool total matches the shard pool",
          want_pool == sum(pool_by_hap.values()),
          f"manifest {want_pool} vs {sum(pool_by_hap.values())} genes at PS >= 18 "
          f"({dict(pool_by_hap)})")

    ladder = (man.get("phylostrat") or {}).get("ladder") or {}
    lad_bad = []
    for hap in ("hap1", "hap2"):
        shard_ranks = Counter((rec.get("ps") or {}).get("rank")
                              for gid, (h, _, rec) in genes.items() if h == hap)
        for row in ladder.get(hap, []):
            if shard_ranks.get(row["rank"], 0) != row["n"]:
                lad_bad.append((hap, row["rank"], row["n"], shard_ranks.get(row["rank"], 0)))
    check("phylostrat ladder counts match the shard ranks, every stratum", not lad_bad,
          f"{len(lad_bad)} strata disagree (hap, rank, manifest, shards): {lad_bad[:4]}"
          if lad_bad else f"{sum(len(v) for v in ladder.values())} strata")

    # ---- RNA-seq gene-model evidence -------------------------------------------------------
    # The intron count comes from a spliced-read pipeline; gs.in comes from the v5.1 GFF3
    # longest isoform. They are independent derivations of the same quantity and agree on all
    # 50,631 genes. If they ever diverge, the two layers are describing different gene models
    # and the card would be attaching read evidence to the wrong structure.
    gm_bad = [(gid, (rec.get("gs") or {}).get("in"), rec["gm"]["in"]["n"])
              for gid, (_h, _p, rec) in genes.items()
              if rec.get("gm", {}).get("in") is not None
              and (rec.get("gs") or {}).get("in") is not None
              and (rec.get("gs") or {}).get("in") != rec["gm"]["in"]["n"]]
    check("gene-model intron count matches the annotation's own gs.in", not gm_bad,
          f"{len(gm_bad)} disagree, e.g. {gm_bad[:3]}" if gm_bad
          else f"{sum(1 for _g, (_h, _p, r) in genes.items() if r.get('gm', {}).get('in'))} genes")

    # introns seen can never exceed introns annotated
    gm_over = [gid for gid, (_h, _p, rec) in genes.items()
               if rec.get("gm", {}).get("in")
               and rec["gm"]["in"]["seen"] > rec["gm"]["in"]["n"]]
    check("introns observed never exceeds introns annotated", not gm_over,
          f"{len(gm_over)} genes, e.g. {gm_over[:3]}" if gm_over else "")

    # a split flag must name a real gene, and evaluable pairs cannot exceed total pairs
    gm_flag = [gid for gid, (_h, _p, rec) in genes.items() if rec.get("gm", {}).get("sp")]
    gm_dangling = [gid for gid in gm_flag if genes[gid][2]["gm"]["sp"]["p"] not in genes]
    check("every split-model partner is a real gene", not gm_dangling,
          f"{len(gm_dangling)} dangling, e.g. {gm_dangling[:3]}" if gm_dangling else "")
    want_flag = ((man.get("gene_model") or {}).get("split_model") or {}).get("flagged_genes")
    check("manifest gene_model.split_model.flagged_genes matches the shards",
          want_flag == len(gm_flag), f"manifest {want_flag} vs {len(gm_flag)} genes")
    gm_nev = [gid for gid, (_h, _p, rec) in genes.items()
              if rec.get("gm") and rec["gm"].get("nev", 0) > rec["gm"].get("np", 0)]
    check("evaluable adjacent pairs never exceed total adjacent pairs", not gm_nev,
          f"{len(gm_nev)} genes, e.g. {gm_nev[:3]}" if gm_nev else "")

    # summary.ps_rank is a third copy of the strata distribution and the HOME PAGE reads it.
    # It was stale for three versions while the ladder beside it was correct, so it gets the
    # same treatment: recomputed from the shards, never trusted.
    shard_ps = Counter()
    for gid, (_h, _p, rec) in genes.items():
        r = (rec.get("ps") or {}).get("rank")
        shard_ps[str(r) if r is not None else "None"] += 1
    man_ps = (man.get("summary") or {}).get("ps_rank") or {}
    ps_bad = {k: (man_ps.get(k), shard_ps.get(k)) for k in set(man_ps) | set(shard_ps)
              if man_ps.get(k) != shard_ps.get(k)}
    check("manifest summary.ps_rank matches the shard ranks", not ps_bad,
          f"{len(ps_bad)} strata disagree, e.g. {dict(list(ps_bad.items())[:4])}" if ps_bad
          else f"{len(shard_ps)} strata")

    # The embargoed candidate names must not reach a shard under ANY key -- searched as text,
    # not by key name, so a rename cannot dodge it. Same construction as the qc check above.
    EMBARGOED = ("canonical_label", "LSG1.14g", "LSG2.10g", "LSG3.6g", "LSG4.5g",
                 "LSG5.3g", "LSG6.2g", "LSG7.4g", "XO_quartet", "XO2g", "XO14g")
    label_bad = [gid for gid, (_, _, rec) in genes.items()
                 if any(f in json.dumps(rec) for f in EMBARGOED)]
    check("no embargoed LSG candidate label reaches any shard", not label_bad,
          f"{len(label_bad)} records, e.g. {label_bad[:3]}" if label_bad else "")

    # ps.frz is the withdrawn call, and exists only where the two panels disagree.
    frz = [gid for gid, (_, _, rec) in genes.items() if (rec.get("ps") or {}).get("frz")]
    frz_same = [gid for gid in frz
                if (genes[gid][2]["ps"]["frz"] or {}).get("rank") == genes[gid][2]["ps"]["rank"]]
    check("ps.frz appears only where the corrected and withdrawn ranks differ", not frz_same,
          f"{len(frz_same)} genes carry a frz identical to their rank" if frz_same
          else f"{len(frz)} genes changed rank")

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
        # EVERY row, EVERY column -- not a sample, and not just the two columns this check
        # used to cover. It sampled `cls` and `ps` only, and both happen to be untouched by
        # expression work: so when the leaf_young/leaf_old tissue correction was patched into
        # the shards without re-running build_facets.py, the facet index kept pre-fix `tau`
        # and `top` for 62,192 genes and this check passed anyway. Browse and the gene page
        # disagreed about the same gene. The facet table is a pure function of the shards --
        # there is no reason to sample it.
        def facet_row(hap, r, vocab):
            syn, ps = r.get("syn") or {}, r.get("ps") or {}
            x, ann = r.get("x") or {}, r.get("ann") or {}
            flags = syn.get("flags") or {}
            ks = r.get("ks") or {}
            ms = (r.get("prot") or {}).get("ms") or {}
            def vi(name, v):
                return vocab[name].index(v) if v in vocab[name] else -1
            return [
                0 if hap == "hap1" else 1,
                vi("chr", r.get("chr")),
                vi("cls", syn.get("cls")),
                ps.get("rank") if ps.get("rank") is not None else -1,
                int(round(x["tau"] * 100)) if x.get("tau") is not None else -1,
                vi("top", x.get("top")),
                1 if r.get("allele") else 0,
                1 if ann.get("at") else 0,
                1 if syn.get("changed") else 0,
                1 if flags.get("ar") else 0,
                len(r.get("pres") or []),
                1 if ps.get("amb") else 0,
                sum(1 << i for i, t in enumerate(
                    ['leaf_young', 'leaf', 'leaf_old', 'xylem', 'bark', 'root', 'stem',
                     'bud', 'catkin', 'callus'])
                    if (x.get("t") or {}).get(t) is not None and (x["t"][t] or 0) > 1.0),
                (-1 if ks.get("no") else
                 (int(round(ks["w"] * 1000)) if ks.get("w") is not None else -2)),
                (ms.get("n") if ms.get("n") is not None else -1),
            ]

        # zip() truncates to the shorter list, so a column added to build_facets.py without
        # being added here would be compared against nothing and pass silently. Assert the
        # widths agree first -- the check below is only meaningful if they do.
        check("the validator covers every facet column",
              len(facet_row("hap1", genes[idx[0]][2], fac["vocab"])) == len(fac["cols"]),
              f"validator reproduces {len(facet_row('hap1', genes[idx[0]][2], fac['vocab']))} "
              f"of {len(fac['cols'])} columns -- add the new one here")

        by_col = Counter()
        for k, gid in enumerate(idx):
            hap, _, rec = genes[gid]
            want = facet_row(hap, rec, fac["vocab"])
            for j, (w, g) in enumerate(zip(want, fac["rows"][k])):
                if w != g:
                    by_col[fac["cols"][j]] += 1
        worst = ", ".join(f"{c}={n}" for c, n in by_col.most_common(4))
        check("facet values match the gene shards (all rows, all columns)", not by_col,
              f"stale columns: {worst}" if by_col
              else f"{len(idx)} rows x {len(fac['cols'])} cols")

    # ---- 3D models (TODO 34): bucket rule, coverage, and agreement with the page's ss.n ----
    sroot = f"{DATA}/struct"
    if "structure" in man or os.path.isdir(sroot):
        want = {gid for gid, (_, _, rec) in genes.items() if (rec.get("prot") or {}).get("ss")}
        seen, wrong_bucket, wrong_n, bad_len = set(), [], [], []
        for dp, _, fs in os.walk(sroot):
            for fn in sorted(f for f in fs if f.endswith(".bin.gz")):
                path = os.path.join(dp, fn)
                key = os.path.relpath(path, sroot)[:-len(".bin.gz")]
                raw = gzip.decompress(open(path, "rb").read())
                (h,) = struct.unpack_from("<I", raw, 0)
                head = json.loads(raw[4:4 + h])
                end = 0
                for gid, (off, n) in head["genes"].items():
                    seen.add(gid)
                    if struct_key(gid) != key:
                        wrong_bucket.append(gid)
                    ss = (genes[gid][2].get("prot") or {}).get("ss") if gid in genes else None
                    if not ss or ss.get("n") != n:
                        wrong_n.append(gid)
                    end = max(end, off + 10 * n)
                if end != len(raw) - 4 - h:
                    bad_len.append(key)
        check("every gene with an ESMFold model has a 3D model, and no other gene does",
              seen == want, f"{len(want - seen)} missing, {len(seen - want)} extra")
        check("every 3D model sits in the bucket its gene ID resolves to", not wrong_bucket,
              f"{len(wrong_bucket)} misplaced")
        check("every 3D model has the residue count its gene page states", not wrong_n,
              f"{len(wrong_n)} disagree")
        check("every 3D bucket's payload length matches its own index", not bad_len, str(bad_len[:3]))
        check("manifest structure.genes matches the 3D buckets",
              (man.get("structure") or {}).get("genes") == len(seen),
              f"manifest {(man.get('structure') or {}).get('genes')} vs {len(seen)}")

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
