// Module: promoter / cis-regulatory element scan. Source: ms2-lsg's genome-wide JASPAR
// scan, reviewed 2026-09-06 (see sources/cre_promoter_hits.provenance.json).
//
// WHY THIS CARD IS WORDED THE WAY IT IS, not just what it shows:
//
//   1. Every family column is a TF-FAMILY grouping by JASPAR matrix name (bZIP, WRKY,
//      MYB...), never a cis-element name (ABRE, DRE/CRT, W-box). The source data's own
//      column names read as cis-elements in two cases (ABRE_bZIP, DREB_ERF); those were
//      renamed to bZIP / AP2_ERF at ingestion (build_cre.py) precisely so nothing here
//      can claim "this promoter has an ABRE" when what was actually measured is "this
//      promoter has a hit to a bZIP-family binding-site model". A hit to a family's PWM
//      is evidence a binding site COULD exist, not that one does.
//   2. Families are represented by very uneven numbers of matrices (17 for MADS-box, 73
//      for AP2/ERF in this scan) and the hit threshold is a FRACTION of a matrix's own
//      max score, so a family with more/longer matrices racks up more hits for reasons
//      that are about the matrix library, not the gene. Raw counts are therefore never
//      shown as the primary comparison; bars are normalized per matrix
//      (hits / matrices_per_family) and the raw n is always alongside, never alone.
//   3. TATA is two DIFFERENT facts, kept visually and textually separate: whether the
//      canonical core-promoter TATA box was found in the standard -45..-20 window
//      (tata.core), versus the position of the nearest TATA-like hexamer anywhere in the
//      promoter (tata.pos), which can be far upstream and is not a core-promoter TATA box
//      just because the same 6-letter pattern matched there.
import { el } from '../core/dom.js';

function tataLine(t) {
  // tata_pos is ALREADY "bp upstream of the TSS" (verified against the source data: rows
  // with tata_core=True cluster their tata_pos in [8,51], i.e. right at the -45..-20 core
  // window -- not the inverse). No arithmetic needed; a subtraction here was tried first
  // and was wrong, caught by checking a known-true case rather than trusting the label.
  if (t.core) {
    return el('span', {},
      el('strong', {}, 'Canonical TATA box'), ' in the core promoter (−45 to −20 bp from the TSS).');
  }
  if (t.pos != null) {
    return el('span', {},
      'No canonical core-promoter TATA box. A TATA-like sequence occurs ',
      el('strong', {}, `${t.pos.toLocaleString()} bp upstream`),
      ' of the TSS — outside the −45..−20 core window, so this is not a core promoter TATA box.');
  }
  return el('span', {}, 'No TATA-like sequence found anywhere in the scanned promoter.');
}

function familyStrip(cre, cm) {
  const order = ['bZIP', 'AP2_ERF', 'WRKY', 'MYB', 'NAC', 'MADS', 'SPL', 'TCP', 'ARF', 'other'];
  const labels = cm.family_labels, mats = cm.matrices_per_family;
  const norm = order.map((k) => (cre.fam[k] || 0) / (mats[k] || 1));
  const max = Math.max(...norm, 0.01);
  const rows = order.map((k, i) => el('tr', {},
    el('td', {}, labels[k]),
    el('td', { class: 'num mono' }, cre.fam[k]),
    el('td', { class: 'muted num', style: 'font-size:10.5px' }, `/${mats[k]} matrices`),
    el('td', { style: 'width:44%' },
      el('div', { class: 'bar', style: `width:${Math.max((norm[i] / max) * 100, cre.fam[k] > 0 ? 1.5 : 0)}%;background:var(--accent)`,
        title: `${cre.fam[k]} hit(s) across ${mats[k]} ${labels[k]}-family matrices` }))));
  return el('table', { class: 'data' },
    el('thead', {}, el('tr', {}, el('th', {}, 'TF family'), el('th', { class: 'num' }, 'hits'),
      el('th', {}, ''), el('th', {}, 'hits per matrix, normalized'))),
    el('tbody', {}, ...rows));
}

function geneCard(g, man) {
  const cre = g.cre;
  const cm = man && man.cre;
  if (!cre || !cm) return null;
  return el('div', { class: 'card' },
    el('h2', {}, 'Promoter', el('span', { class: 'tag' }, 'JASPAR motif scan')),
    el('p', { class: 'sub', style: 'margin:0 0 10px' },
      `${(cre.gc * 100).toFixed(1)}% GC over the ${cm.promoter_window_bp} bp upstream of the TSS`,
      cre.ov > 0 ? el('span', {}, `, of which ${cre.ov} bp overlaps the neighbouring gene`) : null,
      cre.nf > 0 ? el('span', {}, ` (${(cre.nf * 100).toFixed(0)}% unassembled)`) : null, '.'),
    el('p', { style: 'font-size:12.5px;margin:0 0 12px' }, tataLine(cre.tata)),
    el('h3', { style: 'font-size:12.5px;margin:0 0 6px;color:var(--ink-2)' },
      'Transcription-factor family motif matches'),
    familyStrip(cre, cm),
    el('p', { class: 'muted', style: 'font-size:11px;margin:8px 0 0' },
      'These are matches to JASPAR position-weight matrices for each family (log-odds ≥ 85% of a ',
      "matrix's own maximum score, both strands) — evidence a family's binding site COULD sit there, ",
      'not a confirmed or gene-specific regulatory element. Families are built from very different ',
      'numbers of matrices, so bars are normalized per matrix; raw hit counts are not comparable ',
      'across families on their own.'));
}

export default { id: 'promoter', label: 'Promoter', geneCard };
