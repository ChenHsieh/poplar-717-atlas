// Search results / refinement page. #/search/<query>
//
// WHY THIS EXISTS: the header dropdown can show an id and one line of description --
// enough to recognise a gene you already know, not enough to pick the right one out of
// many candidates (searching "MYB" or "dehydrin" returns dozens of paralogs that all
// share the description). This page shows the columns that actually distinguish
// paralogs -- synteny class, duplication class, chromosome, phylostratum, peak tissue --
// side by side, paginated, so choosing among many hits is a comparison, not a guess.
//
// Every column comes from the small indexes Browse already uses: loadFacets()/facetRow() for
// the classes and numbers, desc.json for the description (the same text, so Browse and this
// page cannot disagree), and the facet `dupt` column for the duplication class. This page used
// to fetch each row's whole gene shard for the description and the duplication letters: one
// page of 40 rows touched ~30 shards, 4.7 MB on the wire and 23 MB of JSON to parse, against
// ~1 MB for any other page. Those indexes are cached after the first search, so paging and the
// next query cost nothing. A facet index cached from before `dupt` existed (a reader holding a
// stale facets.json for a few minutes after a deploy) falls back to the per-row shard fetch.
import { el, clear, fmt } from './dom.js';
import { loadFacets, facetRow, loadGeneIndex, loadDescIndex, getGene, searchGenesRanked } from './data.js';
import { dupTypeLabel } from '../modules/duplication.js';

const PAGE = 40;

function rowsTable(page, byId, ann) {
  const body = page.map((id) => {
    const r = byId.get(id);
    const a = ann.get(id) || {};
    return el('tr', {},
      el('td', {}, el('a', { href: `#/gene/${id}`, class: 'mono' }, id)),
      el('td', { class: 'bz-desc', title: a.d || '' },
        a.d ? a.d.toLowerCase() : el('span', { class: 'muted' }, '–')),
      el('td', {}, r ? r.hap.toUpperCase() : '–'),
      el('td', {}, r ? (r.cls ? r.cls.replace(/_/g, ' ') : '–') : '–'),
      el('td', {}, a.dup || '–'),
      el('td', {}, r ? (r.chr || '–') : '–'),
      el('td', { class: 'num' }, r && r.ps != null ? 'PS' + r.ps : '–'),
      el('td', {}, r ? (r.top || '–') : '–'),
      el('td', { class: 'num' }, r && r.tau != null ? r.tau.toFixed(2) : '–'));
  });
  return el('div', { class: 'scroll-x' }, el('table', { class: 'data compare' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Gene'), el('th', {}, 'Description'), el('th', {}, 'Hap'),
      el('th', {}, 'Synteny class'), el('th', {}, 'Duplication'), el('th', {}, 'Chr'),
      el('th', { class: 'num' }, 'PS'), el('th', {}, 'Peak tissue'), el('th', { class: 'num' }, 'τ'))),
    el('tbody', {}, ...body)));
}

export async function searchResultsView(query) {
  const sub = el('p', { class: 'sub' },
    `Comparing matches for `, el('span', { class: 'mono' }, `"${query}"`), '…');
  const root = el('div', {}, el('h1', {}, 'Search results'), sub);

  const statRow = el('div', { class: 'stat-row' });
  const tableHolder = el('div', {});
  const pager = el('div', { style: 'display:flex;gap:9px;align-items:center;margin-top:12px' });
  const card = el('div', { class: 'card' }, tableHolder, pager);
  root.append(statRow, card);

  const [{ ids: matches, total }, facets, geneIndex, desc] = await Promise.all([
    searchGenesRanked(query), loadFacets(), loadGeneIndex(),
    loadDescIndex().catch(() => null),        // the column falls back to the shards
  ]);

  const rowOf = new Map();
  const posOf = new Map(geneIndex.map((id, i) => [id, i]));
  for (const id of matches) {
    const i = posOf.get(id);
    if (i != null) rowOf.set(id, facetRow(facets, i));
  }
  const descOk = Array.isArray(desc) && desc.length === geneIndex.length;
  const dc = facets.cols.indexOf('dupt');
  const tc = facets.cols.indexOf('tandem');
  // The same reader label the gene page shows (dupTypeLabel), rebuilt from the letters:
  // S salicoid, A gamma, D dispersed, C none detected; tandem is the curated set (facet
  // `tandem`, the record's dup.td). Checked equal to the record's own label on all 63,960 genes.
  const dupOf = (i) => {
    if (dc < 0) return undefined;
    const t = (facets.vocab.dupt || [])[facets.rows[i][dc]];
    if (!t) return null;
    return dupTypeLabel({ t, s: t.includes('S'), a: t.includes('A'), d: t.includes('D'),
                          td: !!facets.rows[i][tc] });
  };

  sub.replaceChildren(`Comparing matches for `, el('span', { class: 'mono' }, `"${query}"`), '.');
  clear(statRow).append(
    el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(total)),
      el('div', { class: 'l' }, total === 1 ? 'match' : 'matches')));

  let page = 0;
  const pages = Math.max(1, Math.ceil(matches.length / PAGE));

  async function render() {
    const slice = matches.slice(page * PAGE, page * PAGE + PAGE);
    const ann = new Map();
    const need = [];
    for (const id of slice) {
      const i = posOf.get(id);
      const dup = i == null ? undefined : dupOf(i);
      if (i == null || !descOk || dup === undefined) { need.push(id); continue; }
      ann.set(id, { d: desc[i], dup });
    }
    // Fallback only (stale or missing index): the page's own shards, bounded to PAGE.
    await Promise.all(need.map(async (id) => {
      const g = await getGene(id);
      if (!g) return;
      const a = g.ann || {};
      ann.set(id, { d: a.d || (a.atd ? `similar to ${a.at || 'Arabidopsis'}: ${a.atd}` : ''),
                    dup: dupTypeLabel(g.dup) });
    }));
    clear(tableHolder).append(matches.length
      ? rowsTable(slice, rowOf, ann)
      : el('p', { class: 'muted', style: 'padding:14px 0' },
          `No gene matches "${query}". Try a shorter or more general term.`));

    clear(pager);
    if (pages > 1) {
      const btn = (label, to, on) => el('button', {
        onclick: () => { page = to; render(); },
        style: `font-size:12px;padding:4px 10px;border:1px solid var(--line-2);border-radius:5px;`
          + `background:var(--panel-2);color:var(--ink);cursor:${on ? 'pointer' : 'default'};`
          + `opacity:${on ? 1 : 0.4}`,
      }, label);
      pager.append(
        page > 0 ? btn('← Prev', page - 1, true) : btn('← Prev', page, false),
        el('span', { class: 'muted', style: 'font-size:12px' }, `page ${page + 1} of ${fmt(pages)}`),
        page < pages - 1 ? btn('Next →', page + 1, true) : btn('Next →', page, false));
    }
  }
  await render();
  return root;
}
