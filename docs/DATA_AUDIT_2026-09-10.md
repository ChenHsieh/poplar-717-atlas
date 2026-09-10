# Data audit — 2026-09-10

What changed on Sapelo2 since the 2026-09-05/06 audit, and what of it belongs in the atlas.

The trigger was a sweep of every job that finished between 2026-09-08 and 2026-09-10 and
every scratch directory touched in that window. Twelve analyses moved. Two of them do not add
a layer — they **qualify a layer the atlas already publishes**, which makes them the highest
priority here, ahead of anything new.

> Method note. Every verdict below was reached by opening the source table or run log and
> reading what it says about itself, not by reading a directory name. Three candidates that
> looked additive turned out to be corrections; two that looked ready turned out to be jobs
> still running.

---

## A. Corrections to layers already on the public site

These come first. The site has been live since 2026-09-01, so a stale layer here is not a
missing feature, it is a published claim its own source has since withdrawn.

### A1 — the LSG pool was corrected, and the atlas is serving the withdrawn one

**Status: adopted upstream, not yet reflected here. This is the top item.**

`ms2lsg_wt_proteomics/docs/CORRECTIONS.md` C2, dated 2026-09-09 and marked
**"Decision: ADOPTED (Chen, 2026-09-09)"**:

> Withdrawn as the canonical pool: 842 HAP1 / 883 HAP2 (rank >= 18, frozen 12-species genEra
> panel). Replaced by 776 HAP1 / 835 HAP2.

The atlas ships the withdrawn definition. Its own summary counts rank 18 = 846 and rank 19 =
879, the frozen panel, and its Browse facets, its `ps.lsg` flag and its LSG-pool line all rest
on it.

**Why the pool moved.** *Idesia polycarpa* is the only available Salicaceae genome outside
Saliceae and was never in the 12-species panel — a sampling gap sitting exactly where an LSG
call is made. A gene present in *Populus* and *Idesia* but lost in *Salix* reads as
*Populus*-specific. Adding *Idesia* removes 66 HAP1 and 48 HAP2 genes and adds none.
One-directional movement is the signature of adding real homology signal; a noisy rerun would
move genes both ways.

**The part that is more than a headcount.** 179 genes move PS19 to PS18 and stay in the pool;
none move the other way. Pool composition goes from 51.0% PS19 / 49.0% PS18 to 42.3% / 57.7%.
The atlas labels PS19 "hybrid-only", so for those 179 genes the site currently shows a stratum
name that the source no longer assigns them.

**What adoption does not license,** quoted so the atlas does not overclaim in the other
direction: abSENSE corrects homology-detection *failure*, a sensitivity problem; a missing
genome is taxon *sampling*, a coverage problem. Both surface as "no homolog found" and only the
first is fixable by modelling. 86% of the genes *Idesia* removed were `no_prediction` in the
frozen abSENSE run. The corrected pool is not evidence that the surviving calls are
modelled-safe.

Source: `pipeline/out/lsg_pool_idesia.tsv.gz`, 63,960 rows, carrying `rank` and `frozen_rank`
side by side, plus `left_pool_under_idesia` / `entered_pool_under_idesia`. Because it carries
both, the atlas can **show the correction** rather than silently swap one number for another.

`canonical_label` and `group` in that file are the unpublished LSG candidate names (10 genes:
LSG1.14g, LSG4.5g, the XO quartet). They stay out — TODO 22's hold, unchanged.

### A2 — the abSENSE flags on the QC card are worse calibrated than the card implies

**Status: measured upstream 2026-09-09, nothing retracted, the per-gene flag is qualified.**

The atlas ships `qc.hdf` and `qc.verdict` per pool gene (TODO 23, data 0.3.9). The source
analysis has since run the calibration that never existed: abSENSE `--predall` over 868,127
predicted-versus-observed pairs (`absense_predall/`, jobs 48015768_1/_2, ~9 h each).

Globally the fit is excellent and the intervals are not — Pearson r 0.981/0.983, but nominal
99% prediction intervals contain **87-88%** of true scores.

The damaging part is that calibration is worst exactly at the boundary that defines the pool:

| species | role | median bias | 99% PI coverage (HAP1 / HAP2) |
|---|---|---|---|
| *Salix purpurea* | **the rank-18 boundary species** | **+18.9 / +19.2** | **0.610 / 0.594** |
| *Idesia polycarpa* | rank-17 boundary | +4.2 / +4.5 | 0.815 / 0.796 |
| *Populus trichocarpa* | in-genus | -8.5 / -8.1 | 0.982 / 0.974 |

Every HDF flag on the pool is a prediction at *S. purpurea*. The bias direction is the
damaging one: abSENSE over-predicts what a *Salix* homolog would have scored, which makes an
observed absence look more surprising than it is, under-estimating `detection_failure_prob` and
over-calling `surprising_absence`. And 0.59-0.61 is the **optimistic** bound — it is measured
in-sample, on genes that *have* a *S. purpurea* homolog, i.e. on genes that are by definition
not LSGs.

The atlas already renders abSENSE as its own verdict string rather than collapsing it into a
gene-age claim, which was the right call and is why nothing here is retracted. What is missing
is the number: the card should carry the measured interval coverage beside the flag.

---

## B. New layers worth adding

### B1 — proteomics, re-searched: the string match is superseded by a real search

**Status: finished 2026-09-09. Recommend adopting; it supersedes the current `prot.ms`.**

The atlas currently serves `prot.ms`, three PXD datasets from **Tier 1** — string matching a
717 protein's tryptic peptides against peptide tables that a third party produced by searching
a *different species'* database. A Tier 1 negative is uninformative by construction: a peptide
that only exists in 717 could never have been in the database that produced those tables.

Tier 2 re-searched the raw spectra against a database that **contains the 717 proteins**
(34,699 trichocarpa + 32,137 HAP1 + 31,823 HAP2 = 98,659 targets, Sage 0.14.7, 1% peptide and
spectrum FDR), then repeated it across five public *Populus* datasets:

| dataset | species | peptides at 1% FDR | powered? |
|---|---|---|---|
| PXD025636 | *P. trichocarpa* | 52,056 | yes |
| PXD020099 | *P. tremula* x *tremuloides* | 28,812 | yes |
| PXD025418 | *P. tomentosa* xylem | 27,387 | yes |
| PXD002544 | *P.* x *canescens* | 9,805 | partly |
| PXD058986 | *P.* x *canescens* | 3,248 | **no** |

This is genome-wide per-gene detection, not a pool-restricted result, and the age gradient is
monotone (42.3% ancient, 12.8% conserved, 6.1% rosid, 2.9% Salicaceae, 0.12% pool) — the shape
expected if the assay measures real protein abundance rather than noise.

It also ships the control that makes an absence readable: a per-gene **detectability**
denominator (`proteomics_aspen/out/detectability.tsv`, tryptic peptides in the searchable
window, and how many are unique to that gene). A protein with no fully-tryptic peptide in range
is invisible however abundant it is, and that is a property of K/R content and length —
composition — on which LSGs differ from conserved genes. Counting such a gene as "not detected"
inflates the negative the way an unmatched control inflates an effect.

Adopting this replaces a weaker measurement with a stronger one on the same datasets, and
turns "absent" into "absent, and here is whether it could have been present".

### B2 — interspecific Ka/Ks: a selection layer the atlas does not have

**Status: finished 2026-09-09. Recommend adopting.**

`kaks_populus/` produced pairwise Ka/Ks for **52,232 genes** (26,064 HAP1 + 26,168 HAP2, 81.7%
of the atlas) against reciprocal-best *P. trichocarpa* orthologs, NG86 and YN00, only 290 rows
missing an omega.

The atlas today has one selection-adjacent number, HAP1<->HAP2 dS on the allele card. That is a
*within-hybrid* comparison of two haplotypes of one clone. An interspecific omega is a
different and more standard quantity, and it is the one a visitor asking "is this gene under
purifying selection" expects.

**Corrected while building it.** This entry first attributed the source's headline gradient
(0.21 / 0.30 / 0.34 / 0.54 / 0.68) to the *P. trichocarpa* comparison. It is not: those are
NG86 omega on the **HAP1↔HAP2** arm — which is itself an interspecific comparison, since HAP1
is the *P. tremula* subgenome and HAP2 the *P. alba* one. The trichocarpa arm carries its own
gradient, and it is the same shape: **0.235 ancient / 0.327 conserved / 0.475 rosid / 0.566
Salicaceae / 0.720 PS18**. Constrained, but less constrained; well below the neutral 1 that a
spurious open reading frame would give. The gradient is a dN effect — dN rises 4.5x while dS
stays inside a 1.6x band, and dS is null at the strictest matching tier.

PS19 omega **does not exist**: 1 of 681 genes has any trichocarpa pair. That is structural, not
missing data — a hybrid-only gene has no ortholog to measure against — and is rendered as a
stated absence rather than a blank cell. The same selection acts weakly on PS18: pairing rate
falls with youth (87.6% ancient, 39.1% PS18), so a young stratum's omega is measured on its
more conserved members and if anything understates the relaxation.

**The estimator had to be chosen by measurement, not by default.** The source ships both NG86
and YN00 omega. On these alignments they correlate at **r = 0.07 to 0.36 gene by gene**, while
their class medians agree to within 0.06. Median dS is about 0.04 — the sequences are close
enough that YN00's maximum-likelihood estimate is unstable per gene, and 3 to 4% of its omegas
exceed 1. Class-level agreement was hiding per-gene disagreement, which matters here
specifically because an atlas is a per-gene resource.

NG86 is the one with external support: against the atlas's **existing** allele omega, derived
by a different pipeline entirely, NG86 correlates at **r = 0.937** over 49,296 genes and YN00
at **0.083** over 34,884. So NG86 ships as the per-gene value; YN00 ships only so the card can
show the spread where the two disagree, never as an answer.

**Only the trichocarpa arm ships.** The HAP1↔HAP2 arm is not ingested: the atlas already
carries a HAP1↔HAP2 Ka/Ks on the allele card, and shipping a second omega for the same pair
would put two numbers for one quantity on one page with no way to tell which is right. What
that comparison *did* produce is an audit of the existing layer — see section E.

### B3 — chromatin: public ATAC-seq and ChIP-seq, reprocessed, but in another species

**Status: finished 2026-09-08/09. Recommend DEFER, with the reason recorded.**

`ms2_hybrid_rationale/results/tss/` holds MACS2 peak calls from GEO **GSE128434** (Schmitz lab,
*Nature Plants* 2019) — *P. trichocarpa* leaf ATAC-seq, H3K4me3, H3K36me3, H3K27me3, plus
matched RNA-seq — rolled up to a per-gene table of 34,140 *Potri* loci
(`l6_promoter_by_gene.tsv`: `acr`, `h3k4me3`, `h3k36me3_body`, `own_promoter`, `expressed`).

It is the only ATAC-seq that exists for anything in this clade, it is genuinely reprocessed
here rather than quoted, and the atlas already owns the join key: 46,141 reciprocal 1:1 *Potri*
orthologs.

**Deferred anyway, for the reason TODO 20 already settled.** The atlas declined to merge the
377-sample *P. trichocarpa* xylem expression matrix because it is a different genome,
annotation and pipeline. Chromatin from *P. trichocarpa* leaf is the same join with an extra
problem on top: a promoter is a *positional* feature, so carrying an ATAC call across an
ortholog edge asserts that the 717 gene's promoter is syntenic with the *Potri* gene's, which
the ortholog call does not establish. The source states the limit itself — "ATAC and H3K4me3
establish *that* a locus has a promoter, never *where*".

This is a defer, not a rejection. It becomes a clean layer the moment either (a) the atlas
gains a syntenic promoter-alignment check per ortholog pair, or (b) chromatin data exists for
717 itself. Recorded so the next reader does not re-derive the question from scratch.

### B4 — PS19 triage scores

**Status: finished 2026-09-03. Recommend DEFER to after A1.**

`ps19_triage/` carries per-gene PSAURON and PlantCAD2 coding-likelihood scores against a
purpose-built decoy floor, for the 879 PS19 genes. It pairs naturally with the existing QC card.

It is deferred only because A1 moves 179 genes out of PS19, so the set this layer is keyed to
is about to change by a fifth. Ingesting it first would mean shipping scores for a stratum
under its old membership. Order matters; the layer itself is sound.

---

## C. Not ready — jobs still running

Do not ingest. Recorded so a later reader knows these exist and why they are absent.

| candidate | what it is | state on 2026-09-10 |
|---|---|---|
| **pangenome presence** (`pangenome_lsg_run/`) | annotation-free tblastn of pool + control proteins against **31 Populus/Salicaceae genomes** — presence/absence that does not depend on any annotator's ORF policy, which is the known weakness of the current synteny layer | `pang_tblastn`, `pang_tbsoft` and `pang_hap1self` **still running**; a concurrent session is committing to the source repo hourly |
| **population constraint** (`k2_popconstraint/`) | per-gene constraint from *Populus* resequencing | submitted 2026-09-10, `k2_index` running |
| **selection tests** (`lsg_selection/`) | codon-model selection tests on pool genes | alignments staged, results not written |

The pangenome panel is the most valuable of the three and the one to pick up first when it
lands. Note it is queries-only (pool plus matched control, ~3,400 proteins), not genome-wide,
so it will be a pool card like `qc`, not a facet.

---

## D. Considered and rejected

| candidate | why not |
|---|---|
| `lsg_fold_novelty/` | scoped to the bark co-expression module, not a per-gene layer over the gene set; its conclusion is a set-level negative |
| `absense_predall/` as a **layer** | it is a calibration study, not a per-gene product. Its finding belongs on the existing QC card as a caveat (A2), not as 63,960 new fields |
| genome-wide abSENSE HDF flags | would widen a pool-only field to every gene. A2 is the reason not to: the flag is least trustworthy exactly where it is most used, so spreading it further is the wrong direction |


---

## E. An audit of a layer already shipped, which the new data made possible

The Ka/Ks work covers the HAP1↔HAP2 pair the atlas has served since v0.2, from an entirely
independent pipeline. That is a free check on an existing published layer, so it was run.

| | result |
|---|---|
| genes both cover | 50,656 |
| **same partner gene** | **100.0%** |
| ω correlation (NG86) | r = 0.937, medians 0.2652 existing vs 0.2200 |
| ω correlation (YN00) | r = 0.083, over 34,884 genes |

The partner call is fully confirmed — two independent orthology methods, one syntenic and one
reciprocal-best, agree on every one of 50,656 genes. That is a stronger statement than the
atlas could previously make about its own allele card.

The ω values differ by about 20% at the median. The allele card describes its numbers as
Yang–Nielsen estimates, and the new pipeline's *Yang–Nielsen* omega is the one that fails to
track them (r = 0.083), while its Nei–Gojobori omega tracks them closely (r = 0.937). Both
readings of that are consistent with the numbers, but the second is much better supported: at a
median Ks near 0.03 the maximum-likelihood estimator is unstable, it declined to produce a
value for a third of the pairs, and 3 to 4% of the values it did produce exceed 1. The
instability sits with the new pipeline's YN00 run, not with the allele card. The card now says
so, with the numbers.

Nothing in the allele layer is retracted. What changed is that it now carries independent
corroboration of its ortholog calls and a measured statement of how far a second pipeline's
omega sits from its own.

### Also checked, cheaply, because the data was in hand

The reciprocal-best-hit orthologs behind the new Ka/Ks layer were compared against the atlas's
own GENESPACE syntenic 1:1 *Potri* calls: **42,858 agree, 583 differ, 98.7%**. Those 583 genes
carry a note on their card rather than being silently dropped or silently trusted.
