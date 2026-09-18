// Module registry. Adding a module = import it here and push it into MODULES.
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

// annotation first: 'what is this gene' should be the top card on a gene page.
// duplayers/dupheatmap sit either side of duplication: the picture of the layers, then the
// card that names them, then the same copies over every sample.
export const MODULES = [annotation, locus, mirror, scrubber, promoter, synteny, phylostrat, duplayers, duplication, dupheatmap, protein, expression, about];
export const byId = (id) => MODULES.find((m) => m.id === id);
