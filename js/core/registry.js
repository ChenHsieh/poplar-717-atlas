// Module registry. Adding a module = import it here and push it into MODULES.
//
// The contract, all fields optional except id/label:
//   id        stable slug, used in URLs
//   label     display name
//   geneCard(gene) -> HTMLElement | null   a card on the gene page
//   overview(manifest) -> HTMLElement      the module's own landing view
//   filters   [{id, label, test(gene, value), options|range}]  facets for the query builder
//
// Modules MUST NOT import one another. Cross-module interaction goes through geneset.js.
import synteny from '../modules/synteny.js';
import expression from '../modules/expression.js';
import annotation from '../modules/annotation.js';
import phylostrat from '../modules/phylostrat.js';
import duplication from '../modules/duplication.js';
import about from '../modules/about.js';

// annotation first: 'what is this gene' should be the top card on a gene page.
export const MODULES = [annotation, synteny, phylostrat, duplication, expression, about];
export const byId = (id) => MODULES.find((m) => m.id === id);
