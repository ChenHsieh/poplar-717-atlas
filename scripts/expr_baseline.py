"""Which expression samples form the tissue baseline, and how a tissue's value is taken.

One module, imported by build_expression.py (the full build on Sapelo2),
patch_baseline_fresh_ambient.py (the in-place correction of 2026-09-21) and validate_data.py,
so the rule cannot drift between the three.

THE RULE (Chen, 2026-09-21: "use WT fresh ambient-CO2 controls for the baseline"). The baseline
is every wild-type control sample except controls grown at raised CO2 or sampled at a later
timepoint. Only study 1 has either. Its controls cross two CO2 levels (380 and 500 ppm) with two
timepoints (fresh, and "recovered" after re-watering), and only its fresh 380 ppm controls are
kept: 14 of its 58 wild-type controls. No other study's control carries a CO2 level or a later
timepoint, and audit() refuses metadata where one does, rather than classifying it silently.

Before 2026-09-21 the rule was genotype == WT and the raw control flag == "control". That flag
is coarse (ms2-lsg docs/GOTCHAS.md #15). In study 1 it put 500 ppm and recovered controls into
the baseline.

THE VALUE. A tissue's baseline is the median TPM of its baseline samples, taken on the 2-decimal
TPM the site ships, so a reader can reproduce it from the vector they download. With an even
number of samples it is the mean of the two middle values. (Until 2026-09-21 it was the upper
of the two, which for a two-sample tissue is the larger sample.) A gene whose every tissue
median is 0 has no peak tissue.
"""
import re

AMBIENT_CO2 = {"380CO2"}
RAISED_CO2 = {"500CO2"}
LATER_TIMEPOINT = {"recovered"}
# Time annotations a control may carry and still be a fresh baseline sample. "0hr" is study
# 12's time-zero control. Any other time-like value is refused until someone decides it.
FRESH_TIME = {"0hr"}
TAU_TISSUES_EXCLUDE = {"callus"}

RULE = ("Wild-type control samples, leaving out controls grown at raised CO2 (500 ppm) or "
        "sampled at a later timepoint (recovered after re-watering). Only study 1 has either; "
        "its 14 fresh ambient-CO2 (380 ppm) controls are kept and its other 44 left out.")
DECISION = 'Chen, 2026-09-21: "use WT fresh ambient-CO2 controls for the baseline"'
MEDIAN_RULE = "the middle value, or the mean of the two middle values when n is even"

_CO2 = re.compile(r"co2", re.I)
_LATER = re.compile(r"recover|re-?water", re.I)
_TIME = re.compile(r"\b\d+\s*(?:h|hr|hrs|hour|hours|d|day|days|wk|week|weeks)\b", re.I)


def is_wt_control(s):
    """The old rule, kept so the correction can prove it reproduces what was shipped."""
    return s.get("genotype") == "WT" and s.get("ctrl") == "control"


def in_baseline(s):
    return (is_wt_control(s)
            and s.get("growth") not in RAISED_CO2
            and s.get("additional") not in LATER_TIMEPOINT)


def audit(samples):
    """Refuse metadata this rule was not written for. Returns the controls it leaves out."""
    problems = []
    for s in samples:
        for k in ("treatment", "growth", "additional"):
            v = s.get(k) or ""
            if _CO2.search(v) and v not in AMBIENT_CO2 | RAISED_CO2:
                problems.append(f"{s['label']}: unknown CO2 level {k}={v!r}")
            if _LATER.search(v) and v not in LATER_TIMEPOINT:
                problems.append(f"{s['label']}: unknown later-timepoint value {k}={v!r}")
            if is_wt_control(s) and _TIME.search(v) and v not in FRESH_TIME:
                problems.append(f"{s['label']}: control carries an undecided time {k}={v!r}")
    if problems:
        raise SystemExit("REFUSING, the baseline rule was not written for this metadata:\n  "
                         + "\n  ".join(problems[:10]))
    left_out = [s for s in samples if is_wt_control(s) and not in_baseline(s)]
    studies = sorted({s["study"] for s in left_out})
    if studies not in ([], [1]):
        raise SystemExit(f"REFUSING: the rule leaves out controls in studies {studies}; it was "
                         "decided for study 1 only. Ask before extending it.")
    return left_out


def tissue_index(samples, keep):
    """tissue -> sample indices, tissues in order of first appearance (which sets how a tie
    for the peak tissue breaks, exactly as the original build did)."""
    out = {}
    for i, s in enumerate(samples):
        if keep(s):
            out.setdefault(s["tissue_analysis"], []).append(i)
    return out


def median(sorted_vals):
    n = len(sorted_vals)
    m = n // 2
    return sorted_vals[m] if n % 2 else (sorted_vals[m - 1] + sorted_vals[m]) / 2


def upper_median(sorted_vals):
    """What the build did before 2026-09-21. Only the correction's reproduction gate uses it."""
    return sorted_vals[len(sorted_vals) // 2]


def tau(values):
    """Yanai's tau. 0 = uniformly expressed, 1 = perfectly tissue-specific. None if every value
    is <= 0 or there is one tissue."""
    mx = max(values)
    if mx <= 0 or len(values) <= 1:
        return None
    return sum(1 - (v / mx) for v in values) / (len(values) - 1)


def summarise(vals, index, med=median, zero_has_peak=False):
    """One gene's baseline: per-tissue median TPM and n, tau over the non-callus tissues, and
    the peak tissue. `vals` is the gene's 2-decimal TPM vector in samples.json order."""
    tmed, tn = {}, {}
    for t, idxs in index.items():
        tmed[t] = round(med(sorted(vals[k] for k in idxs)), 2)
        tn[t] = len(idxs)
    tau_vals = [v for t, v in tmed.items() if t not in TAU_TISSUES_EXCLUDE]
    tv = tau(tau_vals) if tau_vals else None
    top = max(tmed, key=tmed.get) if tmed else None
    if top is not None and tmed[top] <= 0 and not zero_has_peak:
        top = None
    return {"t": tmed, "n": tn, "tau": round(tv, 3) if tv is not None else None, "top": top}
