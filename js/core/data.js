// Data access. The gene ID encodes its own shard, so there is no index file to load.
//
// MIRRORS scripts/build_data.py:shard_of() EXACTLY. If you change one, change the other --
// the build asserts the Python side against the real annotation, so this side is the one
// that can drift silently.

const CHR_RE = /^PtXa(TreH|AlbH)\.(\d\d)G(\d+)$/;
const SCAF_RE = /^PtXa(TreH|AlbH)\.T\d+$/;

// Genes are numbered in steps of 100 within a chromosome, so this yields <=250 genes per
// shard (~40 KB gzipped). Whole-chromosome shards reached 3.9 MB raw for a page that renders
// one gene. MIRRORS scripts/build_data.py:BUCKET_SPAN -- change both or neither.
const BUCKET_SPAN = 25000;

export function shardOf(geneId) {
  let m = CHR_RE.exec(geneId);
  if (m) {
    return {
      hap: m[1] === 'TreH' ? 'hap1' : 'hap2',
      key: `Chr${m[2]}/${Math.floor(parseInt(m[3], 10) / BUCKET_SPAN)}`,
    };
  }
  m = SCAF_RE.exec(geneId);
  if (m) return { hap: m[1] === 'TreH' ? 'hap1' : 'hap2', key: 'scaffolds' };
  return null;
}

export const hapLabel = (h) => (h === 'hap1' ? 'HAP1 (TreH)' : 'HAP2 (AlbH)');

const cache = new Map();
const inflight = new Map();

async function fetchJSON(path) {
  if (cache.has(path)) return cache.get(path);
  if (inflight.has(path)) return inflight.get(path);
  const p = fetch(path)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${path}`);
      return r.json();
    })
    .then((j) => {
      cache.set(path, j);
      inflight.delete(path);
      return j;
    })
    .catch((e) => {
      inflight.delete(path);
      throw e;
    });
  inflight.set(path, p);
  return p;
}

export const loadShard = (hap, key) => fetchJSON(`data/genes/${hap}/${key}.json`);
export const loadManifest = () => fetchJSON('data/meta/manifest.json');

/** One gene, one fetch. Returns null for an ID that does not exist.
 *  Checks the manifest's shard list first so a malformed ID (Chr99) resolves to "not found"
 *  without firing a request that 404s -- the manifest is already cached by the shell. */
export async function getGene(geneId) {
  const s = shardOf(geneId);
  if (!s) return null;
  const man = await loadManifest();
  if (!(`${s.hap}/${s.key}` in man.shards)) return null;
  const shard = await loadShard(s.hap, s.key);
  const g = shard[geneId];
  return g ? { ...g, hap: s.hap } : null;
}

/** The syntelog partner ID in the other haplotype is NOT derivable from the ID -- gene
 *  numbering is independent per haplotype. Callers must use orthogroup/synteny data. */
export async function loadAllShards(onProgress) {
  const man = await loadManifest();
  const keys = Object.keys(man.shards);
  const out = [];
  let done = 0;
  for (const k of keys) {
    const [hap, key] = k.split('/');
    const shard = await loadShard(hap, key);
    for (const id in shard) out.push({ ...shard[id], hap });
    if (onProgress) onProgress(++done, keys.length);
  }
  return out;
}

/* ---------- expression ---------- */
export const loadExprSamples = () => fetchJSON('data/expr/samples.json');
export const loadExprStudies = () => fetchJSON('data/expr/studies.json');
export const loadExprBucket = (bucketKey) => fetchJSON(`data/expr/buckets/${bucketKey}.json`);

/** Full 652-sample vector for one gene, fetched on demand (the gene shard only carries the
 *  tissue-baseline summary, not the vector -- see docs/EXPRESSION_DESIGN.md). */
export async function loadExprVector(gene) {
  if (!gene.x) return null;
  const bucket = await loadExprBucket(gene.x.b);
  return bucket[gene.id] || null;
}

/** ComBat-seq batch-corrected vector, same 652-sample index as loadExprVector -- but ONLY
 *  for the ~59,600 genes with enough count signal to have been batch-corrected upstream
 *  (see docs and sources/combat_tpm.provenance.json). `gene.x.cb` is absent, not null, on
 *  every gene without one; callers must check it before offering the option at all. */
export const loadCombatBucket = (bucketKey) => fetchJSON(`data/expr/combat_buckets/${bucketKey}.json`);
export async function loadCombatVector(gene) {
  if (!gene.x || !gene.x.cb) return null;
  const bucket = await loadCombatBucket(gene.x.cb);
  return bucket[gene.id] || null;
}

/* ---------- annotation, allele, search ---------- */
export const loadTerms = () => fetchJSON('data/index/terms.json');
export const loadGeneIndex = () => fetchJSON('data/index/genes.json');
/** Token index is sharded by first character so typing fetches one small file. */
export const loadSearchShard = (c) => fetchJSON(`data/index/search/${c}.json`);

/** Free-text search over descriptions, Arabidopsis loci, Pfam and PANTHER accessions, PLUS
 *  a gene-ID prefix match, merged and ranked in one place so the header dropdown and the
 *  full search-results page (#/search/<query>) can never disagree about what "the results"
 *  are -- one had capped at `limit`, the other needs the true total to decide whether to
 *  offer "see all results".
 *
 *  Returns { ids: ALL matches, ranked, uncapped, total: ids.length }. Callers slice for
 *  display; nothing here silently drops a match the caller didn't ask to drop. Search
 *  shards are small (largest is ~680KB, already fetched once per query) so scanning one
 *  fully for a query is cheap -- the old implementation's `limit*8` scan-break existed only
 *  to bound dropdown latency, not because an accurate count was expensive to get.
 */
export async function searchGenesRanked(query) {
  const q = query.trim();
  const ql = q.toLowerCase();
  if (ql.length < 3) return { ids: [], total: 0 };

  const byIdIdx = [];               // gene-ID prefix match, e.g. "PtXaTreH.05G12"
  const idPromise = /^PtXa/i.test(q) ? loadGeneIndex() : null;

  const c = /[a-z0-9]/.test(ql[0]) ? ql[0] : '_';
  let shard, ids;
  try {
    [shard, ids] = await Promise.all([loadSearchShard(c), loadGeneIndex()]);
  } catch {
    shard = {}; ids = idPromise ? await idPromise : [];
  }
  if (idPromise) {
    const up = q.toUpperCase();
    for (let i = 0; i < ids.length; i++) if (ids[i].toUpperCase().startsWith(up)) byIdIdx.push(i);
  }

  // Exact token first, then prefix matches, so "kinase" beats "kinase-like".
  const rank = new Map();
  const add = (idxs, r) => idxs.forEach((i) => { if (!rank.has(i)) rank.set(i, r); });
  add(byIdIdx, -1);                 // an ID match always outranks a text match
  if (shard[ql]) add(shard[ql], 0);
  for (const tok in shard) {
    if (tok !== ql && tok.startsWith(ql)) add(shard[tok], 1);
  }
  const ranked = [...rank.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([i]) => ids[i]);
  return { ids: ranked, total: ranked.length };
}

/** Back-compat wrapper: the capped, dropdown-shaped call most callers still want. */
export async function searchGenes(query, limit = 30) {
  const { ids } = await searchGenesRanked(query);
  return ids.slice(0, limit);
}

/* ---------- facets (browse) ---------- */
export const loadFacets = () => fetchJSON('data/index/facets.json');

/** Facet rows are positional and share index/genes.json's order. This turns one row into a
 *  named object so filters read as English rather than as column offsets. */
export function facetRow(facets, i) {
  const r = facets.rows[i];
  const c = facets.cols;
  const v = facets.vocab;
  const o = {};
  for (let k = 0; k < c.length; k++) o[c[k]] = r[k];
  return {
    hap: o.hap === 0 ? 'hap1' : 'hap2',
    chr: v.chr[o.chr] ?? null,
    cls: v.cls[o.cls] ?? null,
    ps: o.ps < 0 ? null : o.ps,
    tau: o.tau < 0 ? null : o.tau / 100,
    top: v.top[o.top] ?? null,
    allele: !!o.allele,
    at: !!o.at,
    changed: !!o.changed,
    tandem: !!o.tandem,
    npres: o.npres,   // 0 means OrthoFinder assigned no orthogroup at all
    amb: !!o.amb,
  };
}

/** Members of a tandem array, from the curated union set. */
export const loadArrays = () => fetchJSON('data/index/arrays.json');

// Locus layer. A tile is one megabase of one chromosome: gene positions, strand,
// longest-isoform exon structure, and the few fields the locus card draws. Built by
// scripts/build_locus.py. Self-sufficient on purpose -- a gene page on a phone should
// not also have to pull a chromosome index.
export const loadLocusTile = (hap, chr, mb) => fetchJSON(`data/locus/tile/${hap}/${chr}/${mb}.json`);

/** 100kb-bin whole-genome overview, both haplotypes, one fetch (~112 KB raw). For the
 *  genome map's zoomed-out view. */
export const loadLocusOverview = () => fetchJSON('data/locus/overview.json');

/** Every gene on one chromosome, position and class only (no structure) -- for the
 *  genome map's per-chromosome zoom. Sorted by start already. */
export const loadLocusIndex = (hap, chr) => fetchJSON(`data/locus/index/${hap}/${chr}.json`);
