// Browse / query builder. The cross-module payoff: ask one question across synteny,
// phylostratigraphy, expression and annotation at once, then keep the answer as a gene set.
//
// Filtering runs over data/index/facets.json (274 KB gzipped, one fetch) rather than the gene
// shards -- a filter that had to read 39 MB of shards plus 208 MB of expression buckets would
// not be a filter anyone waits for.
import { el, clear, fmt } from './dom.js';
import { loadFacets, facetRow, loadGeneIndex } from './data.js';
import { saveSet, allSets, removeSet } from './geneset.js';

const PAGE = 100;

// Each filter is {id, label, kind, options?, test(row, value)}. Kept here rather than
// collected from the modules so that a filter's data source (the facet index) and its
// definition stay in one place -- the module `filters` arrays operate on full gene records
// and are for the gene page, not for this.
const FILTERS = [
  { id: 'hap', label: 'Haplotype', kind: 'select', options: ['hap1', 'hap2'],
    test: (r, v) => r.hap === v },
  { id: 'cls', label: 'Synteny class', kind: 'select',
    options: ['core_syntenic', 'dispensable_syntenic', 'non_syntenic_ortholog',
              'private_no_ortholog', 'tandem_array_member'],
    test: (r, v) => r.cls === v },
  { id: 'ps_min', label: 'Phylostratum ≥', kind: 'number', placeholder: '18',
    test: (r, v) => r.ps != null && r.ps >= +v },
  { id: 'tau_min', label: 'τ ≥', kind: 'number', placeholder: '0.8', step: '0.05',
    test: (r, v) => r.tau != null && r.tau >= +v },
  { id: 'top', label: 'Peak tissue', kind: 'select',
    options: ['leaf', 'xylem', 'bark', 'root', 'stem', 'bud', 'catkin', 'gall', 'callus'],
    test: (r, v) => r.top === v },
  { id: 'chr', label: 'Chromosome', kind: 'select',
    options: Array.from({ length: 19 }, (_, i) => 'Chr' + String(i + 1).padStart(2, '0')).concat('scaffolds'),
    test: (r, v) => r.chr === v },
  { id: 'allele', label: 'Has allele', kind: 'select', options: ['yes', 'no'],
    test: (r, v) => (r.allele ? 'yes' : 'no') === v },
  { id: 'at', label: 'Has Arabidopsis hit', kind: 'select', options: ['yes', 'no'],
    test: (r, v) => (r.at ? 'yes' : 'no') === v },
  { id: 'tandem', label: 'In tandem array', kind: 'select', options: ['yes', 'no'],
    test: (r, v) => (r.tandem ? 'yes' : 'no') === v },
  { id: 'changed', label: 'Reclassified vs old panel', kind: 'select', options: ['yes', 'no'],
    test: (r, v) => (r.changed ? 'yes' : 'no') === v },
];

const state = { values: {}, page: 0, rows: null, ids: null, matches: [] };

function applyFilters() {
  const active = FILTERS.filter((f) => state.values[f.id] !== undefined
    && state.values[f.id] !== '' && state.values[f.id] !== null);
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
}

function resultsTable() {
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
        : r.npres + '/12'));
  });
  return el('div', { class: 'scroll-x' }, el('table', { class: 'data' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Gene'), el('th', {}, 'Chr'),
      el('th', {}, 'Synteny class'), el('th', { class: 'num' }, 'PS'),
      el('th', { class: 'num' }, 'τ'), el('th', {}, 'Peak tissue'),
      el('th', { class: 'num' }, 'Genomes'))),
    el('tbody', {}, ...body)));
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/tab-separated-values' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportTSV() {
  const head = ['gene_id', 'haplotype', 'chr', 'synteny_class', 'phylostratum', 'tau',
                'peak_tissue', 'genomes_in_orthogroup', 'has_allele', 'in_tandem_array'];
  const lines = [head.join('\t')];
  for (const i of state.matches) {
    const r = state.rows[i];
    lines.push([state.ids[i], r.hap, r.chr ?? '', r.cls ?? '', r.ps ?? '',
      r.tau == null ? '' : r.tau.toFixed(3), r.top ?? '', r.npres ?? '',
      r.allele ? 'yes' : 'no', r.tandem ? 'yes' : 'no'].join('\t'));
  }
  download(`717atlas_selection_${state.matches.length}genes.tsv`, lines.join('\n'));
}

export async function browseView() {
  const root = el('div', {},
    el('h1', {}, 'Browse'),
    el('p', { class: 'sub' },
      'Filter all 63,960 genes across every module at once, then export the selection or keep '
      + 'it as a named set. Filtering runs entirely in the browser over a 274 KB index.'));

  const summary = el('div', { class: 'stat-row' });
  const tableHolder = el('div', {});
  const pager = el('div', { style: 'display:flex;gap:9px;align-items:center;margin-top:12px' });
  const setsHolder = el('div', {});

  const render = () => {
    clear(summary).append(
      el('div', { class: 'stat' },
        el('div', { class: 'n' }, fmt(state.matches.length)),
        el('div', { class: 'l' }, `of ${fmt(state.rows.length)} genes match`)));
    clear(tableHolder).append(state.matches.length ? resultsTable()
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
  for (const f of FILTERS) {
    const onchange = (e) => {
      const v = e.target.value;
      if (v === '') delete state.values[f.id]; else state.values[f.id] = v;
      applyFilters();
      render();
    };
    const input = f.kind === 'select'
      ? el('select', { onchange, style: 'width:100%;padding:5px;border:1px solid var(--line-2);border-radius:5px;background:var(--surface);color:var(--ink);font-size:12.5px' },
          el('option', { value: '' }, 'any'),
          ...f.options.map((o) => el('option', { value: o }, o.replace(/_/g, ' '))))
      : el('input', { type: 'number', step: f.step || '1', placeholder: f.placeholder || '',
          oninput: onchange,
          style: 'width:100%;padding:5px;border:1px solid var(--line-2);border-radius:5px;background:var(--surface);color:var(--ink);font-size:12.5px' });
    controls.append(el('label', { style: 'display:block;font-size:11.5px;color:var(--ink-2)' },
      f.label, el('div', { style: 'margin-top:3px' }, input)));
  }

  const renderSets = () => {
    clear(setsHolder);
    const sets = allSets();
    if (!sets.length) {
      setsHolder.append(el('p', { class: 'muted', style: 'margin:0;font-size:12.5px' },
        'No saved sets yet. Saved sets live for this browser session and can be exported.'));
      return;
    }
    setsHolder.append(el('table', { class: 'data' },
      el('tbody', {}, ...sets.map((s) => el('tr', {},
        el('td', {}, s.name),
        el('td', { class: 'num' }, fmt(s.ids.length)),
        el('td', {}, el('a', {
          href: '#', onclick: (e) => {
            e.preventDefault();
            download(`${s.name.replace(/\W+/g, '_')}.tsv`, ['gene_id', ...s.ids].join('\n'));
          },
        }, 'export')),
        el('td', {}, el('a', {
          href: '#', onclick: (e) => { e.preventDefault(); removeSet(s.name); renderSets(); },
        }, 'remove')))))));
  };

  const actions = el('div', { style: 'display:flex;gap:9px;flex-wrap:wrap;margin-top:14px' },
    el('button', {
      onclick: exportTSV,
      style: 'font-size:12.5px;padding:6px 12px;border:1px solid var(--accent);border-radius:5px;background:var(--accent);color:#fff;cursor:pointer',
    }, 'Export TSV'),
    el('button', {
      onclick: () => {
        const active = Object.entries(state.values).map(([k, v]) => `${k}=${v}`).join(' ');
        const name = active || 'all genes';
        saveSet(name, state.matches.map((i) => state.ids[i]), { filters: { ...state.values } });
        renderSets();
      },
      style: 'font-size:12.5px;padding:6px 12px;border:1px solid var(--line-2);border-radius:5px;background:var(--panel-2);color:var(--ink);cursor:pointer',
    }, 'Save as set'),
    el('button', {
      onclick: () => {
        state.values = {};
        controls.querySelectorAll('select,input').forEach((n) => { n.value = ''; });
        applyFilters();
        render();
      },
      style: 'font-size:12.5px;padding:6px 12px;border:1px solid var(--line-2);border-radius:5px;background:transparent;color:var(--ink-2);cursor:pointer',
    }, 'Reset'));

  root.append(
    el('div', { class: 'card' }, el('h2', {}, 'Filters'), controls, actions),
    summary,
    el('div', { class: 'card' }, tableHolder, pager),
    el('div', { class: 'card' }, el('h2', {}, 'Saved sets'), setsHolder));

  const [facets, ids] = await Promise.all([loadFacets(), loadGeneIndex()]);
  state.rows = facets.rows.map((_, i) => facetRow(facets, i));
  state.ids = ids;
  applyFilters();
  render();
  renderSets();
  return root;
}
