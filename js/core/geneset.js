// Shared gene-set store -- the only channel through which modules interact.
// A view can publish a named set ("still private after the rerun"); any other view can
// consume it. This is what makes cross-module questions possible without coupling.

const sets = new Map();
const listeners = new Set();
let active = null;

export function saveSet(name, ids, meta = {}) {
  sets.set(name, { name, ids: [...new Set(ids)], meta, created: Date.now() });
  emit();
  return sets.get(name);
}
export const getSet = (name) => sets.get(name) || null;
export const allSets = () => [...sets.values()];
export function removeSet(name) { sets.delete(name); if (active === name) active = null; emit(); }
export function setActive(name) { active = name; emit(); }
export const getActive = () => (active ? sets.get(active) : null);

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((f) => f()); }

export function toTSV(set, columns = ['gene_id']) {
  return [columns.join('\t'), ...set.ids.map((id) => id)].join('\n');
}
