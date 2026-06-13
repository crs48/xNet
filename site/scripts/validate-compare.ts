/**
 * Build-time validation for site/src/data/compare.ts.
 *
 * Runs as part of `pnpm build` (before astro build) so CI fails on
 * incomplete or inconsistent comparison data: missing required fields,
 * non-https URLs, columns without values, dangling or unused footnote
 * references, and duplicate names.
 */

import { layers } from '../src/data/compare'
import type { CompareLayer, CompareProject } from '../src/data/compare'

const MATURITIES = ['production', 'beta', 'alpha', 'pre-release', 'maintenance']
// Columns resolved from top-level project fields rather than dims.
const RESOLVED_FIELDS = ['license', 'bestFor']

const errors: string[] = []

function err(layer: string, msg: string): void {
  errors.push(`[${layer}] ${msg}`)
}

function requireField(layer: string, owner: string, field: string, value: string): void {
  if (!value) err(layer, `${owner}: missing or invalid ${field}`)
}

function checkUrl(layer: string, owner: string, url: string): void {
  if (!url.startsWith('https://')) err(layer, `${owner}: url must be https (${url})`)
}

function checkRequired(layer: string, p: CompareProject): void {
  requireField(layer, p.name || '(unnamed)', 'name', p.name)
  requireField(layer, p.name, 'license', p.license)
  requireField(layer, p.name, 'bestFor', p.bestFor)
  requireField(layer, p.name, 'maturity', MATURITIES.includes(p.maturity) ? p.maturity : '')
  checkUrl(layer, p.name, p.url)
}

function checkDims(l: CompareLayer, p: CompareProject): void {
  for (const col of l.columns) {
    if (RESOLVED_FIELDS.includes(col.key)) continue
    if (!(col.key in p.dims)) err(l.id, `${p.name}: missing dims["${col.key}"]`)
  }
}

function cellRefs(p: CompareProject): string[] {
  const fromCells = Object.values(p.dims)
    .map((v) => (typeof v === 'object' ? v.fn : null))
    .filter((fn): fn is string => fn !== null)
  return [...fromCells, ...(p.footnotes ?? [])]
}

function checkDanglingRefs(layer: string, ids: string[], refs: Set<string>): void {
  for (const ref of refs) {
    if (!ids.includes(ref)) err(layer, `dangling footnote ref "${ref}"`)
  }
}

function checkUnusedFootnotes(layer: string, ids: string[], refs: Set<string>): void {
  for (const id of ids) {
    if (!refs.has(id)) err(layer, `unused footnote "${id}"`)
  }
}

function checkFootnotes(l: CompareLayer): void {
  const ids = l.footnotes.map((f) => f.id)
  if (new Set(ids).size !== ids.length) err(l.id, 'duplicate footnote ids')
  const refs = new Set(l.projects.flatMap(cellRefs))
  checkDanglingRefs(l.id, ids, refs)
  checkUnusedFootnotes(l.id, ids, refs)
}

function checkUniqueNames(l: CompareLayer): void {
  const names = [...l.projects.map((p) => p.name), ...l.chips.map((c) => c.name)]
  const dupes = names.filter((n, i) => names.indexOf(n) !== i)
  for (const d of new Set(dupes)) err(l.id, `duplicate name "${d}"`)
}

function checkChips(l: CompareLayer): void {
  for (const chip of l.chips) {
    requireField(l.id, chip.name, 'note', chip.note)
    checkUrl(l.id, chip.name, chip.url)
  }
}

function checkLayerShape(l: CompareLayer): void {
  requireField(l.id, l.id, 'intro', l.intro)
  requireField(l.id, l.id, 'lastVerified', l.lastVerified)
  requireField(l.id, l.id, 'columns', l.columns.length > 0 ? 'ok' : '')
  requireField(l.id, l.id, 'projects', l.projects.length > 0 ? 'ok' : '')
}

function checkLayer(l: CompareLayer): void {
  checkLayerShape(l)
  for (const p of l.projects) {
    checkRequired(l.id, p)
    checkDims(l, p)
  }
  checkFootnotes(l)
  checkUniqueNames(l)
  checkChips(l)
}

function report(): void {
  if (errors.length === 0) return
  console.error(`compare.ts validation failed with ${errors.length} error(s):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

for (const layer of layers) checkLayer(layer)
report()

const rows = layers.reduce((n, l) => n + l.projects.length, 0)
const chips = layers.reduce((n, l) => n + l.chips.length, 0)
console.log(`compare.ts OK: ${layers.length} layers, ${rows} rows, ${chips} chips`)
