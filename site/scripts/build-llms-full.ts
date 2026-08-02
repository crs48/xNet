/**
 * Build script to generate llms-full.txt from all documentation pages.
 * This concatenates all MDX files into a single file for AI agents.
 *
 * Three modes:
 *   1. (no flag)   regenerate `public/llms-full.txt`. Runs as the `build:llms`
 *                  step of `pnpm --dir site build`.
 *   2. `--check`   verify the committed artifact still matches what the current
 *                  docs produce, without writing. This is `pnpm check:llms-full`.
 *   3. `--selftest` verify the comparison in (2) can actually go red.
 *
 * Why (2) exists: the output is *committed* but generated, and CI does not build
 * `site/` on pull requests — so an MDX edit that skips the regeneration ships a
 * silently stale artifact. That happened: commit 4c00be2c7 renumbered an
 * exploration reference 0424 -> 0430 in `decisions.mdx` and left llms-full.txt
 * quoting the dead number until an unrelated commit happened to regenerate it.
 * The file agents are pointed at was wrong in the meantime, and nothing said so.
 *
 * Why (3) exists: a gate with no negative control is unfalsifiable (exploration
 * 0430). Its fixtures are in memory, never on disk, so a planted control can
 * never leak into the real comparison.
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { dirname, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'
import { orderedDocSlugs } from '../src/sidebar.mjs'

// Resolved from this file, not `process.cwd()`, so the check runs the same from
// the repo root (`pnpm check:llms-full`) as from `site/` (`pnpm build`).
const SITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS_DIR = join(SITE_ROOT, 'src/content/docs')
const OUTPUT_PATH = join(SITE_ROOT, 'public/llms-full.txt')

interface DocPage {
  path: string
  title: string
  content: string
  order: number
}

// Section order comes from the sidebar (src/sidebar.mjs) — the same order a
// human reads the docs in. Slugs there look like 'docs/guides/canvas'; paths
// here are relative to the docs/ content root, so strip the prefix.
const SECTION_ORDER: string[] = orderedDocSlugs.map((slug: string) => slug.replace(/^docs\//, ''))

// Content files intentionally absent from the sidebar (and from llms-full.txt).
const EXCLUDED_FROM_SIDEBAR: string[] = []

async function collectMdxFiles(dir: string): Promise<string[]> {
  const files: string[] = []

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.name.endsWith('.mdx') && entry.name !== 'index.mdx') {
        files.push(fullPath)
      }
    }
  }

  await walk(dir)
  return files
}

function extractFrontmatter(content: string): {
  title: string
  description?: string
  body: string
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

  if (!frontmatterMatch) {
    return { title: 'Untitled', body: content }
  }

  const frontmatter = frontmatterMatch[1]
  const body = frontmatterMatch[2]

  // Extract title
  const titleMatch = frontmatter.match(/title:\s*['"]?([^'"\n]+)['"]?/)
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled'

  // Extract description
  const descMatch = frontmatter.match(/description:\s*['"]?([^'"\n]+)['"]?/)
  const description = descMatch ? descMatch[1].trim() : undefined

  return { title, description, body }
}

function cleanMdxContent(content: string): string {
  // Remove import statements
  content = content.replace(/^import\s+.*$/gm, '')

  // Remove JSX components but keep their text content
  // Handle components like <Aside> or :::note
  content = content.replace(/:::(note|tip|caution|danger)\[([^\]]*)\]/g, '**$2**')
  content = content.replace(/:::/g, '')

  // Remove component tags but keep content
  content = content.replace(/<[A-Z][a-zA-Z]*[^>]*>/g, '')
  content = content.replace(/<\/[A-Z][a-zA-Z]*>/g, '')

  // Clean up extra whitespace
  content = content.replace(/\n{3,}/g, '\n\n')

  return content.trim()
}

function docSlug(filePath: string, docsDir: string): string {
  return relative(join(docsDir, 'docs'), filePath)
    .replace(/\.mdx$/, '')
    .replace(/\\/g, '/')
}

/**
 * Render the artifact from the docs on disk. Returns the bytes rather than
 * writing them, so `--check` can compare without touching the working tree.
 */
async function renderLlmsFull(): Promise<{ content: string; pageCount: number }> {
  const docsDir = DOCS_DIR

  const files = await collectMdxFiles(join(docsDir, 'docs'))

  // Every content file must be listed in the sidebar (src/sidebar.mjs) or
  // explicitly excluded — otherwise a new page would silently ship without
  // navigation and with arbitrary placement in llms-full.txt.
  const unlisted = files
    .map((file) => docSlug(file, docsDir))
    .filter((slug) => !SECTION_ORDER.includes(slug) && !EXCLUDED_FROM_SIDEBAR.includes(slug))
  if (unlisted.length > 0) {
    throw new Error(
      `Docs pages missing from src/sidebar.mjs (add them to the sidebar or to EXCLUDED_FROM_SIDEBAR):\n` +
        unlisted.map((slug) => `  - ${slug}`).join('\n')
    )
  }

  const pages: DocPage[] = []

  for (const file of files) {
    const content = await readFile(file, 'utf-8')
    const { title, body } = extractFrontmatter(content)
    const cleanedBody = cleanMdxContent(body)
    const order = SECTION_ORDER.indexOf(docSlug(file, docsDir))

    pages.push({
      path: file,
      title,
      content: cleanedBody,
      order
    })
  }

  // Sort by order
  pages.sort((a, b) => a.order - b.order)

  // Build output
  let output = `# xNet Documentation

> Complete documentation for xNet, a local-first framework for building multiplayer React applications. Data lives on the device, syncs peer-to-peer via CRDTs, and works offline. No backend required.

## Important: xNet is NOT a Client-Server Architecture

Before reading this documentation, understand that xNet works differently:

- **No backend needed**: Data lives on the device, not a server
- **No API endpoints**: Use React hooks (useQuery, useMutate) instead of fetch/axios
- **No auth flows**: Identity is cryptographic (DID:key) and built-in
- **No state management**: Hooks are reactive and handle this automatically
- **Offline by default**: Everything works offline, syncs when online

## Table of Contents

`

  // Add table of contents
  for (const page of pages) {
    const indent =
      page.path.includes('/concepts/') ||
      page.path.includes('/guides/') ||
      page.path.includes('/hooks/') ||
      page.path.includes('/schemas/') ||
      page.path.includes('/architecture/') ||
      page.path.includes('/contributing/')
        ? '  '
        : ''
    output += `${indent}- ${page.title}\n`
  }

  output += '\n---\n\n'

  // Add each page
  for (const page of pages) {
    output += `## ${page.title}\n\n`
    output += page.content
    output += '\n\n---\n\n'
  }

  return { content: output, pageCount: pages.length }
}

/**
 * Compare a fresh render against the committed bytes. Pure (no I/O) so
 * `--selftest` exercises the real comparison rather than a stand-in.
 *
 * `committed === null` means the file is absent, which is reported as its own
 * reason: "missing" and "differs" are different failures, and neither is a pass.
 */
export function compareArtifact(
  generated: string,
  committed: string | null
): { ok: true } | { ok: false; reason: string } {
  if (committed === null) {
    return { ok: false, reason: 'public/llms-full.txt is missing' }
  }
  if (committed === generated) {
    return { ok: true }
  }

  // Point at the first divergence — the drift is usually one edited line, and
  // "differs" alone sends the reader to an 11k-line diff.
  const a = generated.split('\n')
  const b = committed.split('\n')
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return {
        ok: false,
        reason:
          `first difference at line ${i + 1}\n` +
          `    committed: ${b[i] === undefined ? '<end of file>' : JSON.stringify(b[i])}\n` +
          `    docs say:  ${a[i] === undefined ? '<end of file>' : JSON.stringify(a[i])}`
      }
    }
  }
  return { ok: false, reason: 'contents differ' }
}

async function runCheck(): Promise<number> {
  const { content, pageCount } = await renderLlmsFull()

  // A render that collapsed to the preamble would compare clean against an
  // equally collapsed artifact. A truncated run is not a completed one.
  if (pageCount === 0) {
    console.error('✗ rendered 0 doc pages — the generator is broken, not the artifact')
    return 1
  }

  const committed = await readFile(OUTPUT_PATH, 'utf-8').catch(() => null)
  const result = compareArtifact(content, committed)
  if (!result.ok) {
    console.error(`✗ site/public/llms-full.txt is stale — ${result.reason}`)
    console.error('\n  The docs changed without regenerating the artifact. Run:')
    console.error('    cd site && pnpm install --ignore-workspace && pnpm build:llms')
    console.error('  then commit site/public/llms-full.txt.')
    return 1
  }

  console.log(`✓ site/public/llms-full.txt matches the docs (${pageCount} pages)`)
  return 0
}

/**
 * Negative control: prove the comparison reports drift it is supposed to catch.
 * Fixtures are in memory only.
 */
function runSelfTest(): number {
  const base = ['# xNet Documentation', '', '## ADR discipline', '', 'reasoning is 0430.'].join(
    '\n'
  )

  const cases: { label: string; committed: string | null; expectDrift: boolean }[] = [
    { label: 'passes when the artifact matches', committed: base, expectDrift: false },
    {
      label: 'flags the real 0424 -> 0430 drift shape',
      committed: base.replace('0430', '0424'),
      expectDrift: true
    },
    { label: 'flags a missing artifact', committed: null, expectDrift: true },
    { label: 'flags a truncated artifact', committed: base.split('\n')[0], expectDrift: true },
    {
      label: 'flags an artifact with extra trailing content',
      committed: base + '\nstray',
      expectDrift: true
    },
    {
      label: 'flags whitespace-only drift',
      committed: base.replace('reasoning is', 'reasoning  is'),
      expectDrift: true
    }
  ]

  let failures = 0
  for (const c of cases) {
    const drifted = !compareArtifact(base, c.committed).ok
    if (drifted === c.expectDrift) {
      console.log(`  ✓ ${c.label}`)
    } else {
      failures++
      console.error(`  ✗ ${c.label} — expected drift=${c.expectDrift}, got ${drifted}`)
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} self-test(s) failed.`)
    return 1
  }
  console.log(`\n✓ llms-full self-test passed (${cases.length} cases)`)
  return 0
}

async function main(): Promise<number> {
  if (process.argv.includes('--selftest')) {
    return runSelfTest()
  }
  if (process.argv.includes('--check')) {
    return runCheck()
  }

  console.log('Collecting MDX files from:', DOCS_DIR)
  const { content, pageCount } = await renderLlmsFull()
  console.log(`Found ${pageCount} MDX files`)

  await writeFile(OUTPUT_PATH, content)

  const stats = await stat(OUTPUT_PATH)
  console.log(
    `Generated llms-full.txt (${Math.round(stats.size / 1024)} KB, ${content.length} bytes)`
  )
  console.log(`Output: ${OUTPUT_PATH}`)
  return 0
}

// `process.exitCode` rather than `process.exit()`: exiting outright can truncate
// buffered stdout, and a gate whose failure reason got cut off is a gate nobody
// can act on.
main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    console.error('Error building llms-full.txt:', err)
    process.exitCode = 1
  })
