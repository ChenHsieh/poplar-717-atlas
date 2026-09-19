// The provenance sidecars, made reachable.
//
// `sources/*.provenance.json` is where this project does its most careful writing: what a
// layer is FOR, the gate that had to pass before it shipped, what it deliberately does not
// claim, and -- most usefully -- what was tried and rejected. Nineteen of those files are
// committed and served over HTTP today, and nothing in the interface links to any of them.
// A reader who wants to know why the ComBat matrix is still two full copies, or why a tandem
// member can have no dS, has no route to the answer short of cloning the repo.
//
// So: fetched on demand, rendered as prose, keyed off the same manifest the source table
// already renders. Nothing is summarised or paraphrased here -- the sidecar's own words are
// the point, and a summary would be a second thing to keep true.
import { el } from './dom.js';

const KNOWN = [
  ['td_pair_ks', 'Per-pair tandem dS'],
  ['wgd_pairs', 'WGD anchor pairs'],
  ['wgd_combined_call', 'Route C re-adjudication'],
  ['karyotype_route_c', 'Ancestral karyotype'],
  ['dup_v9_and_pav', 'Duplication v9 and PAV'],
  ['duplicate_coexpr', 'Duplicate co-expression'],
  ['lsg_pool_idesia', 'LSG pool, Idesia-corrected'],
  ['lsg_qc_flags', 'LSG evidence quality'],
  ['kaks_ptri', 'Ka/Ks vs P. trichocarpa'],
  ['proteomics_ms_v2', 'Proteomics, re-searched'],
  ['chromatin_profiles', 'Chromatin profiles'],
  ['cre_promoter_hits', 'Promoter motifs'],
  ['gene_model_pairs', 'Gene-model support'],
  ['intron_support', 'Intron support'],
  ['structure_ca', 'ESMFold structures'],
  ['peptide_detail', 'Peptide detail'],
  ['promoter_motif_pos', 'Promoter motif positions'],
  ['sample_tissue_analysis', 'Sample tissue assignment'],
  ['combat_tpm', 'ComBat-seq matrix'],
];

/** Render one sidecar's own JSON as readable prose. Keys become headings in the order the
 *  file declares them, which is the order whoever wrote it chose. */
function renderSidecar(obj) {
  const wrap = el('div', {});
  const walk = (v, depth) => {
    if (v === null || v === undefined) return el('span', { class: 'muted' }, '—');
    if (Array.isArray(v)) {
      return el('ul', { style: 'margin:4px 0 0;padding-left:18px' },
        ...v.map((x) => el('li', { style: 'font-size:12.5px' }, walk(x, depth + 1))));
    }
    if (typeof v === 'object') {
      return el('dl', { class: 'kv', style: depth ? 'margin-top:4px' : null },
        ...Object.entries(v).flatMap(([k, x]) => [
          el('dt', { style: 'font-size:12px' }, k.replace(/_/g, ' ')),
          el('dd', {}, walk(x, depth + 1))]));
    }
    let s = String(v);
    // Trim absolute cluster paths the same way the source table above does. The sidecars were
    // written for a maintainer and quote full paths, including agent worktree directories
    // (.claude/worktrees/...) that mean nothing to a reader and look like a leak on a public
    // site. The informative part is the file, not the machine it sat on.
    s = s.replace(/\/scratch\/ch29576\/([^\s'"]*?)\.claude\/worktrees\/[^/]+\//g, '$1')
         .replace(/\/scratch\/ch29576\//g, '')
         .replace(/\/work\/cjtlab\//g, 'work:')
         .replace(/\/home\/ch29576\//g, '~/');
    // long prose reads better as a paragraph than as a definition-list value
    return s.length > 90
      ? el('p', { style: 'margin:0;font-size:12.5px;line-height:1.5' }, s)
      : el('span', { style: 'font-size:12.5px' }, s);
  };
  wrap.append(walk(obj, 0));
  return wrap;
}

export function evidenceCard() {
  const body = el('div', {});
  const card = el('div', { class: 'card' },
    el('h2', {}, 'Why each layer says what it says', el('span', { class: 'tag' }, '19 provenance records')),
    el('p', { class: 'muted', style: 'font-size:12.5px;margin:0 0 10px' },
      'Each source ships a provenance record stating what it is for, the gate that had to pass '
      + 'before it was allowed in, what it deliberately does not claim, and what was tried and '
      + 'rejected. These are the project’s own words, fetched as written — not '
      + 'summarised here, because a summary would be a second thing to keep true.'),
    body);

  const list = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' });
  const detail = el('div', { style: 'margin-top:12px' });
  let open = null;
  for (const [slug, label] of KNOWN) {
    const btn = el('button', {
      style: 'font-size:12px;padding:3px 9px;border:1px solid var(--line-2);border-radius:5px;'
        + 'background:var(--panel-2);color:var(--ink);cursor:pointer',
      onclick: async () => {
        if (open === slug) {            // click again to close
          open = null; detail.replaceChildren(); return;
        }
        open = slug;
        detail.replaceChildren(el('p', { class: 'muted', style: 'font-size:12px' }, 'Loading…'));
        try {
          const r = await fetch(`sources/${slug}.provenance.json`);
          if (!r.ok) throw new Error(`${r.status}`);
          const j = await r.json();
          detail.replaceChildren(
            el('h3', { style: 'font-size:13px;margin:0 0 6px' }, label,
              el('span', { class: 'mono muted', style: 'font-size:11px;margin-left:8px' },
                `sources/${slug}.provenance.json`)),
            renderSidecar(j));
        } catch (e) {
          // A missing sidecar is a real state -- not every source has one -- and saying which
          // is more useful than an empty panel.
          detail.replaceChildren(el('p', { class: 'muted', style: 'font-size:12.5px' },
            `No provenance record is published for ${label} (${e.message}). That means the `
            + 'layer predates the sidecar convention, not that it is undocumented — see '
            + 'the source table above and the CHANGELOG entry for that release.'));
        }
      },
    }, label);
    list.append(btn);
  }
  body.append(list, detail);
  return card;
}
