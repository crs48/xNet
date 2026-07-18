/**
 * Post-build validation for site/dist — the last gate before the tree is
 * rsync'd (with --delete) over the gh-pages root.
 *
 * On 2026-07-18 a production deploy went GREEN while publishing a half-finished
 * Astro build: `astro build` stopped partway through prerendering (last page
 * logged was /changelog/), so dist/ still held the intermediate SERVER build
 * (renderers.mjs, chunks/, pages/*.astro.mjs, manifest_*.mjs) and was missing
 * index.html plus every route prerendered after that point. The publish step
 * happily synced it, --delete wiped the real homepage, and xnet.fyi served the
 * Starlight 404 at / for ~30 minutes (gh-pages 07383a172).
 *
 * A partial build is indistinguishable from a good one at the step level, so it
 * has to be caught by inspecting the artifact:
 *   1. no server-build leftovers at the dist root (they only survive a build
 *      that never reached its cleanup phase);
 *   2. every static page under src/pages/ produced its HTML — derived from the
 *      source tree, so it stays correct as pages are added or removed.
 *
 * Consumer: the tail of `pnpm build` in site/package.json, so it gates every
 * caller — the production deploy and the PR/branch previews alike — and fails
 * the job before anything reaches gh-pages.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// site/scripts/validate-dist.ts → site/ is one level up.
const siteRoot = fileURLToPath(new URL('..', import.meta.url))
const pagesDir = join(siteRoot, 'src/pages')
// Defaults to site/dist; an explicit path lets you point it at a copy (used by
// the regression check that this guard still rejects a truncated build).
const distDir = process.argv[2] ? resolve(process.argv[2]) : join(siteRoot, 'dist')

/**
 * Files/dirs Astro writes for the intermediate server build and deletes once
 * prerendering completes. Anything still here means the build died early.
 */
const SERVER_ARTIFACTS = ['renderers.mjs', 'noop-entrypoint.mjs', '_astro-internal_middleware.mjs', 'chunks', 'pages']
const SERVER_ARTIFACT_PATTERNS = [/^manifest_.*\.mjs$/]

const errors: string[] = []

if (!existsSync(distDir)) {
  console.error('✗ site/dist does not exist — did astro build run?')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 1. Server-build leftovers
// ---------------------------------------------------------------------------

const distRoot = readdirSync(distDir)
const leftovers = distRoot.filter(
  (entry) => SERVER_ARTIFACTS.includes(entry) || SERVER_ARTIFACT_PATTERNS.some((re) => re.test(entry))
)

if (leftovers.length > 0) {
  errors.push(
    `dist/ contains Astro server-build artifacts: ${leftovers.join(', ')}.\n` +
      '  These are removed when a build finishes, so the build was interrupted\n' +
      '  (OOM, timeout, cancelled runner) and dist/ is incomplete. Do not publish.'
  )
}

// ---------------------------------------------------------------------------
// 2. Every static page in src/pages produced HTML
// ---------------------------------------------------------------------------

/** Recursively collect .astro page files, relative to src/pages. */
function collectPages(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectPages(full))
    } else if (entry.isFile() && entry.name.endsWith('.astro')) {
      out.push(relative(pagesDir, full))
    }
  }
  return out
}

/**
 * src/pages path → expected dist output, for `build.format: 'directory'`
 * (Astro's default, unchanged in astro.config.mjs):
 *   index.astro     → index.html
 *   why.astro       → why/index.html
 *   blog/index.astro → blog/index.html
 *   blog/post.astro  → blog/post/index.html
 */
function expectedOutput(pagePath: string): string {
  const route = pagePath.replace(/\.astro$/, '')
  if (route === 'index') return 'index.html'
  if (route.endsWith('/index')) return `${route}.html`
  return join(route, 'index.html')
}

// Dynamic routes ([...slug]) depend on data we can't cheaply resolve here;
// Starlight's /docs tree is generated the same way. Skip them — the static
// pages are enough to detect a truncated prerender.
const staticPages = collectPages(pagesDir).filter((p) => !p.includes('['))

const missing = staticPages
  .map((page) => ({ page, output: expectedOutput(page) }))
  .filter(({ output }) => !existsSync(join(distDir, output)))

if (missing.length > 0) {
  errors.push(
    `${missing.length} page(s) in src/pages/ produced no HTML in dist/:\n` +
      missing.map(({ page, output }) => `    src/pages/${page} → dist/${output}`).join('\n')
  )
}

// ---------------------------------------------------------------------------
// 3. The homepage specifically — it is what / serves, and its absence silently
//    falls through to 404.html on GitHub Pages.
// ---------------------------------------------------------------------------

const indexPath = join(distDir, 'index.html')
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf8')
  if (html.length < 1000) {
    errors.push(`dist/index.html is only ${html.length} bytes — suspiciously small for the homepage.`)
  }
}

// ---------------------------------------------------------------------------

if (errors.length > 0) {
  console.error('✗ site/dist failed validation — refusing to publish:\n')
  for (const error of errors) console.error(`  • ${error}\n`)
  process.exit(1)
}

console.log(`✓ site/dist looks complete (${staticPages.length} static pages, no server-build leftovers)`)
