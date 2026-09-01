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

export const MODULES = [synteny];
export const byId = (id) => MODULES.find((m) => m.id === id);
