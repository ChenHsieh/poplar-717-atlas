import { el, clear, fmt } from './core/dom.js';
import { getGene, loadManifest, loadShard, shardOf, hapLabel, loadExprStudies,
         searchGenes } from './core/data.js';
import { MODULES, byId } from './core/registry.js';
import { route, start, navigate } from './core/router.js';

const view = () => document.getElementById('view');
const setView = (node) => { const v = clear(view()); v.append(node); window.scrollTo(0, 0); };
const loading = (msg = 'Loading…') => setView(el('div', { class: 'empty' }, msg));

/* ---------- search: no index file; the ID resolves its own shard ---------- */
function initSearch() {
  const input = document.getElementById('q');
  const hits = document.getElementById('hits');
  let seq = 0;

  const close = () => { hits.style.display = 'none'; clear(hits); };
  input.addEventListener('blur', () => setTimeout(close, 150));

  input.addEventListener('input', async () => {
    const q = input.value.trim();
    const mine = ++seq;
    if (q.length < 3) return close();

    // Two paths, merged: a gene ID resolves via the shard convention with no index at all;
    // anything else goes to the token index (descriptions, AT loci, Pfam/PANTHER).
    const byId = [];
    const probe = /G\d+$/.test(q) ? q : q + 'G000000';
    const s = shardOf(probe);
    if (s) {
      const man = await loadManifest();
      if (`${s.hap}/${s.key}` in man.shards) {
        const shard = await loadShard(s.hap, s.key);
        const up = q.toUpperCase();
        byId.push(...Object.keys(shard).filter((k) => k.toUpperCase().startsWith(up)).sort().slice(0, 12));
      }
    }
    const byText = await searchGenes(q, 24);
    if (mine !== seq) return;

    const seen = new Set();
    const merged = [...byId, ...byText].filter((id) => !seen.has(id) && seen.add(id)).slice(0, 24);

    clear(hits);
    if (!merged.length) {
      hits.append(el('a', { class: 'muted' }, `Nothing matches "${q}"`));
    } else {
      for (const id of merged) {
        const g = await getGene(id);
        const note = g && g.ann && (g.ann.d || g.ann.atd);
        hits.append(el('a', { href: '#/gene/' + id, onclick: close },
          el('span', {}, id),
          note ? el('span', { class: 'muted', style: 'font-family:inherit' }, `  ${note.slice(0, 54)}`) : null));
      }
    }
    hits.style.display = 'block';
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const a = hits.querySelector('a[href^="#/gene/"]'); if (a) { close(); navigate(a.getAttribute('href').slice(1)); } }
    if (e.key === 'Escape') close();
  });
}

function markNav() {
  const p = location.hash.slice(1) || '/';
  document.querySelectorAll('header.top nav a').forEach((a) => {
    const h = a.getAttribute('href').slice(1);
    a.classList.toggle('on', h === p || (h !== '/' && p.startsWith(h)));
  });
}
addEventListener('hashchange', markNav);

/* ---------- views ---------- */
route(/^\/$/, async () => {
  loading();
  const man = await loadManifest();
  const s = man.summary;
  const psRanks = Object.entries(s.ps_rank || {}).map(([k, v]) => [+k, v]).filter(([k]) => k >= 18);
  const lsg = psRanks.reduce((a, [, v]) => a + v, 0);
  setView(el('div', {},
    el('h1', {}, 'Hybrid poplar 717 gene atlas'),
    el('p', { class: 'sub' },
      `${fmt(man.n_genes)} genes across two haplotypes of Populus tremula × alba clone 717 (v5.1). `
      + `Built ${man.built.slice(0, 10)} · tier ${man.tier}.`),
    el('div', { class: 'stat-row' },
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(man.n_genes)), el('div', { class: 'l' }, 'genes')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(s.synteny_class?.private_no_ortholog)), el('div', { class: 'l' }, 'private, no ortholog')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(s.changed)), el('div', { class: 'l' }, 'reclassified vs old panel')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(lsg)), el('div', { class: 'l' }, 'LSG pool (PS ≥ 18)')),
    ),
    el('div', { class: 'card' },
      el('h2', {}, 'Modules'),
      el('div', { class: 'kv' }, ...MODULES.flatMap((m) => [
        el('dt', {}, el('a', { href: `#/module/${m.id}` }, m.label)),
        el('dd', { class: 'muted' }, `${(m.filters || []).length} filters · gene card`)])),
      el('p', { class: 'muted', style: 'margin:12px 0 0;font-size:12px' },
        'Phylostratigraphy, duplication and expression modules are queued — see TODO.md.'),
    ),
    el('div', { class: 'card' },
      el('h2', {}, 'Try a gene'),
      el('div', { class: 'kv' },
        el('dt', {}, el('a', { href: '#/gene/PtXaTreH.05G120200' }, 'PtXaTreH.05G120200')),
        el('dd', { class: 'muted' }, 'LSG4.5g — PS18 Populus, drought candidate'),
        el('dt', {}, el('a', { href: '#/gene/PtXaAlbH.14G133000' }, 'PtXaAlbH.14G133000')),
        el('dd', { class: 'muted' }, 'LSG1.14g — salicoid-WGD LEA ohnolog'),
        el('dt', {}, el('a', { href: '#/gene/PtXaTreH.10G125100' }, 'PtXaTreH.10G125100')),
        el('dd', { class: 'muted' }, 'LSG2.10g — PS1 conserved-gene comparator')),
    ),
  ));
  markNav();
});

route(/^\/gene\/(.+)$/, async (id) => {
  loading(`Loading ${id}…`);
  const g = await getGene(id);
  if (!g) return setView(el('div', { class: 'empty' },
    el('h2', {}, 'No such gene'), el('p', { class: 'mono' }, id),
    el('p', { class: 'muted' }, 'IDs look like PtXaTreH.05G120200 (HAP1) or PtXaAlbH.14G133000 (HAP2).')));

  const kb = ((g.end - g.start) / 1000).toFixed(2);
  const cards = el('div', { class: 'cards' },
    el('div', { class: 'card' },
      el('h2', {}, 'Location', el('span', { class: 'tag' }, 'v5.1')),
      el('dl', { class: 'kv' },
        el('dt', {}, 'Haplotype'), el('dd', {}, hapLabel(g.hap)),
        el('dt', {}, 'Position'), el('dd', { class: 'mono' }, `${g.chr}:${fmt(g.start)}–${fmt(g.end)}`),
        el('dt', {}, 'Strand'), el('dd', {}, g.strand
          ? el('span', {}, el('span', { class: 'mono' }, g.strand), ' ', el('span', { class: 'muted' }, g.strand === '+' ? 'forward' : 'reverse'))
          : el('span', { class: 'muted' }, 'unknown')),
        el('dt', {}, 'Span'), el('dd', {}, `${kb} kb`))));

  for (const m of MODULES) {
    if (!m.geneCard) continue;
    const c = m.geneCard(g);   // an element, or a fragment of several cards
    if (c) cards.append(c);
  }
  // Phylostratigraphy has no module file yet; surface the data the build already ships.
  if (g.ps) {
    cards.append(el('div', { class: 'card' },
      el('h2', {}, 'Phylostratigraphy', el('span', { class: 'tag' }, 'genEra')),
      el('dl', { class: 'kv' },
        el('dt', {}, 'Stratum'), el('dd', {}, g.ps.name || el('span', { class: 'muted' }, 'unplaced')),
        el('dt', {}, 'Rank'), el('dd', {}, g.ps.rank == null ? el('span', { class: 'muted' }, 'NA — genEra could not place this gene') : `PS${g.ps.rank} of 19`),
        el('dt', {}, 'Taxonomic representativeness'), el('dd', {}, g.ps.tr == null ? '—' : g.ps.tr + '%'),
        el('dt', {}, 'LSG pool'), el('dd', {}, g.ps.lsg ? el('strong', {}, 'yes (PS ≥ 18)') : el('span', { class: 'muted' }, 'no'))),
      el('p', { class: 'muted', style: 'margin:10px 0 0;font-size:12px' }, 'Full module queued — see TODO.md.')));
  }

  setView(el('div', {},
    el('h1', { class: 'mono' }, g.id),
    el('p', { class: 'sub' }, `${hapLabel(g.hap)} · ${g.chr} · ${kb} kb`),
    cards));
  markNav();
});

route(/^\/module\/(.+)$/, async (id) => {
  const m = byId(id);
  if (!m || !m.overview) return setView(el('div', { class: 'empty' }, el('h2', {}, 'No such module'), el('p', { class: 'mono' }, id)));
  loading();
  setView(await m.overview(await loadManifest()));
  markNav();
});

route(/^\/study\/(\d+)$/, async (idStr) => {
  loading();
  const id = +idStr;
  const studies = await loadExprStudies();
  const s = studies[id];
  if (!s) return setView(el('div', { class: 'empty' }, el('h2', {}, 'No such study'), el('p', {}, `study ${id}`)));

  const factorRow = (label, vals) => (vals && vals.length
    ? el('span', {}, el('strong', {}, label + ': '), vals.join(', '), '  ')
    : null);

  setView(el('div', {},
    el('h1', {}, `Study ${id}`),
    el('p', { class: 'sub' }, s.bioprojects.map((b) =>
      el('a', { href: `https://www.ebi.ac.uk/ena/browser/view/${b}`, target: '_blank', rel: 'noopener', class: 'mono' }, b)
    ).flatMap((a, i) => i ? [', ', a] : [a])),
    s.flags.includes('prefer_counts_over_tpm') && el('div', { class: 'warn' },
      'This study\'s single-end fragment length was not individually calibrated. Effective-length ',
      'inflation is measurable here — prefer est_counts over TPM/FPKM for this study.'),
    el('div', { class: 'card' },
      el('h2', {}, 'Design'),
      el('p', {}, factorRow('Tissue', s.tissues), factorRow('Panel', s.panel_type),
        factorRow('Genotype', s.genotypes), factorRow('Treatment', s.treatments),
        factorRow('Growth', s.growth_conditions), factorRow('Additional', s.additional_conditions)),
      s.citation && el('p', { class: 'muted', style: 'font-size:12.5px;margin-top:10px' }, s.citation),
      s.doi.length ? el('p', {}, ...s.doi.map((d) => el('a', { href: d, target: '_blank', rel: 'noopener' }, d))) : null),
    el('div', { class: 'card' },
      el('h2', {}, `Samples (${s.samples.length})`),
      el('div', { class: 'scroll-x' }, el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Sample label'))),
        el('tbody', {}, ...s.samples.map((label) => el('tr', {}, el('td', { class: 'mono' }, label))))))),
  ));
  markNav();
});

/* ---------- boot ---------- */
(async function boot() {
  const nav = document.querySelector('header.top nav');
  MODULES.filter((m) => m.overview)
    .forEach((m) => nav.append(el('a', { href: `#/module/${m.id}` }, m.label)));
  initSearch();
  start();
  markNav();
  // Stamp the data version into the footer so a reader can tell which build they are looking at.
  try {
    const man = await loadManifest();
    const f = document.querySelector('footer.bot');
    if (f && man.data_version) {
      f.append(el('div', { style: 'margin-top:5px' },
        `data v${man.data_version}`,
        man.data_released ? ` · ${man.data_released}` : '',
        ' · ', el('a', { href: '#/module/about' }, 'provenance')));
    }
  } catch { /* footer stamp is cosmetic; never block boot on it */ }
})();
