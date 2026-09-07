// Module: expression atlas. 652 samples, 28 curated studies, kallisto k21 TPM.
// Two-level data: gene.x is a baseline SUMMARY already in the shard (free); the full
// 652-sample vector is a second fetch via loadExprVector(gene) -- see core/data.js.
import { el, clear, fmt, pct } from '../core/dom.js';
import { loadExprSamples, loadExprStudies, loadExprVector, loadCombatVector } from '../core/data.js';

const TISSUE_ORDER = ['leaf_young', 'leaf', 'leaf_old', 'xylem', 'bark', 'root', 'stem', 'bud', 'catkin', 'gall', 'callus'];
const orderTissues = (keys) => TISSUE_ORDER.filter((t) => keys.includes(t)).concat(keys.filter((t) => !TISSUE_ORDER.includes(t)));

function tauNote(tau) {
  if (tau == null) return 'not computable (all-zero baseline)';
  if (tau >= 0.85) return 'tissue-specific';
  if (tau >= 0.5) return 'moderately tissue-biased';
  return 'broadly expressed';
}

function baselineChart(x) {
  const tissues = orderTissues(Object.keys(x.t));
  const max = Math.max(...tissues.map((t) => x.t[t]), 0.01);
  const rows = tissues.map((t) => el('tr', {},
    el('td', {}, t === x.top ? el('strong', {}, t) : t),
    el('td', { class: 'num' }, fmt(x.t[t])),
    el('td', { class: 'muted', style: 'font-size:11px' }, `n=${x.n[t]}`),
    el('td', { style: 'width:46%' },
      el('div', { class: 'bar', style: `width:${Math.max((x.t[t] / max) * 100, x.t[t] > 0 ? 1.5 : 0)}%;background:var(--accent)` })),
  ));
  return el('table', { class: 'data' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Tissue'), el('th', { class: 'num' }, 'Median TPM'),
      el('th', {}, ''), el('th', {}, ''))),
    el('tbody', {}, ...rows));
}

function geneCard(g) {
  if (!g.x) return null;
  const x = g.x;
  const card = el('div', { class: 'card' },
    el('h2', {}, 'Expression', el('span', { class: 'tag' }, 'kallisto k21')),
    el('p', { class: 'sub', style: 'margin:0 0 10px' },
      `Median TPM across the WT-control subset (used for the baseline and τ below only — `,
      `perturbation and the full 652-sample profile are separate views, see below). Peak: `,
      el('strong', {}, x.top || '—'), ` (${fmt(x.t[x.top])} TPM). `,
      `τ = ${x.tau ?? '—'} — ${tauNote(x.tau)}.`),
    baselineChart(x),
    el('p', { class: 'muted', style: 'font-size:11px;margin:6px 0 0' },
      `τ computed over ${orderTissues(Object.keys(x.t).filter((t) => t !== 'callus')).join(' / ')} `,
      '(callus excluded — 1 sample, not part of the manuscript panel per the delivery notes). ',
      'callus is still shown above. leaf_young/leaf_old (study 1 only) and the unsplit leaf ',
      '(every other study) are three separate tissues here, not one — see docs/DATA_AUDIT.md.'),
    g.resp && g.resp.v != null ? el('p', { style: 'font-size:12.5px;margin:9px 0 0' },
      el('strong', {}, 'Responsiveness: '),
      'median |log2 fold-change| across perturbation contrasts is ',
      el('span', { class: 'mono' }, g.resp.v.toFixed(3)),
      g.resp.n ? el('span', { class: 'muted' }, ` over ${g.resp.n} eligible contrasts.`) : '.') : null,
    g.nb && g.nb.k5 != null ? el('p', { style: 'font-size:12.5px;margin:9px 0 0' },
      el('strong', {}, 'Neighbourhood: '),
      'co-expression with the 5 nearest genes is ',
      el('span', { class: 'mono' }, g.nb.k5.toFixed(3)),
      g.nb.k10 != null ? el('span', {}, ', with the nearest 10 ', el('span', { class: 'mono' }, g.nb.k10.toFixed(3))) : null,
      el('span', { class: 'muted' }, '. High values suggest shared regulation with the locus rather than with a pathway.')) : null,
  );
  const btn = el('button', {
    style: 'margin-top:10px;font-size:12px;padding:4px 9px;border:1px solid var(--line-2);border-radius:5px;background:var(--panel-2);color:var(--ink);cursor:pointer',
    onclick: async (e) => {
      e.target.disabled = true; e.target.textContent = 'Loading…';
      const holder = el('div', { id: 'expr-profile', style: 'margin-top:12px' });
      card.append(holder);
      e.target.remove();
      const [rawVec, samples, studies] = await Promise.all([loadExprVector(g), loadExprSamples(), loadExprStudies()]);

      // Two views of the same vector. Conditions first, because "does it respond to drought
      // in study 27" is answerable from replicate means and not from 652 individual dots.
      let activeVec = rawVec;
      let combatVec = null; // fetched lazily, only if the toggle is used
      const body = el('div', {});
      const tabs = el('div', { style: 'display:flex;gap:6px;margin-bottom:10px' });
      let renderCurrent = () => {};
      const mk = (label, render) => {
        const b = el('button', {
          onclick: () => {
            [...tabs.children].forEach((c) => { c.dataset.on = 'false'; c.style.background = 'var(--panel-2)'; c.style.color = 'var(--ink)'; });
            b.dataset.on = 'true'; b.style.background = 'var(--accent)'; b.style.color = '#fff';
            renderCurrent = () => clear(body).append(render());
            renderCurrent();
          },
          style: 'font-size:12px;padding:4px 10px;border:1px solid var(--line-2);border-radius:5px;background:var(--panel-2);color:var(--ink);cursor:pointer',
        }, label);
        return b;
      };
      const byCond = mk('By condition', () => conditionTable(activeVec, samples, studies));
      const bySamp = mk('By sample', () => fullProfile(activeVec, samples, studies));
      tabs.append(byCond, bySamp);
      holder.append(tabs, body);

      // ComBat-corrected is a SEPARATE toggle, not a third tab -- it swaps which vector feeds
      // the same two views rather than tripling the tab count. Only offered when this gene
      // has one: `x.cb` is absent (not null) for the ~4,360 genes with too little count
      // signal to batch-correct -- see sources/combat_tpm.provenance.json. Never implies the
      // corrected value is more correct; it is a narrower cross-study comparison view only.
      if (g.x.cb) {
        const src = el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:10px;font-size:11.5px;color:var(--ink-2)' },
          'Values: ');
        const mkSrc = (label, isRaw) => {
          const b = el('button', {
            onclick: async () => {
              if (isRaw) {
                activeVec = rawVec;
              } else {
                if (!combatVec) {
                  b.textContent = 'Loading…';
                  combatVec = await loadCombatVector(g);
                }
                activeVec = combatVec;
              }
              [...src.querySelectorAll('button')].forEach((c) => { c.dataset.on = 'false'; c.style.background = 'var(--panel-2)'; c.style.color = 'var(--ink)'; });
              b.dataset.on = 'true'; b.style.background = 'var(--accent)'; b.style.color = '#fff';
              b.textContent = label;
              renderCurrent();
            },
            style: 'font-size:11.5px;padding:3px 8px;border:1px solid var(--line-2);border-radius:5px;background:var(--panel-2);color:var(--ink);cursor:pointer',
          }, label);
          return b;
        };
        const rawBtn = mkSrc('Raw', true);
        const cbBtn = mkSrc('ComBat-corrected (cross-study)', false);
        rawBtn.dataset.on = 'true'; rawBtn.style.background = 'var(--accent)'; rawBtn.style.color = '#fff';
        src.append(rawBtn, cbBtn,
          el('span', { style: 'font-size:11px' },
            '— batch-adjusted for comparing this gene ACROSS studies; raw stays primary everywhere else on this site.'));
        holder.insertBefore(src, tabs);
      }

      byCond.click();
    },
  }, `Show all 652 samples →`);
  card.append(btn);
  return card;
}

/** Replicate means per experimental condition, grouped by study.
 *  Conditions come from the METADATA fields, not by stripping "_repN" off the label --
 *  study 27 encodes replicates as DR1/DR2/DR3 with no _rep, which would split every one of
 *  its 72 samples into its own group. */
function conditionTable(vec, samples, studies) {
  const groups = new Map();
  samples.forEach((s, i) => {
    const key = [s.study, s.tissue_analysis || s.tissue, s.treatment, s.growth, s.additional, s.genotype].join('\u0001');
    if (!groups.has(key)) groups.set(key, { s, vals: [] });
    groups.get(key).vals.push(vec[i]);
  });
  const rows = [...groups.values()].map(({ s, vals }) => ({
    s, n: vals.length,
    mean: vals.reduce((a, b) => a + b, 0) / vals.length,
  })).sort((a, b) => a.s.study - b.s.study
    || (a.s.tissue_analysis || a.s.tissue || '').localeCompare(b.s.tissue_analysis || b.s.tissue || '')
    || b.mean - a.mean);
  const max = Math.max(...rows.map((r) => r.mean), 0.01);

  const cond = (s) => [s.treatment, s.growth, s.additional].filter(Boolean).join(' · ') || 'baseline';
  return el('div', {},
    el('p', { class: 'muted', style: 'font-size:12px;margin:0 0 8px' },
      `${rows.length} conditions across ${new Set(rows.map((r) => r.s.study)).size} studies, `
      + 'each a mean over its replicates. Bars share one scale.'),
    el('div', { class: 'scroll-x', style: 'max-height:520px;overflow-y:auto' },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Study'), el('th', {}, 'Tissue'), el('th', {}, 'Condition'),
          el('th', {}, 'Genotype'), el('th', { class: 'num' }, 'n'),
          el('th', { class: 'num' }, 'Mean TPM'), el('th', {}, ''))),
        el('tbody', {}, ...rows.map((r) => el('tr', {},
          el('td', {}, el('a', { href: `#/study/${r.s.study}`, class: 'mono' }, r.s.study)),
          el('td', { style: 'font-size:12px' }, r.s.tissue_analysis || r.s.tissue || '—'),
          el('td', { style: 'font-size:12px' }, cond(r.s)),
          el('td', { style: 'font-size:12px' }, r.s.genotype || '—'),
          el('td', { class: 'num' }, r.n),
          el('td', { class: 'num' }, r.mean.toFixed(2)),
          el('td', { style: 'width:30%' },
            el('div', { class: 'bar', style: `width:${Math.max((r.mean / max) * 100, r.mean > 0 ? 1.5 : 0)}%;`
              + `background:${r.s.ctrl === 'perturbation' ? 'var(--c-disp)' : 'var(--c-core)'}` })))))))
  );
}

function fullProfile(vec, samples, studies) {
  const bySt = new Map();
  samples.forEach((s, i) => {
    if (!bySt.has(s.study)) bySt.set(s.study, []);
    bySt.get(s.study).push({ ...s, tpm: vec[i] });
  });
  const max = Math.max(...vec, 0.01);
  const wrap = el('div', {});
  const legend = el('div', { style: 'display:flex;gap:14px;align-items:center;font-size:12px;margin-bottom:8px;color:var(--ink-2)' },
    el('span', {}, el('i', { class: 'dot', style: 'background:var(--c-core);display:inline-block' }), ' control'),
    el('span', {}, el('i', { class: 'dot', style: 'background:var(--c-disp);display:inline-block' }), ' perturbation'));
  wrap.append(el('h3', { style: 'font-size:13px;margin:0 0 6px' }, 'Every sample'), legend);

  for (const [sid, rows] of [...bySt.entries()].sort((a, b) => a[0] - b[0])) {
    const study = studies[sid];
    const strip = el('div', { style: 'display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:3px' });
    rows.sort((a, b) => a.label.localeCompare(b.label)).forEach((r) => {
      const h = Math.max(3, (r.tpm / max) * 30);
      strip.append(el('div', {
        title: `${r.label}\n${r.tpm} TPM\n${r.tissue_analysis || r.tissue}${r.treatment ? ' · ' + r.treatment : ''}${r.genotype ? ' · ' + r.genotype : ''}`,
        style: `width:7px;height:30px;display:flex;align-items:flex-end`,
      }, el('div', { style: `width:100%;height:${h}px;background:${r.ctrl === 'perturbation' ? 'var(--c-disp)' : 'var(--c-core)'};border-radius:1px` })));
    });
    wrap.append(el('div', { style: 'display:flex;align-items:center;gap:10px;padding:4px 0;border-top:1px solid var(--line)' },
      el('a', { href: `#/study/${sid}`, class: 'mono', style: 'font-size:11px;width:28px;flex:none' }, sid),
      el('span', { class: 'muted', style: 'font-size:11px;width:220px;flex:none' }, study.tissues.join('/')),
      strip));
  }
  return wrap;
}

/* ---------- module overview: study catalogue ---------- */
function studyRow(s) {
  return el('tr', {},
    el('td', {}, el('a', { href: `#/study/${s.id}`, class: 'mono' }, s.id)),
    el('td', { class: 'num' }, s.n),
    el('td', {}, s.tissues.join(', ')),
    el('td', {}, s.panel_type.join(', ') || el('span', { class: 'muted' }, '—')),
    el('td', { class: 'mono' }, s.bioprojects[0] + (s.bioprojects.length > 1 ? ` +${s.bioprojects.length - 1}` : '')),
    el('td', { class: 'muted', style: 'font-size:12px' }, s.citation ? s.citation.split('.')[0] + '.' : '—'),
  );
}

function tissuePanelMatrix(man) {
  const tw = man.expression.tissue_wt_control_n;
  const rows = Object.entries(tw).sort((a, b) => b[1] - a[1]).map(([t, n]) => el('tr', {},
    el('td', {}, t), el('td', { class: 'num' }, n),
    el('td', {}, el('div', { class: 'bar', style: `width:${(n / Math.max(...Object.values(tw))) * 100}%;background:var(--accent)` }))));
  return el('table', { class: 'data' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Tissue'), el('th', { class: 'num' }, 'WT-control n'), el('th', {}, ''))),
    el('tbody', {}, ...rows));
}

async function overview(man) {
  const studies = await loadExprStudies();
  const list = Object.values(studies).sort((a, b) => a.id - b.id);
  const e = man.expression;
  return el('div', {},
    el('h1', {}, 'Expression'),
    el('p', { class: 'sub' },
      `${fmt(e.n_samples)} samples, ${e.n_studies} curated studies, ${e.n_bioprojects} BioProjects. `
      + `kallisto k21 pseudoalignment against the combined HAP1+HAP2 v5.1 transcriptome. `
      + `TPM, raw (not batch-corrected) — see each study for design and caveats.`),
    el('div', { class: 'stat-row' },
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(e.n_samples)), el('div', { class: 'l' }, 'samples')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, e.n_studies), el('div', { class: 'l' }, 'studies')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, e.n_bioprojects), el('div', { class: 'l' }, 'BioProjects')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(e.n_buckets * e.bucket_size)), el('div', { class: 'l' }, 'gene profiles indexed')),
    ),
    el('div', { class: 'card' },
      el('h2', {}, 'WT-control samples per tissue', el('span', { class: 'tag' }, 'baseline denominator')),
      el('p', { class: 'muted', style: 'font-size:12px;margin:0 0 10px' },
        `Every gene's tissue-baseline bars are the median TPM across these WT-control samples. `
        + `stem, bud, catkin and callus are thin (≤5) — read differences with that in mind.`),
      tissuePanelMatrix(man)),
    el('div', { class: 'card' },
      el('h2', {}, 'Studies'),
      el('div', { class: 'scroll-x' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', { class: 'num' }, 'n'), el('th', {}, 'Tissue'),
          el('th', {}, 'Panel'), el('th', {}, 'BioProject'), el('th', {}, 'Source'))),
        el('tbody', {}, ...list.map(studyRow))))),
    el('p', { class: 'muted', style: 'font-size:11.5px' },
      'Full matrix CSVs (TPM/FPKM/counts, all 652 samples × 63,960 genes) are not bundled in ',
      'this repo — the per-gene and per-study JSON above carry the same values. Ask the author for the raw CSVs.'),
  );
}

export default {
  id: 'expression',
  label: 'Expression',
  geneCard,
  overview,
  filters: [
    { id: 'expr_top_tissue', label: 'Peak tissue', options: TISSUE_ORDER,
      test: (g, v) => g.x && g.x.top === v },
    { id: 'expr_tau', label: 'τ (tissue-specificity)',
      test: (g, v) => g.x && g.x.tau != null && g.x.tau >= parseFloat(v) },
  ],
};
