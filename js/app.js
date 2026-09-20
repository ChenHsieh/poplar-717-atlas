import { el, clear, fmt } from './core/dom.js';
import { getGene, loadManifest, hapLabel, loadExprStudies,
         loadExprSamples, searchGenesRanked, loadFacets, facetRow } from './core/data.js';
import { MODULES, byId, GENE_SECTIONS, geneSectionModules } from './core/registry.js';
import { dupTypeLabel } from './modules/duplication.js';
import { classBadge } from './modules/synteny.js';
import { route, start, navigate } from './core/router.js';
import { browseView, browseHref, FILTERS } from './core/browse.js';
import { QUESTIONS, countQuestion } from './core/questions.js';
import { searchResultsView } from './core/search.js';
import { renderMap } from './modules/genomemap.js';
import { pairView } from './modules/pair.js';
import { karyotypeView } from './modules/karyotype.js';
import { familyView } from './modules/family.js';
import { statusView } from './modules/status.js';

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
  // A grouped tab must show that the page you are on lives inside it; otherwise the header
  // says nothing is selected on five of the site's pages.
  document.querySelectorAll('header.top .navmenu').forEach((d) => {
    d.classList.toggle('on', [...d.querySelectorAll('a')].some((a) => a.classList.contains('on')));
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

    questionsCard(),

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

/** Questions the shipped layers can answer, each one a real Browse query.
 *
 *  Counts are filled in AFTER first paint, from the facet index, using Browse's own filter
 *  predicates. Two reasons this is not precomputed into the manifest: a baked aggregate goes
 *  stale the moment a patcher runs without its owning stage (TODO 25 -- and this very page
 *  shipped a withdrawn LSG count for two days that way), and computing it here makes the
 *  number and the page it links to the same calculation rather than two that can disagree.
 *
 *  Never blocks the home page: if the facet index is slow or fails, every question still
 *  links correctly and simply shows no count. */
function questionsCard() {
  const counts = QUESTIONS.map(() => el('span', { class: 'muted', style: 'font-size:12px' }, ''));
  const card = el('div', { class: 'card' },
    el('h2', {}, 'Start from a question', el('span', { class: 'tag' }, 'live counts')),
    el('div', { class: 'kv' }, ...QUESTIONS.flatMap((q, i) => [
      el('dt', {}, el('a', { href: browseHref(q.params) }, q.q)),
      el('dd', {}, el('span', { class: 'muted', style: 'font-size:12.5px' }, q.sub),
        ' ', counts[i])])),
    el('p', { class: 'muted', style: 'margin:12px 0 0;font-size:11.5px' },
      'Every cutoff is stated in the question, because "expressed" and "tissue-specific" are '
      + 'not absolute properties. Each link opens Browse with those filters already set, and '
      + 'the count beside it is computed with the same predicates that page uses.'));

  (async () => {
    try {
      const facets = await loadFacets();
      const rows = facets.rows.map((_, i) => facetRow(facets, i));
      QUESTIONS.forEach((q, i) => {
        const n = countQuestion(q, rows, FILTERS);
        if (n != null) counts[i].textContent = '· ' + fmt(n) + ' genes';
      });
    } catch { /* counts are a bonus; the links work regardless */ }
  })();
  return card;
}

/* ---------------------------------------------------------------------------------------
 *  The gene page got long. Fourteen or more cards now, and before this the running order was
 *  whatever order the modules were imported in -- so a predicted promoter motif could sit
 *  above the duplication class, and the expression summary landed near the bottom.
 *
 *  Two things fix that, and they are deliberately different:
 *    glanceCard()  answers "what am I looking at" in one card, so a reader who reads nothing
 *                  else still leaves with the duplication class, the syntelogs and the peak
 *                  tissue. It states only fields already on the record -- it computes nothing
 *                  new, so it cannot disagree with the card it summarises.
 *    sectionNav()  is built FROM THE CARDS THAT ACTUALLY RENDERED, not from a fixed list, so
 *                  a band that produced nothing for this gene never appears as a dead link.
 * ------------------------------------------------------------------------------------- */

function glanceCard(g) {
  const bits = [];

  const dt = dupTypeLabel(g.dup);
  if (dt) {
    bits.push(['Duplication', el('span', {}, dt,
      g.dup && g.dup.td ? el('span', { class: 'muted' }, ' · in a tandem array') : null)]);
  }

  // NOT a syntelog count. `syn.n` is how many of the 12 panel genomes the orthogroup spans,
  // which is what synteny.js calls it; the only literal list of syntelogs on the record is
  // aek.an[].sl, and that is shipped `exploratory`, so it stays in the card that carries its
  // caveat rather than being promoted to a summary strip.
  const s = g.syn;
  if (s && s.cls) {
    bits.push(['Synteny', el('span', {}, classBadge(s.cls),
      s.n != null ? el('span', { class: 'muted' }, `  orthogroup spans ${s.n} of 12 genomes`) : null,
      s.stable === false ? el('span', { class: 'badge', style: 'margin-left:6px' },
        '\u26a0 sensitivity-unstable') : null)]);
  }

  const x = g.x;
  if (x && x.top) {
    bits.push(['Expression', el('span', {},
      el('strong', {}, x.top), ` ${fmt(Math.round(x.t && x.t[x.top] != null ? x.t[x.top] : 0))} TPM`,
      x.tau != null ? el('span', { class: 'muted' }, ` · τ ${x.tau}`) : null)]);
  }
  if (g.resp && g.resp.v != null) {
    bits.push(['Responsiveness', el('span', {},
      el('span', { class: 'mono' }, g.resp.v.toFixed(3)),
      el('span', { class: 'muted' }, ` median |log2FC|${g.resp.n ? ` over ${g.resp.n} contrasts` : ''}`))]);
  }
  if (g.allele && g.allele.id) {
    bits.push(['Allele', el('span', {},
      el('a', { href: `#/gene/${g.allele.id}`, class: 'mono' }, g.allele.id),
      el('span', { class: 'muted' }, ' · '),
      el('a', { href: `#/pair/${g.id}` }, 'side by side'))]);
  }
  if (!bits.length) return null;

  return el('div', { class: 'card glance' },
    el('h2', {}, 'At a glance'),
    el('dl', { class: 'kv' }, ...bits.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
    el('p', { class: 'muted', style: 'margin:11px 0 0;font-size:11.5px' },
      'Every value here is repeated in full, with its caveats, in the card it came from. '
      + 'Nothing is computed for this strip.'));
}

/** Sticky in-page nav. `bands` is the list that actually produced cards. */
function sectionNav(bands) {
  if (bands.length < 2) return null;
  const links = bands.map((b) => el('a', { href: `#/gene/${b.gene}`, 'data-sec': b.id,
    class: 'secnav-link' }, b.label));
  const nav = el('nav', { class: 'secnav' }, ...links);

  // Anchor scrolling by hash would fight the hash router, so move the page directly.
  links.forEach((a, i) => a.addEventListener('click', (ev) => {
    ev.preventDefault();
    const h = document.getElementById('sec-' + bands[i].id);
    if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  // Mark the band the reader is currently inside: the LAST heading that has passed under the
  // sticky bars. Positions are read live on each frame rather than cached from an
  // IntersectionObserver entry -- an entry's boundingClientRect is a snapshot from when it
  // fired, so headings that did not change state keep reporting where they used to be, and
  // scrolling back to the top left the last band still marked.
  let queued = false;
  const spy = () => {
    queued = false;
    if (!nav.isConnected) {                       // view replaced by the router
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      return;
    }
    // Must sit BELOW where scroll-margin-top parks a heading (--top-h + 54px in app.css),
    // or jumping to a band marks the one before it: the heading lands at 107px while the
    // line was at 96px, so it never counted as reached. The slack is that difference plus
    // room for the nav wrapping to two rows on a narrow screen.
    const line = (parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--top-h')) || 47) + nav.offsetHeight + 36;
    let current = bands[0] && bands[0].id;
    bands.forEach((b) => {
      const h = document.getElementById('sec-' + b.id);
      if (h && h.getBoundingClientRect().top <= line) current = b.id;
    });
    const changed = links.some((a) => a.classList.contains('on') !== (a.dataset.sec === current));
    links.forEach((a) => a.classList.toggle('on', a.dataset.sec === current));

    // Below 640px the nav is one swipeable row, so the active chip can sit off-screen.
    // Bring it into the nav's own scroll box -- set scrollLeft rather than calling
    // scrollIntoView, which would also scroll the PAGE and fight the reader.
    if (changed && nav.scrollWidth > nav.clientWidth + 2) {
      const on = links.find((a) => a.classList.contains('on'));
      if (on) {
        const pad = 12;
        if (on.offsetLeft < nav.scrollLeft + pad) nav.scrollLeft = Math.max(0, on.offsetLeft - pad);
        else if (on.offsetLeft + on.offsetWidth > nav.scrollLeft + nav.clientWidth - pad)
          nav.scrollLeft = on.offsetLeft + on.offsetWidth - nav.clientWidth + pad;
      }
    }
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(spy); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  requestAnimationFrame(spy);
  return nav;
}

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

  // The Location card built above belongs to Identity, so that band opens already non-empty.
  const glance = glanceCard(g);
  const bands = [];
  for (const sec of GENE_SECTIONS) {
    const made = [];
    for (const m of geneSectionModules(sec)) {
      const c = m.geneCard(g, man);   // an element, or a fragment of several cards
      if (c) made.push(c);
    }
    const opensWithLocation = sec.id === 'identity';
    if (!made.length && !opensWithLocation) continue;   // no dead band, and no dead nav link

    const head = el('h2', { class: 'sect', id: 'sec-' + sec.id },
      el('span', { class: 'sect-label' }, sec.label),
      sec.blurb ? el('span', { class: 'sect-blurb' }, sec.blurb) : null);
    if (opensWithLocation) cards.prepend(head); else cards.append(head);
    made.forEach((c) => cards.append(c));
    bands.push({ id: sec.id, label: sec.label, gene: g.id });
  }

  // A card marked data-secondary duplicates something already drawn above and folds shut.
  // Done after appending because a module may return a fragment of several cards, and only
  // some of them carry the mark. The canvas inside starts at zero width while folded; the
  // locus module observes its CONTAINER with a ResizeObserver, so it paints on first open.
  cards.querySelectorAll('.card[data-secondary]').forEach((c) => {
    const why = c.getAttribute('data-secondary');
    const title = (c.querySelector('h2') || {}).textContent || 'More';
    const d = el('details', { class: 'card-fold' },
      el('summary', {}, el('span', { class: 'fold-title' }, title),
        why ? el('span', { class: 'fold-why' }, why) : null));
    c.replaceWith(d);
    c.querySelector('h2')?.remove();   // the summary is the heading now
    d.append(c);
  });

  const ord = g.ord || {};
  setView(el('div', {},
    el('h1', { class: 'mono' }, g.id),
    el('p', { class: 'sub' }, `${hapLabel(g.hap)} · ${g.chr} · ${kb} kb`),
    (ord.p || ord.n) ? el('p', { style: 'margin:-10px 0 16px;font-size:12.5px' },
      ord.p ? el('a', { href: `#/gene/${ord.p}`, class: 'mono' }, '← ' + ord.p) : null,
      (ord.p && ord.n) ? el('span', { class: 'muted' }, '   neighbours on the chromosome   ') : null,
      ord.n ? el('a', { href: `#/gene/${ord.n}`, class: 'mono' }, ord.n + ' →') : null) : null,
    glance,
    sectionNav(bands),
    cards));
  markNav();
});

// #/pair/<id> -- the allele pair as one page. Takes EITHER haplotype's id and always
// presents HAP1 on the left, so two readers arriving from opposite alleles see the same
// picture rather than mirror images of it.
route(/^\/pair\/(.+)$/, async (id) => {
  loading(`Loading the allele pair for ${id}\u2026`);
  setView(await pairView(id));
  markNav();
});

// #/karyotype -- the ancestral genome as a navigable surface. The grid is reduced in the
// browser from the `aek` facet column; precomputing it would create another aggregate a build
// stage owns and can leave stale, for a table that takes milliseconds to derive.
route(/^\/karyotype$/, async () => {
  loading('Reducing the ancestral karyotype\u2026');
  setView(await karyotypeView());
  markNav();
});

// #/family/<gene id> -- the whole descent group, entered from any member. Clicking a member
// recentres on it, so "steps from here" always means steps from the gene you are looking at.
route(/^\/family\/(.+)$/, async (id) => {
  loading(`Walking the descent group of ${id}\u2026`);
  setView(await familyView(id));
  markNav();
});

// #/status -- the gates this build passed, as a boot log. The verdicts are published by
// validate_data.py as each gate executes; nothing here is written after the fact.
route(/^\/status$/, async () => {
  loading('Reading the gate record\u2026');
  setView(await statusView());
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
  // The header carried ten flat tabs in MODULES order -- an accident of the import list, not
  // a choice, and on a phone it wrapped to three rows (170px of sticky chrome before any
  // content). It is now two kinds of thing:
  //
  //   always visible   ways IN to the data      Home / Browse / Map / Karyotype
  //   grouped          per-topic overviews      Layers > Duplication / Synteny / ...
  //   last             provenance               About
  //
  // The Layers order matches the gene page's bands, so the two do not disagree about which
  // evidence comes first.
  const nav = document.querySelector('header.top nav');
  // Karyotype is a route, not a module (it has no per-gene card), so it is appended by hand.
  nav.append(el('a', { href: '#/karyotype' }, 'Karyotype'));

  const LAYER_ORDER = ['duplication', 'synteny', 'expression', 'protein', 'phylostrat'];
  const layers = LAYER_ORDER.map(byId).filter((m) => m && m.overview);
  if (layers.length) {
    const panel = el('div', { class: 'navmenu-panel' },
      ...layers.map((m) => el('a', { href: `#/module/${m.id}` }, m.label)));
    const menu = el('details', { class: 'navmenu' }, el('summary', {}, 'Layers'), panel);
    // Close after a choice, and on Escape or a click elsewhere -- a <details> menu that
    // stays open over the page is worse than the flat row it replaced.
    panel.addEventListener('click', () => { menu.open = false; });
    menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.open = false; });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.open = false; });
    nav.append(menu);
  }

  // Any module with an overview that is NOT in the list above still gets its own tab rather
  // than silently disappearing from the site when someone adds one.
  const placed = new Set([...LAYER_ORDER, 'about']);
  MODULES.filter((m) => m.overview && !placed.has(m.id))
    .forEach((m) => nav.append(el('a', { href: `#/module/${m.id}` }, m.label)));

  const about = byId('about');
  if (about && about.overview) nav.append(el('a', { href: '#/module/about' }, about.label));
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
        ' · ', el('a', { href: '#/module/about' }, 'provenance'),
        // The footer already states which build you are reading; the gates that build passed
        // belong next to it, not two clicks away inside another page.
        ' · ', el('a', { href: '#/status' }, 'build status')));
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

/* The gene page's section nav sticks directly under the site header, and header.top wraps to
   two rows on a narrow screen -- a hard-coded offset would leave the nav hidden behind it.
   Measure it instead, and keep it right through rotation and font-size changes. */
(function trackHeaderHeight() {
  const top = document.querySelector('header.top');
  if (!top) return;
  const set = () => document.documentElement.style.setProperty('--top-h', `${top.offsetHeight}px`);
  set();
  if ('ResizeObserver' in window) new ResizeObserver(set).observe(top);
  else window.addEventListener('resize', set);
})();
