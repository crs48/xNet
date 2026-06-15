#!/usr/bin/env node
/**
 * CLI: resolve the set of UI targets to capture for the current diff.
 *
 *   node scripts/visuals/changed-capture-set.mjs \
 *     --base origin/main \
 *     --storybook-index storybook-static/index.json \
 *     --out capture-set.json
 *
 * Mirrors the `vitest --changed` model already used in ci.yml: we only render
 * what the PR touched. Pure mapping lives in lib/capture-set.mjs.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { computeCaptureSet, captureSetIsEmpty } from './lib/capture-set.mjs'

const here = dirname(fileURLToPath(import.meta.url))

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

function changedFilesFromGit(base) {
  // `base...HEAD` = changes introduced on this branch since it forked from base
  // (the merge-base diff), matching GitHub's "Files changed" tab.
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`, '--'], {
    encoding: 'utf8'
  })
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

function loadStoryEntries(indexPath) {
  if (!indexPath || !existsSync(indexPath)) return []
  const json = JSON.parse(readFileSync(indexPath, 'utf8'))
  // Storybook >=8 index.json: { v, entries: { id: { type, title, name, importPath } } }
  const entries = json.entries ?? json.stories ?? {}
  return Object.values(entries).filter((e) => (e.type ?? 'story') === 'story')
}

const base = arg('base', 'origin/main')
const out = arg('out', 'capture-set.json')
const manifestsPath = arg('manifests', join(here, 'manifests.json'))
const indexPath = arg('storybook-index', 'storybook-static/index.json')
const diffFile = arg('diff-from-file', null) // test hook: newline-separated paths
const all = process.argv.includes('--all') // baseline mode: capture every still

const manifests = JSON.parse(readFileSync(manifestsPath, 'utf8'))
const storyEntries = loadStoryEntries(indexPath)

let set
let changedFiles = []
if (all) {
  // Baseline for `main`: every story + every route, so any PR's changed subset
  // has something to diff against. Flows are videos, never diffed -> omit.
  set = {
    stories: storyEntries.map((e) => ({
      kind: 'story',
      id: e.id,
      title: e.title,
      name: e.name,
      importPath: e.importPath
    })),
    routes: (manifests.routes ?? []).map((r) => ({
      kind: 'route',
      id: r.id,
      label: r.label,
      path: r.path
    })),
    flows: []
  }
} else {
  changedFiles = diffFile
    ? readFileSync(diffFile, 'utf8')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
    : changedFilesFromGit(base)
  set = computeCaptureSet({
    changedFiles,
    storyEntries,
    routeManifest: manifests.routes ?? [],
    flowManifest: manifests.flows ?? []
  })
}

const result = {
  base,
  changedCount: changedFiles.length,
  empty: captureSetIsEmpty(set),
  ...set
}

const outDir = dirname(out)
if (outDir && outDir !== '.') mkdirSync(outDir, { recursive: true })
writeFileSync(out, JSON.stringify(result, null, 2))
console.error(
  `[capture-set] ${changedFiles.length} changed file(s) -> ` +
    `${set.stories.length} story, ${set.routes.length} route, ${set.flows.length} flow target(s) -> ${out}`
)
