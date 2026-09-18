import { el, clear, fmt } from './core/dom.js';
import { getGene, loadManifest, hapLabel, loadExprStudies,
         loadExprSamples, searchGenesRanked } from './core/data.js';
import { MODULES, byId } from './core/registry.js';
import { route, start, navigate } from './core/router.js';
import { browseView } from './core/browse.js';
import { searchResultsView } from './core/search.js';
import { renderMap } from './modules/genomemap.js';

const view = () => document.getElementById('view');
const setView = (node) => { const v = clear(view()); v.append(node); window.scrollTo(0, 0); };
const loading = (msg = 'Loading…') => setView(el('div', { class: 'empty' }, msg));

/* ---------- search: dropdown preview, with a hand-off to a full results page when a
   query is too broad to disambiguate from 24 rows of "id + one-line description" ---------- */
const DROPDOWN_SHOWN = 24;

function initSearch() {
  const input = document.getElementById('q');
  const hits = document.getElementById('hits');
  let seq = 0;
  let lastQuery = '';
  let lastTotal = 0;

  const close = () => { hits.style.display = 'none'; clear(hits); };
  input.addEventListener('blur', () => setTimeout(close, 150));

  const goToResults = () => { close(); navigate(`/search/${encodeURIComponent(lastQuery)}`); };

  input.addEventListener('input', async () => {
    const q = input.value.trim();
    const mine = ++seq;
    if (q.length < 3) return close();

    const { ids, total } = await searchGenesRanked(q);
    if (mine !== seq) return;
    lastQuery = q; lastTotal = total;
    const shown = ids.slice(0, DROPDOWN_SHOWN);

    clear(hits);
    if (!shown.length) {
      hits.append(el('a', { class: 'muted' }, `Nothing matches "${q}"`));
    } else {
      for (const id of shown) {
        const g = await getGene(id);
        const note = g && g.ann && (g.ann.d || g.ann.atd);
        hits.append(el('a', { href: '#/gene/' + id, onclick: close },
          el('span', {}, id),
          note ? el('span', { class: 'muted', style: 'font-family:inherit' }, `  ${note.slice(0, 54)}`) : null));
      }
      // "too many results" hand-off: a dropdown row can show an id and one line of
      // description, which is not enough to tell two paralogs apart. The results page
      // carries synteny class, duplication class, PS and peak tissue side by side instead.
      if (total > shown.length) {
        hits.append(el('a', {
          href: `#/search/${encodeURIComponent(q)}`, onclick: goToResults,
          style: 'font-weight:600;color:var(--accent);border-top:1px solid var(--line)',
        }, `${fmt(total)} results for "${q}" — compare them all →`));
      }
    }
    hits.style.display = 'block';
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      // Ambiguous queries go to the comparison page rather than blindly opening the top
      // hit, which for a common word like "kinase" would land on an arbitrary gene.
      if (lastTotal > DROPDOWN_SHOWN) return goToResults();
      const a = hits.querySelector('a[href^="#/gene/"]');
      if (a) { close(); navigate(a.getAttribute('href').slice(1)); }
    }
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
  const e = man.expression || {};
  const a = man.annotation || {};
  const ps = man.phylostrat || {};
  const lsg = Object.entries(s.ps_rank || {})
    .filter(([k]) => +k >= 18).reduce((acc, [, v]) => acc + v, 0);

  // What each module ANSWERS, in a reader's terms -- not its filter count.
  const MODULE_BLURB = {
    annotation: 'What the gene is: description, Arabidopsis hit, Pfam, GO, and its allele in the other haplotype.',
    synteny: 'Whether it has orthologs, in how many of 12 genomes, and how that changed when the panel was completed.',
    phylostrat: 'How old it is — which phylostratum, and whether genEra was confident about it.',
    duplication: 'What it duplicated from: paralog pairs with divergence, and tandem-array membership.',
    expression: `Where it is expressed, across ${fmt(e.n_samples)} samples from ${e.n_studies} curated studies.`,
    about: 'Provenance, known limitations, and how to cite this.',
  };

  setView(el('div', {},
    el('h1', {}, 'Hybrid poplar 717 gene atlas'),
    el('p', { class: 'sub' },
      `${fmt(man.n_genes)} gene models across the two phased haplotypes of `,
      el('em', {}, 'Populus tremula'), ' × ', el('em', {}, 'P. alba'),
      ` clone INRA 717-1B4, v5.1. Every gene carries synteny across a 12-genome panel, a `
      + `phylostratum, functional annotation, its allele, and an expression profile.`),

    el('div', { class: 'stat-row' },
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(man.n_genes)), el('div', { class: 'l' }, 'gene models')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(a.n_allele)), el('div', { class: 'l' }, 'HAP1↔HAP2 allele pairs')),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(e.n_samples)), el('div', { class: 'l' }, `RNA-seq samples, ${e.n_studies} studies`)),
      el('div', { class: 'stat' }, el('div', { class: 'n' }, fmt(lsg)), el('div', { class: 'l' }, 'lineage-specific candidates (PS ≥ 18)')),
    ),

    el('div', { class: 'card' },
      el('h2', {}, 'Start here'),
      el('div', { class: 'kv' },
        el('dt', {}, el('a', { href: '#/browse' }, 'Browse all genes')),
        el('dd', { class: 'muted' }, 'Filter across every module at once, then export or save the selection.'),
        el('dt', {}, 'Search'),
        el('dd', { class: 'muted' }, 'The box above takes a gene ID, a keyword, an Arabidopsis locus or a Pfam accession.'),
        el('dt', {}, el('a', { href: '#/gene/PtXaTreH.05G120200' }, 'PtXaTreH.05G120200')),
        el('dd', { class: 'muted' }, 'An example gene page — PS18 Populus, drought-responsive in bark.'))),

    el('div', { class: 'card' },
      el('h2', {}, 'Modules'),
      el('div', { class: 'kv' }, ...MODULES.flatMap((m) => [
        el('dt', {}, m.overview
          ? el('a', { href: `#/module/${m.id}` }, m.label)
          : el('span', {}, m.label)),
        el('dd', { class: 'muted' }, MODULE_BLURB[m.id] || '')])),
      el('p', { class: 'muted', style: 'margin:12px 0 0;font-size:12px' },
        'Allele-specific expression and cross-species comparison are queued — see TODO.md.')),

    el('div', { class: 'card' },
      el('h2', {}, 'Before you cite anything'),
      el('p', { style: 'margin:0;font-size:13.5px;color:var(--ink-2)' },
        'Private-gene calls depend on which genomes are in the panel, HAP2 domain annotation is '
        + 'thinner than HAP1 for release reasons, and expression is raw TPM. The ',
        el('a', { href: '#/module/about' }, 'provenance page'),
        ' states each limitation with its numbers.')),
  ));
  markNav();
});

route(/^\/gene\/(.+)$/, async (id) => {
  loading(`Loading ${id}…`);
  const [g, man] = await Promise.all([getGene(id), loadManifest()]);
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
        el('dt', {}, 'Span'), el('dd', {}, `${kb} kb`),
        ...(g.gs ? [el('dt', {}, 'Structure'),
          el('dd', {}, g.gs.ex === 1 ? el('span', {}, el('strong', {}, 'single exon'),
              el('span', { class: 'muted' }, ' · intronless'))
            : el('span', {}, `${g.gs.ex} exons`,
                g.gs.in != null ? el('span', { class: 'muted' }, ` · ${g.gs.in} introns`) : null))] : []))));

  if (g.org) {
    cards.firstChild.append(el('div', { class: 'warn' },
      el('strong', {}, `Homologous to the ${g.org.o} genome. `),
      'Organelle-derived sequence in the nuclear assembly is a known source of false '
      + '"novel gene" calls. Treat any lineage-specific claim for this gene with care.'));
  }

  for (const m of MODULES) {
    if (!m.geneCard) continue;
    const c = m.geneCard(g, man);   // an element, or a fragment of several cards
    if (c) cards.append(c);
  }
  const ord = g.ord || {};
  setView(el('div', {},
    el('h1', { class: 'mono' }, g.id),
    el('p', { class: 'sub' }, `${hapLabel(g.hap)} · ${g.chr} · ${kb} kb`),
    (ord.p || ord.n) ? el('p', { style: 'margin:-10px 0 16px;font-size:12.5px' },
      ord.p ? el('a', { href: `#/gene/${ord.p}`, class: 'mono' }, '← ' + ord.p) : null,
      (ord.p && ord.n) ? el('span', { class: 'muted' }, '   neighbours on the chromosome   ') : null,
      ord.n ? el('a', { href: `#/gene/${ord.n}`, class: 'mono' }, ord.n + ' →') : null) : null,
    cards));
  markNav();
});

route(/^\/browse$/, async () => {
  loading('Loading the gene index…');
  setView(await browseView());
  markNav();
});

route(/^\/map(?:\/(hap[12]))?(?:\/(\w+))?$/, async (hapArg, chrArg) => {
  const hap = hapArg || 'hap1';
  loading('Loading the genome map…');
  const hapBtn = (h, label) => el('button', {
    class: 'locus-btn', type: 'button',
    style: h === hap ? 'background:var(--accent);color:#fff' : '',
    onclick: () => { location.hash = chrArg ? `#/map/${h}/${chrArg}` : `#/map/${h}`; },
  }, label);
  const body = await renderMap(hap, chrArg || null);
  setView(el('div', {},
    el('h1', {}, 'Genome map'),
    el('p', { class: 'sub' }, 'Semantic zoom from all 19 chromosomes to one gene\'s neighbourhood.'),
    el('div', { style: 'display:flex;gap:8px;margin:10px 0 14px' },
      hapBtn('hap1', 'HAP1 (TreH)'), hapBtn('hap2', 'HAP2 (AlbH)')),
    body));
  markNav();
});

route(/^\/search\/(.+)$/, async (q) => {
  loading('Searching…');
  setView(await searchResultsView(decodeURIComponent(q)));
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

  // samples.json carries tissue / treatment / genotype / growth / reads / % aligned / notes
  // per sample; the page used to show only the label, which threw all of it away.
  const all = await loadExprSamples();
  const mine = all.filter((x) => x.study === id).sort((a, b) => a.label.localeCompare(b.label));
  const anyNotes = mine.some((x) => x.notes);
  const cell = (v) => (v == null || v === '' ? el('span', { class: 'muted' }, '—') : v);
  const sampleCard = el('div', { class: 'card' },
    el('h2', {}, `Samples (${mine.length})`),
    el('div', { class: 'scroll-x' }, el('table', { class: 'data' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Sample'), el('th', {}, 'Tissue'), el('th', {}, 'Treatment'),
        el('th', {}, 'Genotype'), el('th', {}, 'Growth'), el('th', {}, 'Role'),
        el('th', {}, 'Layout'), el('th', { class: 'num' }, 'Reads'),
        el('th', { class: 'num' }, 'Aligned %'),
        anyNotes ? el('th', {}, 'Notes') : null)),
      el('tbody', {}, ...mine.map((x) => el('tr', {},
        el('td', { class: 'mono', style: 'font-size:11.5px' }, x.label),
        el('td', {}, cell(x.tissue_analysis || x.tissue_full || x.tissue)),
        el('td', {}, cell(x.treatment)),
        el('td', {}, cell(x.genotype)),
        el('td', {}, cell(x.growth)),
        el('td', {}, x.ctrl === 'control'
          ? el('span', { class: 'badge', style: 'font-size:11px' }, 'control')
          : el('span', { class: 'muted' }, 'perturbation')),
        el('td', { class: 'muted', style: 'font-size:11.5px' }, x.layout || '—'),
        el('td', { class: 'num' }, x.reads == null ? '—' : (x.reads / 1e6).toFixed(1) + 'M'),
        el('td', { class: 'num' }, x.pct_aligned == null ? '—' : x.pct_aligned.toFixed(1)),
        anyNotes ? el('td', { class: 'muted', style: 'font-size:11px;max-width:230px' },
          cell(x.notes)) : null))))),
    el('p', { class: 'muted', style: 'margin:11px 0 0;font-size:12px' },
      `${mine.filter((x) => x.ctrl === 'control').length} control, `
      + `${mine.filter((x) => x.ctrl === 'perturbation').length} perturbation. `
      + 'Only WT controls contribute to the tissue baselines shown on gene pages.'));

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
    sampleCard,
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
    // A cached script against fresh data is the dangerous combination: every column this code
    // reads by name still resolves, just to the wrong thing, so the page renders a confident
    // number instead of failing. GitHub Pages caps caching at 10 minutes and offers no way to
    // purge, so the only honest move is to say so rather than to let it pass silently.
    const built = (document.querySelector('meta[name="atlas-build-version"]') || {}).content;
    if (built && man.data_version && built !== man.data_version) {
      const bar = el('div', {
        role: 'status',
        style: 'position:sticky;top:0;z-index:50;padding:9px 14px;font-size:13px;'
          + 'background:#8a5a00;color:#fff;display:flex;gap:12px;align-items:center;flex-wrap:wrap',
      },
        el('span', {}, `You are viewing a cached build (v${built}) of a site now serving `
          + `data v${man.data_version}. Numbers on this page may not match the current data.`),
        el('button', {
          onclick: () => location.reload(true),
          style: 'font:inherit;padding:3px 10px;border:1px solid #fff;border-radius:5px;'
            + 'background:transparent;color:#fff;cursor:pointer',
        }, 'Reload'));
      document.body.prepend(bar);
    }
  } catch { /* footer stamp is cosmetic; never block boot on it */ }
})();
