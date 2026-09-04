// Data access. The gene ID encodes its own shard, so there is no index file to load.
//
// MIRRORS scripts/build_data.py:shard_of() EXACTLY. If you change one, change the other --
// the build asserts the Python side against the real annotation, so this side is the one
// that can drift silently.

const CHR_RE = /^PtXa(TreH|AlbH)\.(.+?)G\d+$/;
const SCAF_RE = /^PtXa(TreH|AlbH)\.T\d+$/;

export function shardOf(geneId) {
  let m = CHR_RE.exec(geneId);
  if (m) return { hap: m[1] === 'TreH' ? 'hap1' : 'hap2', key: 'Chr' + m[2] };
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

/* ---------- annotation, allele, search ---------- */
export const loadTerms = () => fetchJSON('data/index/terms.json');
export const loadGeneIndex = () => fetchJSON('data/index/genes.json');
/** Token index is sharded by first character so typing fetches one small file. */
export const loadSearchShard = (c) => fetchJSON(`data/index/search/${c}.json`);

/** Free-text search over descriptions, Arabidopsis loci, Pfam and PANTHER accessions. */
export async function searchGenes(query, limit = 30) {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const c = /[a-z0-9]/.test(q[0]) ? q[0] : '_';
  let shard, ids;
  try {
    [shard, ids] = await Promise.all([loadSearchShard(c), loadGeneIndex()]);
  } catch {
    return [];
  }
  // Exact token first, then prefix matches, so "kinase" beats "kinase-like".
  const hits = new Map();
  const add = (idxs, rank) => idxs.forEach((i) => { if (!hits.has(i)) hits.set(i, rank); });
  if (shard[q]) add(shard[q], 0);
  for (const tok in shard) {
    if (hits.size > limit * 8) break;
    if (tok !== q && tok.startsWith(q)) add(shard[tok], 1);
  }
  return [...hits.entries()]
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([i]) => ids[i]);
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
