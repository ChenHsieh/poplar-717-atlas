// Module registry. Adding a module = import it here, push it into MODULES, and -- if it draws
// a gene card -- name it in one GENE_SECTIONS band below.
//
// The contract, all fields optional except id/label:
//   id        stable slug, used in URLs
//   label     display name
//   geneCard(gene, manifest) -> HTMLElement | null   a card on the gene page. `manifest`
//                is always passed (small, already fetched for the page); most modules ignore it.
//   overview(manifest) -> HTMLElement      the module's own landing view
//   filters   [{id, label, test(gene, value), options|range}]  facets for the query builder
//
// Modules MUST NOT import one another. Cross-module interaction goes through geneset.js.
import synteny from '../modules/synteny.js';
import expression from '../modules/expression.js';
import annotation from '../modules/annotation.js';
import phylostrat from '../modules/phylostrat.js';
import duplication from '../modules/duplication.js';
import duplayers from '../modules/duplayers.js';
import dupheatmap from '../modules/dupheatmap.js';
import protein from '../modules/protein.js';
import locus from '../modules/locus.js';
import mirror from '../modules/mirror.js';
import scrubber from '../modules/scrubber.js';
import promoter from '../modules/promoter.js';
import about from '../modules/about.js';

export const MODULES = [annotation, locus, mirror, scrubber, promoter, synteny, phylostrat,
  duplayers, duplication, dupheatmap, protein, expression, about];
export const byId = (id) => MODULES.find((m) => m.id === id);

// ---------------------------------------------------------------------------------------
// The gene page, in bands.
//
// A gene page now carries fourteen or more cards, and the order they were appended in was the
// order the modules happened to be imported -- so a promoter motif prediction could sit above
// the duplication class, and the expression summary landed near the bottom. This list is the
// running order, and it is ordered by WHAT THE EVIDENCE IS, not by what is interesting:
//
//   identity / duplication / synteny / expression   measured on THIS assembly
//   predicted                                       inferred, predicted, or carried over from
//                                                   another species
//
// That is also why `predicted` is last rather than merely lower: a reader who stops scrolling
// partway should have stopped before the weakest evidence, not in the middle of it.
export const GENE_SECTIONS = [
  { id: 'identity', label: 'Identity',
    modules: ['annotation'],
    blurb: 'What this gene is, its allele on the other haplotype, and selection on both comparisons.' },
  { id: 'duplication', label: 'Duplication',
    modules: ['duplayers', 'duplication', 'dupheatmap'],
    blurb: 'Which events produced this gene, who its copies are, and how they diverged.' },
  { id: 'synteny', label: 'Synteny & position',
    modules: ['synteny', 'mirror', 'locus'],
    blurb: 'Syntelogs, the same locus on the other haplotype, and the neighbourhood.' },
  { id: 'expression', label: 'Expression',
    modules: ['expression', 'scrubber'],
    blurb: 'Where this gene is on, across 652 RNA-seq samples.' },
  { id: 'predicted', label: 'Predicted & indirect',
    modules: ['promoter', 'protein', 'phylostrat'],
    blurb: 'Weaker evidence, and last for that reason: motif and structure calls are '
      + 'predictions, the chromatin is measured in P. trichocarpa and transferred here, and a '
      + 'phylostratigraphic rank is a property of the database it was searched against.' },
];

/** Modules that draw a gene card, in the order the gene page should show them. */
export const geneSectionModules = (section) =>
  section.modules.map((id) => byId(id)).filter((m) => m && m.geneCard);

// A module that draws a gene card but is named in no band would silently vanish from the page
// -- the card would simply stop being appended, with nothing failing. Catch it at load.
{
  const placed = new Set(GENE_SECTIONS.flatMap((s) => s.modules));
  const orphans = MODULES.filter((m) => m.geneCard && !placed.has(m.id)).map((m) => m.id);
  if (orphans.length) {
    throw new Error(`registry: ${orphans.join(', ')} draw a gene card but are in no `
      + 'GENE_SECTIONS band, so they would never be shown. Add them to one.');
  }
  const unknown = [...placed].filter((id) => !byId(id));
  if (unknown.length) throw new Error(`registry: GENE_SECTIONS names unknown module(s) ${unknown.join(', ')}`);
}
