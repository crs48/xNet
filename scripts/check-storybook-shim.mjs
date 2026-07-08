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
const exported = shimExports()
const seen = new Set()
const queue = STORY_ROOTS.flatMap((root) => [...storyFiles(root)])
const missing = new Map() // name -> Set<importing file>
const bareImports = new Set()

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
      const hit = aliases.get(spec)
      if (hit) target = resolveFile(hit)
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

if (missing.size > 0 || bareImports.size > 0) process.exit(1)
console.log(
  `✓ storybook shim covers the story import graph (${seen.size} modules walked, ${exported.size} shim exports)`
)
