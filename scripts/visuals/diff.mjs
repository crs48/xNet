#!/usr/bin/env node
/**
 * Compare captured stills against the `main` baseline and keep only what
 * actually changed. Flows (videos) always pass through -- an interaction demo
 * is worth showing regardless.
 *
 *   node scripts/visuals/diff.mjs \
 *     --manifest tmp/visuals/manifest.json \
 *     --baseline-url https://xnet.fyi/visuals-baseline \
 *     --out tmp/visuals \
 *     --threshold 0.998
 *
 * Baseline images mirror the capture layout (e.g. stories/<id>.png), so the
 * baseline URL/dir for an entry is just `${baseline}/${entry.file}`.
 *
 * Output: <out>/diff-manifest.json with each still tagged changed | new |
 * unchanged, plus before/ and diff/ images for the changed ones.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync, rmSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { ssim, diffImage } from './lib/ffmpeg.mjs'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const manifestPath = arg('manifest', 'tmp/visuals/manifest.json')
const outDir = arg('out', dirname(manifestPath))
const baselineUrl = arg('baseline-url', process.env.VISUALS_BASELINE_URL || '')
const baselineDir = arg('baseline-dir', '')
const threshold = Number(arg('threshold', '0.998'))

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

/** Fetch the baseline for an entry to a local path. Returns the path or null. */
async function fetchBaseline(file) {
  const dest = join(outDir, 'before', file)
  mkdirSync(dirname(dest), { recursive: true })
  if (baselineDir) {
    const src = join(baselineDir, file)
    if (!existsSync(src)) return null
    copyFileSync(src, dest)
    return dest
  }
  if (!baselineUrl) return null
  const res = await fetch(`${baselineUrl}/${file}`).catch(() => null)
  if (!res || !res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(dest, buf)
  return dest
}

async function classifyStill(entry) {
  const after = join(outDir, entry.file)
  const before = await fetchBaseline(entry.file)
  if (!before) return { ...entry, status: 'new', after: entry.file }
  const score = ssim(before, after)
  if (Number.isFinite(score) && score >= threshold) {
    try {
      rmSync(before) // don't publish baselines for stills that didn't change
    } catch {}
    return { ...entry, status: 'unchanged', ssim: score }
  }
  const diffPath = join(outDir, 'diff', entry.file)
  mkdirSync(dirname(diffPath), { recursive: true })
  diffImage(before, after, diffPath)
  return {
    ...entry,
    status: 'changed',
    ssim: Number.isFinite(score) ? score : null,
    before: relative(outDir, before),
    after: entry.file,
    diff: relative(outDir, diffPath)
  }
}

const stories = []
for (const s of manifest.stories ?? []) stories.push(await classifyStill(s))
const routes = []
for (const r of manifest.routes ?? []) routes.push(await classifyStill(r))

const result = {
  threshold,
  baseline: baselineDir || baselineUrl || null,
  stories,
  routes,
  flows: manifest.flows ?? [], // videos always pass through
  changedCount:
    stories.filter((s) => s.status !== 'unchanged').length +
    routes.filter((r) => r.status !== 'unchanged').length +
    (manifest.flows?.length ?? 0)
}

writeFileSync(join(outDir, 'diff-manifest.json'), JSON.stringify(result, null, 2))
const tally = (arr) => {
  const c = { changed: 0, new: 0, unchanged: 0 }
  for (const x of arr) c[x.status]++
  return `${c.changed} changed, ${c.new} new, ${c.unchanged} unchanged`
}
console.error(
  `[diff] stories: ${tally(stories)} | routes: ${tally(routes)} | flows: ${result.flows.length}`
)
