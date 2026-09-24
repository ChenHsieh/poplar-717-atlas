// Browse / query builder. The cross-module payoff: ask one question across synteny,
// phylostratigraphy, expression and annotation at once, then keep the answer as a gene set.
//
// Filtering runs over data/index/facets.json (274 KB gzipped, one fetch) rather than the gene
// shards -- a filter that had to read 39 MB of shards plus 208 MB of expression buckets would
// not be a filter anyone waits for.
import { el, clear, fmt } from './dom.js';
import { loadFacets, facetRow, loadGeneIndex, dataVersion } from './data.js';
import { query, setQuery } from './router.js';
import { onDispose } from './lifecycle.js';
import {
  saveSet, allSets, removeSet, subscribe, exportSets, importSets, storageStatus,
  MAX_GENESET_IMPORT_BYTES,
} from './geneset.js';

const PAGE = 100;

// Each filter is {id, label, kind, options?, test(row, value)}. Kept here rather than
// collected from the modules so that a filter's data source (the facet index) and its
// definition stay in one place -- the module `filters` arrays operate on full gene records
// and are for the gene page, not for this.
// Exported so the home page can count its question links with these EXACT predicates --
// a second implementation would be a second set of numbers, and they would drift.
export const FILTERS = [
  { id: 'hap', label: 'Haplotype', kind: 'select', options: ['hap1', 'hap2'],
    test: (r, v) => r.hap === v },
  { id: 'cls', label: 'Synteny class', kind: 'select',
    options: ['core_syntenic', 'dispensable_syntenic', 'non_syntenic_ortholog',
              'private_no_ortholog', 'tandem_array_member'],
    test: (r, v) => r.cls === v },
  { id: 'ps_min', label: 'Phylostratum ≥', kind: 'number', placeholder: '18',
    test: (r, v) => r.ps != null && r.ps >= +v },
  // exact, not >=: a stratum bar on the phylostratigraphy page means THAT stratum
  { id: 'ps', label: 'Phylostratum =', kind: 'number', placeholder: '18',
    test: (r, v) => r.ps === +v },
  { id: 'tau_min', label: 'τ ≥', kind: 'number', placeholder: '0.8', step: '0.05',
    test: (r, v) => r.tau != null && r.tau >= +v },
  // Peak-tissue categories are release data, not a UI-owned list. browseView() fills this
  // control from facets.vocab.top so a new or split tissue appears without a source edit.
  { id: 'top', label: 'Peak tissue', kind: 'select',
    test: (r, v) => r.top === v },
  { id: 'chr', label: 'Chromosome', kind: 'select',
    options: Array.from({ length: 19 }, (_, i) => 'Chr' + String(i + 1).padStart(2, '0')).concat('scaffolds'),
    test: (r, v) => r.chr === v },
  { id: 'allele', label: 'Has allele', kind: 'select', options: ['yes', 'no'],
    test: (r, v) => (r.allele ? 'yes' : 'no') === v },
  { id: 'at', label: 'Has Arabidopsis hit', kind: 'select', options: ['yes', 'no'],
    test: (r, v) => (r.at ? 'yes' : 'no') === v },
  // The CURATED union set (13,048 genes), the same one the Duplication card and the class
  // figures use. GENESPACE's looser tandem placement is the Synteny class filter's
  // `tandem_array_member` option, and the two are not interchangeable.
  { id: 'tandem', label: 'In curated tandem array', kind: 'select', options: ['yes', 'no'],
    test: (r, v) => (r.tandem ? 'yes' : 'no') === v },
  // Events are not exclusive: a gene retained from both the gamma triplication and the salicoid
  // WGD matches either choice.
  //
  // TWO calls, and the default is the one the current class figures are drawn from. Browsing
  // on v9 while holding a route C Venn gave 191 for "HAP1 + tandem + both" against the
  // figure's 229, which reads as a broken filter rather than as two different calls. The
  // canonical v9 call stays selectable directly below, so the published numbers remain
  // reproducible here. Neither is a correction of the other in this UI -- see the gene page.
  { id: 'wgd', label: 'WGD event (route C call)', kind: 'select',
    options: ['salicoid', 'gamma', 'both', 'either', 'neither'],
    test: (r, v) => ({ salicoid: (r.wgd & 1) > 0, gamma: (r.wgd & 2) > 0, both: r.wgd === 3,
                       either: r.wgd > 0, neither: r.wgd === 0 })[v] },
  // The disagreement itself, as a filter. It cannot be expressed with the two columns above:
  // a gene carrying BOTH events under BOTH calls matches "route C salicoid AND v9 gamma"
  // while agreeing completely, which is how a first draft of the home page's question
  // reported 7,574 disagreements instead of 904.
  { id: 'wgd_disputed', label: 'WGD call disputed (route C vs v9)', kind: 'select',
    options: ['yes', 'no'], test: (r, v) => (r.ccd ? 'yes' : 'no') === v },
  { id: 'wgd9', label: 'WGD event (canonical v9)', kind: 'select',
    options: ['salicoid', 'gamma', 'both', 'either', 'neither'],
    test: (r, v) => ({ salicoid: (r.wgd9 & 1) > 0, gamma: (r.wgd9 & 2) > 0, both: r.wgd9 === 3,
                       either: r.wgd9 > 0, neither: r.wgd9 === 0 })[v] },
  // Exploratory (route C). A gamma copy number is a rank WITHIN one ancestral chromosome, so the
  // choice is a chromosome or one chromosome's copy; a bare "gamma copy 2" across all seven would
  // pool unrelated copies. "not placed" includes the HAP1 unplaced-scaffold genes, never assessed.
  { id: 'aek', label: 'Ancestral chromosome (exploratory)', kind: 'select',
    options: [1, 2, 3, 4, 5, 6, 7].flatMap((c) => [`AEK${c}`,
      ...[1, 2, 3].flatMap((k) => [`AEK${c}_gamma_copy_${k}`,
        ...[1, 2].map((t) => `AEK${c}_gamma_copy_${k}_salicoid_copy_${t}`)])]).concat('not_placed'),
    test: (r, v) => {
      if (v === 'not_placed') return r.aek < 0;
      // salicoid copy added so every cell of the #/karyotype grid is a real, shareable query
      const m = /^AEK([1-7])(?:_gamma_copy_([1-3])(?:_salicoid_copy_([12]))?)?$/.exec(v);
      return !!m && r.aek >= 0 && Math.floor(r.aek / 100) === +m[1]
        && (!m[2] || Math.floor(r.aek / 10) % 10 === +m[2])
        && (!m[3] || r.aek % 10 === +m[3]);
    } },
  // w is stored as an integer per-mille. -1 means no reciprocal-best P. trichocarpa ortholog
  // and -2 means a pair exists but omega could not be estimated; both are real states, so a
  // threshold filter must exclude them rather than treat them as 0.
  { id: 'w_min', label: 'ω ≥', kind: 'number', placeholder: '1.0', step: '0.1',
    test: (r, v) => r.w >= 0 && r.w / 1000 >= +v },
  { id: 'w_max', label: 'ω ≤', kind: 'number', placeholder: '0.1', step: '0.1',
    test: (r, v) => r.w >= 0 && r.w / 1000 <= +v },
  { id: 'ms', label: 'Peptide-detected', kind: 'select', options: ['yes', 'no'],
    test: (r, v) => (r.ms > 0 ? 'yes' : 'no') === v },
  // The threshold is in the label on purpose: "expressed" is not an absolute property, and a
  // filter that hides its cutoff invites reading it as one.
  { id: 'xin', label: 'Expressed in (>1 TPM)', kind: 'select',
    options: ['leaf_young', 'leaf', 'leaf_old', 'xylem', 'bark', 'root', 'stem', 'bud',
              'catkin', 'callus'],
    test: (r, v) => r.xin.includes(v) },
];

function filterOptions(filter, facets) {
  const values = filter.id === 'top' ? facets.vocab?.top : filter.options;
  // Preserve the vocabulary's data order: it is the release's declared category order.
  return [...new Set(Array.isArray(values) ? values : [])];
}

function valuesFromQuery(options) {
  const values = {};
  const params = query();
  for (const filter of FILTERS) {
    const value = params[filter.id];
    if (value == null || value === '') continue;
    if (filter.kind === 'select') {
      if (options.get(filter.id)?.includes(value)) values[filter.id] = value;
    } else if (Number.isFinite(Number(value))) {
      values[filter.id] = value;
    }
  }
  return values;
}

function applyFilters(state, navigation) {
  // A stale Browse request must not replace the query string for a newer route while its
  // facets fetch finishes in the background.
  if (navigation && !navigation.isCurrent()) return false;
  const active = FILTERS.filter((f) => state.values[f.id] !== undefined
    && state.values[f.id] !== '' && state.values[f.id] !== null);
  // Record the active filters in the URL so the view is shareable. setQuery uses
  // replaceState, so this does NOT re-enter the router and rebuild the page.
  try {
    setQuery(Object.fromEntries(active.map((f) => [f.id, state.values[f.id]])));
  } catch { /* URL bookkeeping is cosmetic; never let it break filtering */ }
  const out = [];
  for (let i = 0; i < state.rows.length; i++) {
    const r = state.rows[i];
    let ok = true;
    for (const f of active) {
      if (!f.test(r, state.values[f.id])) { ok = false; break; }
    }
    if (ok) out.push(i);
  }
  state.matches = out;
  state.page = 0;
  return true;
}

function resultsTable(state) {
  const start = state.page * PAGE;
  const slice = state.matches.slice(start, start + PAGE);
  const body = slice.map((i) => {
    const r = state.rows[i];
    return el('tr', {},
      el('td', {}, el('a', { href: `#/gene/${state.ids[i]}`, class: 'mono' }, state.ids[i])),
      el('td', {}, r.chr || '—'),
      el('td', {}, r.cls ? r.cls.replace(/_/g, ' ') : '—'),
      el('td', { class: 'num' }, r.ps == null ? '—' : 'PS' + r.ps),
      el('td', { class: 'num' }, r.tau == null ? '—' : r.tau.toFixed(2)),
      el('td', {}, r.top || '—'),
      el('td', { class: 'num' }, r.npres === 0
        ? el('span', { class: 'muted', title: 'OrthoFinder assigned no orthogroup' }, 'none')
        : r.npres + '/12'),
      el('td', { class: 'num' }, r.w >= 0
        ? (r.w / 1000).toFixed(3)
        : el('span', { class: 'muted',
            title: r.w === -1 ? 'no reciprocal-best P. trichocarpa ortholog'
                              : 'ortholog found, but omega could not be estimated' },
            r.w === -1 ? 'no ortholog' : 'n/e')),
      el('td', { class: 'num' }, r.ms > 0
        ? `${r.ms}/5`
        : el('span', { class: 'muted' }, '—')));
  });
  return el('div', { class: 'scroll-x' }, el('table', { class: 'data' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Gene'), el('th', {}, 'Chr'),
      el('th', {}, 'Synteny class'), el('th', { class: 'num' }, 'PS'),
      el('th', { class: 'num' }, 'τ'), el('th', {}, 'Peak tissue'),
      el('th', { class: 'num' }, 'Genomes'),
      el('th', { class: 'num', title: 'Ka/Ks against the best P. trichocarpa ortholog' }, 'ω'),
      el('th', { class: 'num', title: 'mass-spec datasets with a peptide, of 5' }, 'MS'))),
    el('tbody', {}, ...body)));
}

function download(name, text, type = 'text/tab-separated-values;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser a task to start the download before releasing its blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFileStem(name) {
  const stem = name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  return stem || '717atlas_gene_set';
}

function exportTSV(state) {
  const head = ['gene_id', 'haplotype', 'chr', 'synteny_class', 'phylostratum', 'tau',
                'peak_tissue', 'genomes_in_orthogroup', 'has_allele', 'in_tandem_array',
                'salicoid_wgd', 'gamma_wgd', 'omega_vs_ptrichocarpa', 'ms_datasets_detected_of_5',
                'ancestral_chromosome_exploratory', 'gamma_copy', 'salicoid_copy'];
  const lines = [head.join('\t')];
  for (const i of state.matches) {
    const r = state.rows[i];
    // named states rather than blanks: "not placed" and "no copy assigned" are results
    const copy = (d) => (r.aek < 0 ? '' : (d || 'not_assigned'));
    lines.push([state.ids[i], r.hap, r.chr ?? '', r.cls ?? '', r.ps ?? '',
      r.tau == null ? '' : r.tau.toFixed(3), r.top ?? '', r.npres ?? '',
      r.allele ? 'yes' : 'no', r.tandem ? 'yes' : 'no',
      r.wgd & 1 ? 'yes' : 'no', r.wgd & 2 ? 'yes' : 'no',
      // an empty cell would read as "not measured"; these are measured absences
      r.w >= 0 ? (r.w / 1000).toFixed(4) : (r.w === -1 ? 'no_ortholog' : 'not_estimable'),
      r.ms >= 0 ? r.ms : '',
      r.aek >= 0 ? `AEK${Math.floor(r.aek / 100)}` : 'not_placed',
      copy(Math.floor(r.aek / 10) % 10), copy(r.aek % 10)].join('\t'));
  }
  download(`717atlas_selection_${state.matches.length}genes.tsv`, lines.join('\n'));
}

/** Build a Browse URL with filters pre-applied, for an overview chart to link to.
 *  Exported so a module can say "these genes" without knowing how Browse stores state. */
export function browseHref(params) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  return '#/browse' + (qs ? '?' + qs : '');
}

export async function browseView(navigation) {
  // State belongs to one rendered Browse view. A module-level singleton made a stale URL
  // retain filters from a previous visit and let overlapping loads rewrite each other's state.
  const state = { values: {}, page: 0, rows: null, ids: null, matches: [] };
  const root = el('div', {},
    el('h1', {}, 'Browse'),
    el('p', { class: 'sub' },
      'Filter all 63,960 genes across every module at once, then export the selection or keep '
      + 'it as a named set. Filtering runs entirely in the browser over a 274 KB index.'),
    // The omega and MS columns are the two here that are easiest to over-read, so the caveat
    // sits next to the numbers rather than only in the provenance page.
    el('p', { class: 'muted', style: 'font-size:12px;margin:-6px 0 14px' },
      el('strong', {}, 'MS is indirect. '),
      'It counts public Populus mass-spec datasets with a peptide matching this gene, not '
      + 'observations of this gene\u2019s own protein: 94% of those peptides are also in the '
      + 'P. trichocarpa proteome and only 12% match exactly one 717 gene. Open a gene to see '
      + 'which kind of evidence it has. ',
      el('strong', {}, '\u03c9 is Nei\u2013Gojobori against P. trichocarpa'),
      ', blank where the gene has no reciprocal-best ortholog \u2014 a measured absence, not '
      + 'missing data.'));
  navigation?.track?.(root);

  const summary = el('div', { class: 'stat-row' });
  const tableHolder = el('div', {});
  const pager = el('div', { style: 'display:flex;gap:9px;align-items:center;margin-top:12px' });
  const setsHolder = el('div', {});
  const savedSetStatus = el('p', {
    class: 'muted', role: 'status', 'aria-live': 'polite',
    style: 'min-height:18px;margin:8px 0 0;font-size:12px',
  });

  const render = () => {
    if (navigation && !navigation.isCurrent()) return;
    drawChips();
    clear(summary).append(
      el('div', { class: 'stat' },
        el('div', { class: 'n' }, fmt(state.matches.length)),
        el('div', { class: 'l' }, `of ${fmt(state.rows.length)} genes match`)));
    clear(tableHolder).append(state.matches.length ? resultsTable(state)
      : el('p', { class: 'muted', style: 'padding:14px 0' }, 'No gene matches every filter.'));
    const pages = Math.ceil(state.matches.length / PAGE);
    clear(pager);
    if (pages > 1) {
      const btn = (label, to, on) => el('button', {
        onclick: () => { state.page = to; render(); },
        style: `font-size:12px;padding:4px 10px;border:1px solid var(--line-2);border-radius:5px;`
          + `background:var(--panel-2);color:var(--ink);cursor:${on ? 'pointer' : 'default'};`
          + `opacity:${on ? 1 : 0.4}`,
      }, label);
      pager.append(
        state.page > 0 ? btn('← Prev', state.page - 1, true) : btn('← Prev', state.page, false),
        el('span', { class: 'muted', style: 'font-size:12px' },
          `page ${state.page + 1} of ${fmt(pages)}`),
        state.page < pages - 1 ? btn('Next →', state.page + 1, true) : btn('Next →', state.page, false));
    }
  };

  const controls = el('div', {
    style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px',
  });
  const inputs = new Map();
  for (const f of FILTERS) {
    const onchange = (e) => {
      const v = e.target.value;
      if (v === '') delete state.values[f.id]; else state.values[f.id] = v;
      if (!applyFilters(state, navigation)) return;
      render();
    };
    const input = f.kind === 'select'
      ? el('select', { onchange, style: 'width:100%;padding:5px;border:1px solid var(--line-2);border-radius:5px;background:var(--surface);color:var(--ink);font-size:12.5px' },
          el('option', { value: '' }, 'any'),
          ...((f.id === 'top' ? [] : f.options) || [])
            .map((o) => el('option', { value: o }, String(o).replace(/_/g, ' '))))
      : el('input', { type: 'number', step: f.step || '1', placeholder: f.placeholder || '',
          oninput: onchange,
          style: 'width:100%;padding:5px;border:1px solid var(--line-2);border-radius:5px;background:var(--surface);color:var(--ink);font-size:12.5px' });
    inputs.set(f.id, input);
    controls.append(el('label', { style: 'display:block;font-size:11.5px;color:var(--ink-2)' },
      f.label, el('div', { style: 'margin-top:3px' }, input)));
  }



  /** Active filters as removable chips. Without these, what is being filtered lives only in
   *  a grid of 15 inputs and a reader arriving from a chart link (or a pasted URL) cannot see
   *  why the count is 902 instead of 63,960. Removing a chip has to clear the widget too, not
   *  just the state, or the two disagree. */
  const chipRow = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0' });
  const drawChips = () => {
    clear(chipRow);
    const active = FILTERS.filter((f) => state.values[f.id] !== undefined
      && state.values[f.id] !== '' && state.values[f.id] !== null);
    if (!active.length) return;
    for (const f of active) {
      const chip = el('button', {
        class: 'locus-btn', type: 'button',
        style: 'padding:0 9px;font-size:11.5px;height:26px',
        title: 'Remove this filter',
        onclick: () => {
          delete state.values[f.id];
          const w = inputs.get(f.id);
          if (w) w.value = '';
          if (!applyFilters(state, navigation)) return;
          render();
        },
      }, `${f.label} ${String(state.values[f.id]).replace(/_/g, ' ')}  \u00d7`);
      chipRow.append(chip);
    }
    chipRow.append(el('button', {
      class: 'locus-btn', type: 'button',
      style: 'padding:0 9px;font-size:11.5px;height:26px',
      onclick: () => {
        for (const f of FILTERS) {
          delete state.values[f.id];
          const w = inputs.get(f.id);
          if (w) w.value = '';
        }
        if (!applyFilters(state, navigation)) return;
        render();
      },
    }, `Clear all ${active.length}`));
  };

  // Filled after facets load; saved filters are accepted only if this release still exposes
  // their select value. That lets a JSON export survive a release vocabulary change without
  // inventing a query the current data cannot answer.
  let options = new Map();
  const setSavedSetStatus = (message) => clear(savedSetStatus).append(message);
  const savedFilterMeta = (set) => {
    const filters = set.meta && typeof set.meta.filters === 'object' && !Array.isArray(set.meta.filters)
      ? set.meta.filters : null;
    const details = [];
    if (typeof set.meta?.data_version === 'string' && set.meta.data_version) {
      details.push(`data ${set.meta.data_version}`);
    }
    if (filters) {
      const count = Object.keys(filters).length;
      details.push(`${count} saved filter${count === 1 ? '' : 's'}`);
    }
    return { filters, detail: details.join(' · ') };
  };

  const restoreFilters = (set) => {
    const { filters } = savedFilterMeta(set);
    if (!filters) {
      setSavedSetStatus(`“${set.name}” has gene IDs but no saved filters.`);
      return;
    }
    const restored = {};
    for (const filter of FILTERS) {
      const value = filters[filter.id];
      if (value == null || value === '') continue;
      if (filter.kind === 'select') {
        const option = String(value);
        if (options.get(filter.id)?.includes(option)) restored[filter.id] = option;
      } else if ((typeof value === 'string' || typeof value === 'number')
          && Number.isFinite(Number(value))) {
        restored[filter.id] = String(value);
      }
    }
    state.values = restored;
    for (const filter of FILTERS) {
      const input = inputs.get(filter.id);
      if (input) input.value = restored[filter.id] || '';
    }
    if (!applyFilters(state, navigation)) return;
    render();
    const count = Object.keys(restored).length;
    setSavedSetStatus(`Restored ${count} filter${count === 1 ? '' : 's'} from “${set.name}”.`);
  };

  const renderSets = () => {
    clear(setsHolder);
    const sets = allSets();
    const persistence = storageStatus();
    setsHolder.append(el('p', { class: 'muted', style: 'margin:0 0 8px;font-size:12.5px' },
      persistence.persistent
        ? 'Saved sets persist in this browser. Download JSON to move them or keep a copy.'
        : persistence.message));
    if (!sets.length) {
      setsHolder.append(el('p', { class: 'muted', style: 'margin:0;font-size:12.5px' },
        'No saved sets yet. Save a filtered selection, or import a versioned JSON export.'));
      return;
    }
    const rows = sets.map((set) => {
      const meta = savedFilterMeta(set);
      return el('tr', {},
        el('td', {},
          el('div', {}, set.name),
          meta.detail ? el('div', { class: 'muted', style: 'font-size:11.5px' }, meta.detail) : null),
        el('td', { class: 'num' }, fmt(set.ids.length)),
        el('td', { style: 'white-space:nowrap' },
          el('button', {
            type: 'button',
            onclick: () => download(`${safeFileStem(set.name)}.tsv`, ['gene_id', ...set.ids].join('\n')),
            style: 'font-size:11.5px;padding:3px 7px;margin-right:5px',
            'aria-label': `Export ${set.name} as TSV`,
          }, 'TSV'),
          meta.filters ? el('button', {
            type: 'button', onclick: () => restoreFilters(set),
            style: 'font-size:11.5px;padding:3px 7px;margin-right:5px',
            'aria-label': `Restore filters from ${set.name}`,
          }, 'Filters') : null,
          el('button', {
            type: 'button',
            onclick: () => {
              removeSet(set.name);
              renderSets();
              setSavedSetStatus(`Removed “${set.name}”.`);
            },
            style: 'font-size:11.5px;padding:3px 7px',
            'aria-label': `Remove ${set.name}`,
          }, 'Remove')));
    });
    setsHolder.append(
      el('div', { class: 'scroll-x' },
        el('table', { class: 'data' },
          el('thead', {}, el('tr', {},
            el('th', { scope: 'col' }, 'Set'),
            el('th', { scope: 'col', class: 'num' }, 'Genes'),
            el('th', { scope: 'col' }, 'Actions'))),
          el('tbody', {}, ...rows))));
  };

  // Keep an open Browse view current when another atlas tab imports, saves, or removes a set.
  // onDispose prevents a detached route from keeping a live store listener.
  const unsubscribeSets = subscribe(() => {
    if (!navigation || navigation.isCurrent()) renderSets();
  });
  onDispose(root, unsubscribeSets);

  const actions = el('div', { style: 'display:flex;gap:9px;flex-wrap:wrap;margin-top:14px' },
    el('button', {
      type: 'button',
      onclick: () => exportTSV(state),
      style: 'font-size:12.5px;padding:6px 12px;border:1px solid var(--accent);border-radius:5px;background:var(--accent);color:#fff;cursor:pointer',
    }, 'Export TSV'),
    el('button', {
      type: 'button',
      onclick: () => {
        try {
          const active = Object.entries(state.values).map(([k, v]) => `${k}=${v}`).join(' ');
          const name = active || 'all genes';
          const set = saveSet(name, state.matches.map((i) => state.ids[i]), {
            filters: { ...state.values }, data_version: dataVersion(), source: 'Browse',
          });
          renderSets();
          const persistence = storageStatus();
          setSavedSetStatus(`Saved “${set.name}” (${fmt(set.ids.length)} genes). ${persistence.message}`);
        } catch (error) {
          setSavedSetStatus(error?.message || 'Could not save this gene set.');
        }
      },
      style: 'font-size:12.5px;padding:6px 12px;border:1px solid var(--line-2);border-radius:5px;background:var(--panel-2);color:var(--ink);cursor:pointer',
    }, 'Save as set'),
    el('button', {
      type: 'button',
      onclick: () => {
        state.values = {};
        controls.querySelectorAll('select,input').forEach((n) => { n.value = ''; });
        if (!applyFilters(state, navigation)) return;
        render();
      },
      style: 'font-size:12.5px;padding:6px 12px;border:1px solid var(--line-2);border-radius:5px;background:transparent;color:var(--ink-2);cursor:pointer',
    }, 'Reset'));

  const importInput = el('input', {
    id: 'saved-sets-import', type: 'file', accept: 'application/json,.json', tabindex: '-1',
    'aria-hidden': 'true',
    style: 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap',
    onchange: async (event) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > MAX_GENESET_IMPORT_BYTES) {
          throw new Error(`This file is larger than the ${MAX_GENESET_IMPORT_BYTES.toLocaleString('en-US')}-byte saved-set import limit.`);
        }
        const text = await file.text();
        if (navigation && !navigation.isCurrent()) return;
        const report = importSets(JSON.parse(text));
        renderSets();
        const replacement = report.replaced ? ` Updated ${report.replaced} matching name${report.replaced === 1 ? '' : 's'}.` : '';
        setSavedSetStatus(`Imported ${report.imported} saved set${report.imported === 1 ? '' : 's'}.${replacement} ${storageStatus().message}`);
      } catch (error) {
        if (!navigation || navigation.isCurrent()) {
          setSavedSetStatus(error?.message || 'Could not import saved sets from that file.');
        }
      } finally {
        input.value = '';
      }
    },
  });
  const savedSetActions = el('div', {
    style: 'display:flex;gap:9px;flex-wrap:wrap;margin:10px 0 0', 'aria-label': 'Saved set import and export',
  },
  el('button', {
    type: 'button',
    onclick: () => {
      download('717atlas_saved_sets.json', `${JSON.stringify(exportSets({ data_version: dataVersion() }), null, 2)}\n`,
        'application/json;charset=utf-8');
      setSavedSetStatus(`Downloaded ${allSets().length} saved set${allSets().length === 1 ? '' : 's'} as JSON.`);
    },
    style: 'font-size:12.5px;padding:6px 12px;border:1px solid var(--line-2);border-radius:5px;background:var(--panel-2);color:var(--ink);cursor:pointer',
  }, 'Export sets JSON'),
  el('button', {
    type: 'button', onclick: () => importInput.click(),
    style: 'font-size:12.5px;padding:6px 12px;border:1px solid var(--line-2);border-radius:5px;background:var(--panel-2);color:var(--ink);cursor:pointer',
  }, 'Import sets JSON'),
  importInput);

  root.append(
    el('div', { class: 'card' }, el('h2', {}, 'Filters'), controls, chipRow, actions),
    summary,
    el('div', { class: 'card' }, tableHolder, pager),
    el('div', { class: 'card' }, el('h2', {}, 'Saved sets'),
      el('p', { class: 'muted', style: 'margin:0;font-size:12.5px' },
        'Each saved set keeps its gene IDs, filters, and atlas data version. JSON is portable between browsers.'),
      savedSetActions, savedSetStatus, setsHolder));

  const [facets, ids] = await Promise.all([loadFacets(), loadGeneIndex()]);
  if (navigation && !navigation.isCurrent()) return root;
  state.rows = facets.rows.map((_, i) => facetRow(facets, i));
  state.ids = ids;

  // Build every select from its declared options after the facet vocabulary arrives. Peak
  // tissue deliberately comes from the release index, which includes leaf_young and leaf_old.
  options = new Map(FILTERS.filter((f) => f.kind === 'select')
    .map((f) => [f.id, filterOptions(f, facets)]));
  for (const filter of FILTERS.filter((f) => f.kind === 'select')) {
    const input = inputs.get(filter.id);
    clear(input).append(
      el('option', { value: '' }, 'any'),
      ...options.get(filter.id).map((value) =>
        el('option', { value }, String(value).replace(/_/g, ' '))));
  }

  // The URL is the whole truth about the filter set. Values are seeded only after widgets
  // and dynamic options exist, so a deep link both filters the data and visibly selects it.
  state.values = valuesFromQuery(options);
  state.page = 0;
  for (const [id, value] of Object.entries(state.values)) {
    const input = inputs.get(id);
    if (input) input.value = value;
  }
  if (!applyFilters(state, navigation)) return root;
  render();
  renderSets();
  return root;
}
