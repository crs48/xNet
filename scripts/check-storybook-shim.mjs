#!/usr/bin/env node
/**
 * Fail when code reachable from a storybook story imports a name from
 * `@xnetjs/plugins` that the storybook browser shim does not re-export
 * (exploration 0283).
 *
 * The storybook build aliases `@xnetjs/plugins` to
 * `.storybook/shims/xnet-plugins-browser.ts` (see .storybook/workspace-aliases.ts)
 * so stories never pull in node-only plugin machinery. That shim must mirror
 * every named export the story bundle actually uses — and history shows it
 * drifts: 0279, 0280, and PR #412 each broke the Visual UI Capture workflow
 * six minutes into an optional job with "X is not exported by …". Typecheck
 * can't catch this (tsconfig resolves the real package, not the shim), so this
 * check walks the story import graph — the same closure rollup will bundle —
 * and runs in the required `lint` job, failing in seconds instead.
 *
 * Resolution must match Vite's, or the walk quietly covers less than the build
 * does and the check goes green on a real break. That is exactly what happened
 * to `writeModeFor`: `@xnetjs/workbench` has no entry in workspace-aliases.ts,
 * so the old walker dropped the specifier and never reached
 * `views/ai-chat-write-tools.ts`, while rollup resolved it through the
 * workspace link and failed. So: aliases first (Vite applies them first), then
 * the workspace package's own `exports`/`main` — and an `@xnetjs/*` specifier
 * that resolves to neither is a hard failure, never a silent drop. A checker
 * that cannot fail on a real breakage is worse than no checker.
 *
 * Usage:
 *   node scripts/check-storybook-shim.mjs   (or `pnpm check:storybook-shim`)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const SHIM = '.storybook/shims/xnet-plugins-browser.ts'
const ALIASES_FILE = '.storybook/workspace-aliases.ts'

// Mirrors the `stories` globs in .storybook/main.ts: the roots whose
// *.stories.* files seed the bundle.
const STORY_ROOTS = [
  'packages/ui/src',
  'packages/editor/src',
  'packages/views/src',
  'packages/canvas/src',
  'packages/dashboard/src',
  'apps/web/src',
  'apps/electron/src/renderer'
]

// The build bundles more than the stories: the preview and manager entries are
// compiled too, and both can reach workspace code.
const EXTRA_SEEDS = ['.storybook/preview.tsx', '.storybook/manager.tsx']

// Where `@xnetjs/*` packages live, for specifiers no alias covers.
const WORKSPACE_ROOTS = ['packages', 'apps']

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.turbo'])
const STORY_RE = /\.stories\.(ts|tsx|mdx)$/

// ── Alias map (parsed from the real file so the two can't drift) ─────────────
function workspaceAliases() {
  const src = readFileSync(ALIASES_FILE, 'utf8')
  const aliases = new Map()
  const entryRe = /'(@xnetjs\/[^']+)':\s*fileURLToPath\(\s*new URL\('([^']+)',/g
  for (const match of src.matchAll(entryRe)) {
    aliases.set(match[1], resolve('.storybook', match[2]))
  }
  if (aliases.size === 0) {
    console.error(`✗ storybook shim: could not parse aliases from ${ALIASES_FILE}`)
    process.exit(2)
  }
  return aliases
}

// ── Workspace packages (the fallback Vite gets from node_modules links) ──────
// name -> package dir, e.g. '@xnetjs/workbench' -> 'packages/workbench'.
function workspacePackages() {
  const packages = new Map()
  for (const root of WORKSPACE_ROOTS) {
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root)) {
      const manifest = join(root, entry, 'package.json')
      if (!existsSync(manifest)) continue
      const { name } = JSON.parse(readFileSync(manifest, 'utf8'))
      if (name?.startsWith('@xnetjs/')) packages.set(name, join(root, entry))
    }
  }
  return packages
}

/**
 * The entry file a workspace package's own manifest declares for `subpath`
 * ('.' or './ai'), preferring the `import` condition rollup uses. `null` when
 * the manifest does not map it — the caller reports that, never swallows it.
 *
 * Manifests point two ways in this repo: some at `./src/*.ts` (compiled from
 * source), others at `./dist/*.js`. A `dist` entry is still built from source
 * we can read, and its imports are still alias-rewritten when storybook bundles
 * it — so walk the source counterpart rather than stopping at a build artifact
 * that may not even be present.
 */
function packageEntry(dir, subpath) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const target = manifest.exports?.[subpath]
  const relative =
    typeof target === 'string'
      ? target
      : (target?.import ?? target?.types ?? (subpath === '.' ? manifest.main : undefined))
  if (!relative) return subpath === '.' ? null : distToSource(dir, subpath.slice(2))
  return resolveFile(join(dir, relative)) ?? distToSource(dir, relative)
}

/** `./dist/auth/index.js` (or a bare subpath) -> `packages/data/src/auth/index.ts`. */
function distToSource(dir, relative) {
  const withinPackage = relative.replace(/^\.\//, '').replace(/^dist\//, '')
  const base = join(dir, 'src', withinPackage.replace(/\.(js|jsx|d\.ts)$/, ''))
  return resolveFile(base)
}

// ── Shim exports ─────────────────────────────────────────────────────────────
function shimExports() {
  const names = new Set()
  const src = readFileSync(SHIM, 'utf8')
  // export { a, b as c } from '…'  /  export type { D } from '…'
  const blockRe = /export\s+(?:type\s+)?\{([^}]*)\}/g
  for (const match of src.matchAll(blockRe)) {
    for (const entry of match[1].split(',')) {
      const name = entry
        .replace(/\btype\b/g, '')
        .split(/\s+as\s+/)
        .pop()
        .trim()
      if (name) names.add(name)
    }
  }
  return names
}

// ── Story seeds ──────────────────────────────────────────────────────────────
function* storyFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) yield* storyFiles(path)
    else if (STORY_RE.test(entry)) yield path
  }
}

// ── Import graph walk ────────────────────────────────────────────────────────
// Static + dynamic import/export-from specifiers.
const SPECIFIER_RE = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g
// import { a, type B } from '@xnetjs/plugins'  /  export { c } from '@xnetjs/plugins'
const PLUGINS_NAMED_RE =
  /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@xnetjs\/plugins['"]/g
const PLUGINS_BARE_RE =
  /import\s+(?:\*\s+as\s+\w+|\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s*['"]@xnetjs\/plugins['"]/

const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx', '.js', '.jsx']

function resolveFile(base) {
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

const aliases = workspaceAliases()
const packages = workspacePackages()
const exported = shimExports()

/**
 * Resolve an `@xnetjs/*` specifier the way the storybook build does: the Vite
 * alias if one covers it, otherwise the workspace package's declared entry.
 * Returns `null` only when neither applies — a gap in the walk, which the
 * caller must surface rather than treat as "not our graph".
 */
function resolveXnetSpec(spec) {
  const aliased = aliases.get(spec)
  if (aliased) return resolveFile(aliased)

  const segments = spec.split('/')
  const name = segments.slice(0, 2).join('/')
  const dir = packages.get(name)
  if (!dir) return null

  const subpath = segments.length > 2 ? `./${segments.slice(2).join('/')}` : '.'
  return packageEntry(dir, subpath)
}

const seen = new Set()
const queue = [...STORY_ROOTS.flatMap((root) => [...storyFiles(root)]), ...EXTRA_SEEDS]
const missing = new Map() // name -> Set<importing file>
const bareImports = new Set()
const unresolved = new Map() // specifier -> Set<importing file>

while (queue.length > 0) {
  const file = queue.pop()
  if (seen.has(file)) continue
  seen.add(file)
  const src = readFileSync(file, 'utf8')

  if (src.includes('@xnetjs/plugins')) {
    if (PLUGINS_BARE_RE.test(src)) bareImports.add(file)
    for (const match of src.matchAll(PLUGINS_NAMED_RE)) {
      for (const entry of match[1].split(',')) {
        const name = entry
          .replace(/\btype\b/g, '')
          .split(/\s+as\s+/)[0]
          .trim()
        if (name && !exported.has(name)) {
          if (!missing.has(name)) missing.set(name, new Set())
          missing.get(name).add(file)
        }
      }
    }
  }

  for (const match of src.matchAll(SPECIFIER_RE)) {
    const spec = match[1].split('?')[0] // drop ?worker / ?raw suffixes
    if (spec === '@xnetjs/plugins') continue // handled above; don't walk the shim
    let target = null
    if (spec.startsWith('.')) {
      target = resolveFile(resolve(dirname(file), spec))
    } else if (spec.startsWith('@xnetjs/')) {
      target = resolveXnetSpec(spec)
      if (!target) {
        if (!unresolved.has(spec)) unresolved.set(spec, new Set())
        unresolved.get(spec).add(file)
      }
    }
    // Everything else (bare third-party, css, assets) is not our graph.
    if (target && /\.(ts|tsx|js|jsx|mdx)$/.test(target)) queue.push(target)
  }
}

if (bareImports.size > 0) {
  console.error(
    `✗ storybook shim: default/namespace imports of @xnetjs/plugins are not shimmable:\n` +
      [...bareImports].map((f) => `    ${f}`).join('\n')
  )
}

if (missing.size > 0) {
  console.error(
    `✗ storybook shim: ${SHIM} is missing ${missing.size} export(s) used in the story bundle:`
  )
  for (const [name, files] of [...missing.entries()].sort()) {
    console.error(`  · ${name}  (${[...files].slice(0, 3).join(', ')})`)
  }
  console.error(
    '\n  Re-export the missing names from packages/plugins/src/* in the shim,\n' +
      '  mirroring the existing grouped blocks. See exploration 0283.'
  )
}

if (unresolved.size > 0) {
  console.error(
    `✗ storybook shim: ${unresolved.size} @xnetjs/* specifier(s) this walk cannot resolve.\n` +
      `  The build resolves them and keeps bundling, so anything past here goes unchecked:`
  )
  for (const [spec, files] of [...unresolved.entries()].sort()) {
    console.error(`  · ${spec}  (${[...files].slice(0, 3).join(', ')})`)
  }
  console.error(
    '\n  Add the package to the workspace roots, or give the subpath an\n' +
      `  "exports" entry in its package.json / an alias in ${ALIASES_FILE}.`
  )
}

if (missing.size > 0 || bareImports.size > 0 || unresolved.size > 0) process.exit(1)
console.log(
  `✓ storybook shim covers the storybook import graph (${seen.size} modules walked, ${exported.size} shim exports)`
)
