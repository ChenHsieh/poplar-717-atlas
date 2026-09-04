// Module: functional annotation + the HAP1<->HAP2 allele link + panel presence.
// Answers a visitor's first three questions on the gene page: what is this gene, where is
// its other allele, and which genomes have it.
import { el, fmt } from '../core/dom.js';
import { loadTerms } from '../core/data.js';

const PANEL = ['Ptrxalhap1', 'Ptrxalhap2', 'Pnigra', 'Ptrichocarpa', 'Pdeltoides',
  'Peuphratica', 'Spurpurea', 'Egrandis', 'Vvinifera', 'Athaliana', 'Osativa', 'Ppatens'];
const SHORT = {
  Ptrxalhap1: 'HAP1', Ptrxalhap2: 'HAP2', Pnigra: 'P. nigra', Ptrichocarpa: 'P. trichocarpa',
  Pdeltoides: 'P. deltoides', Peuphratica: 'P. euphratica', Spurpurea: 'S. purpurea',
  Egrandis: 'E. grandis', Vvinifera: 'V. vinifera', Athaliana: 'A. thaliana',
  Osativa: 'O. sativa', Ppatens: 'P. patens',
};
const PHYTOZOME = 'https://phytozome-next.jgi.doe.gov/report-gene/';

let termsCache = null;
loadTerms().then((t) => { termsCache = t; }).catch(() => {});

function accBadges(list, kind) {
  return list.map((id) => {
    const name = termsCache && termsCache.acc && termsCache.acc[id];
    return el('span', { class: 'badge', title: name || id, style: 'font-size:11px' },
      el('span', { class: 'mono' }, id));
  });
}

function goList(ids) {
  const NS = { P: 'process', F: 'function', C: 'component' };
  const rows = ids.slice(0, 12).map((id) => {
    const t = termsCache && termsCache.go && termsCache.go[id];
    return el('li', { style: 'margin:0 0 3px' },
      el('a', { href: `https://amigo.geneontology.org/amigo/term/${id}`, target: '_blank',
        rel: 'noopener', class: 'mono', style: 'font-size:11.5px' }, id), ' ',
      t ? el('span', {}, t[0], el('span', { class: 'muted' }, ` · ${NS[t[1]] || t[1]}`))
        : el('span', { class: 'muted' }, 'term name unavailable'));
  });
  const ul = el('ul', { style: 'margin:0;padding-left:0;list-style:none' }, ...rows);
  if (ids.length > 12) ul.append(el('li', { class: 'muted', style: 'font-size:12px;margin-top:4px' },
    `+ ${ids.length - 12} more GO terms`));
  return ul;
}

function annotationCard(g) {
  const a = g.ann;
  if (!a) return null;
  const kv = el('dl', { class: 'kv' });
  const add = (k, ...v) => { kv.append(el('dt', {}, k), el('dd', {}, ...v)); };

  if (a.d) add('Description', a.d);
  if (a.at) {
    add('Best Arabidopsis hit',
      el('a', { href: `https://www.arabidopsis.org/locus?name=${a.at}`, target: '_blank',
        rel: 'noopener', class: 'mono' }, a.at),
      a.atd ? el('span', {}, ' — ', a.atd) : null);
  }
  if (a.pf && a.pf.length) add('Pfam', el('span', { style: 'display:flex;gap:5px;flex-wrap:wrap' }, ...accBadges(a.pf)));
  else if (g.hap === 'hap2') {
    add('Pfam', el('span', { class: 'muted' }, 'not available for HAP2'));
  }
  if (a.pt && a.pt.length) add('PANTHER', el('span', { style: 'display:flex;gap:5px;flex-wrap:wrap' }, ...accBadges(a.pt)));
  if (a.go && a.go.length) add('GO', goList(a.go));

  const card = el('div', { class: 'card' },
    el('h2', {}, 'Function', el('span', { class: 'tag' }, 'Phytozome v5.1')), kv);

  // The HAP2 release ships empty Pfam/PANTHER/GO columns; only ~3,200 HAP2 genes recover a
  // Pfam accession from the defline vs 26,132 on HAP1. Say so, or the asymmetry reads as biology.
  if (g.hap === 'hap2' && (!a.pf || !a.pf.length)) {
    card.append(el('div', { class: 'warn' },
      'Domain coverage is thinner on HAP2: the v5.1 release left the Pfam/PANTHER columns empty ',
      'for this haplotype, so only accessions recoverable from the defline are shown. ',
      'An absent domain here does not mean the gene lacks one — check the HAP1 allele.'));
  }
  card.append(el('p', { style: 'margin:12px 0 0;font-size:12px' },
    el('a', { href: PHYTOZOME + g.id, target: '_blank', rel: 'noopener' }, 'View on Phytozome ↗')));
  return card;
}

function alleleCard(g) {
  const a = g.allele;
  const other = g.hap === 'hap1' ? 'HAP2' : 'HAP1';
  if (!a) {
    return el('div', { class: 'card' },
      el('h2', {}, 'Allele', el('span', { class: 'tag' }, 'syntelog')),
      el('p', { class: 'muted', style: 'margin:0;font-size:13px' },
        `No 1:1 ${other} syntelog in the 25,931-pair map. That is expected for genes in tandem `
        + `arrays, hemizygous regions, or where synteny breaks down — not evidence of absence.`));
  }
  const kv = el('dl', { class: 'kv' });
  kv.append(el('dt', {}, `${other} allele`),
    el('dd', {}, el('a', { href: `#/gene/${a.id}`, class: 'mono' }, a.id)));
  if (a.ks0) {
    kv.append(el('dt', {}, 'Divergence'),
      el('dd', {}, el('span', {}, 'identical at synonymous sites (Ks = 0)'),
        el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' },
          'ω is undefined when Ks is 0 — the aligner reports a 99 placeholder, not selection.')));
    if (a.ka != null) kv.append(el('dt', {}, 'Ka'), el('dd', { class: 'mono' }, a.ka.toFixed(4)));
  } else {
    if (a.ks != null) kv.append(el('dt', {}, 'Ks'), el('dd', { class: 'mono' }, a.ks.toFixed(4)));
    if (a.ka != null) kv.append(el('dt', {}, 'Ka'), el('dd', { class: 'mono' }, a.ka.toFixed(4)));
    if (a.w != null) {
      kv.append(el('dt', {}, 'ω (Ka/Ks)'),
        el('dd', {}, el('span', { class: 'mono' }, a.w.toFixed(3)), ' ',
          el('span', { class: 'muted' }, a.w < 0.1 ? 'strong purifying selection'
            : a.w < 1 ? 'purifying selection' : 'Ka exceeds Ks')));
    }
  }
  return el('div', { class: 'card' },
    el('h2', {}, 'Allele', el('span', { class: 'tag' }, 'syntelog')), kv,
    el('p', { class: 'muted', style: 'margin:10px 0 0;font-size:12px' },
      'Yang–Nielsen estimates over the HAP1↔HAP2 syntelog map (25,931 pairs), computed '
      + 'independently of the GENESPACE run shown above.'));
}

function presenceCard(g) {
  if (!g.pres || !g.pres.length) return null;
  const have = new Set(g.pres);
  const cells = PANEL.map((p) => el('div', {
    title: `${p}: ${have.has(p) ? 'present' : 'absent'} in this orthogroup`,
    style: `display:flex;flex-direction:column;align-items:center;gap:4px;min-width:58px`,
  },
    el('div', {
      style: `width:100%;height:22px;border-radius:4px;border:1px solid var(--line-2);`
        + `background:${have.has(p) ? 'var(--accent)' : 'transparent'}`,
    }),
    el('span', { style: 'font-size:9.5px;color:var(--ink-2);text-align:center;line-height:1.2' },
      SHORT[p] || p)));
  return el('div', { class: 'card' },
    el('h2', {}, 'Panel presence', el('span', { class: 'tag' }, `${g.pres.length} of 12`)),
    el('div', { style: 'display:flex;gap:5px;flex-wrap:wrap' }, ...cells),
    el('p', { class: 'muted', style: 'margin:11px 0 0;font-size:12px' },
      'Genomes whose genes share this OrthoFinder orthogroup. Filled = present. '
      + 'O. sativa and P. patens are orthogroup-only outgroups, excluded from synteny.'));
}

function geneCard(g) {
  // Returns a fragment holding several cards; app.js appends whatever geneCard gives it.
  const frag = document.createDocumentFragment();
  [annotationCard(g), alleleCard(g), presenceCard(g)].forEach((c) => c && frag.append(c));
  return frag.childNodes.length ? frag : null;
}

export default {
  id: 'annotation',
  label: 'Function',
  geneCard,
  filters: [
    { id: 'has_at', label: 'Has Arabidopsis hit', options: ['yes', 'no'],
      test: (g, v) => (!!(g.ann && g.ann.at) ? 'yes' : 'no') === v },
    { id: 'has_allele', label: 'Has HAP1↔HAP2 allele', options: ['yes', 'no'],
      test: (g, v) => (!!g.allele ? 'yes' : 'no') === v },
  ],
};
