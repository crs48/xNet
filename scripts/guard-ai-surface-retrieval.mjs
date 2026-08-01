#!/usr/bin/env node
/**
 * Every agent lane builds its retrieval (exploration 0415).
 *
 * The retriever, the injection seam and the factory all existed before this
 * guard — and every coding-agent lane still constructed its AI surface without
 * them, because nothing said it had to. Context packs fell back to a linear
 * keyword scan, multi-hop questions became unanswerable, and the omission was
 * invisible in review: the call reads fine, it is what it *doesn't* pass that
 * costs you.
 *
 * So this is a HARD-ZERO gate. A call to `createAiSurfaceService(` or
 * `createMCPServer(` must, within its argument list, pass one of:
 *
 *   - `retrieval`        (MCP server — wires `retrieveContext` internally)
 *   - `retrieveContext`  (AI surface — the seam itself)
 *   - `aiSurface`        (a pre-built surface; its own call site is checked)
 *
 * Test and benchmark files are exempt: a fixture that deliberately measures the
 * un-retrieved path is the point, not a regression.
 *
 * Run: `node scripts/guard-ai-surface-retrieval.mjs`
 *      (or `pnpm check:ai-retrieval`).
 */

import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

const ROOTS = ['packages', 'apps']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.turbo', 'coverage', '.next'])
const SOURCE_RE = /\.(ts|tsx|mts|cts)$/
/** Fixtures may construct a bare surface on purpose — that is what they measure. */
const EXEMPT_RE = /(\.test\.|\.spec\.|__tests__|__evals__|\/testing\/|\/benchmarks\/|\.stories\.)/

const CONSTRUCTORS = ['createAiSurfaceService', 'createMCPServer']
const SATISFIES = ['retrieval', 'retrieveContext', 'aiSurface']

/**
 * Sites that legitimately build a bare surface. Each entry names a file and the
 * reason — a bare allowlist with no reasons is how a gate stops meaning
 * anything. Adding one should be an argument you have to write down.
 */
const ALLOWLIST = [
  {
    file: 'packages/plugins/src/services/ai-workspace-exporter.ts',
    reason:
      'internal default for a class whose config already accepts a wired `aiSurface`; ' +
      'the exporter calls `search`/`callTool` and never `createContextPack`, so a ' +
      'retriever here would be inert'
  }
]

/** Walk `dir`, yielding source files that are not skipped or exempt. */
async function* sourceFiles(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield* sourceFiles(full)
    } else if (SOURCE_RE.test(entry.name) && !EXEMPT_RE.test(full)) {
      yield full
    }
  }
}

/**
 * Slice the balanced argument list starting at the `(` that follows `from`.
 * Returns `null` when the parentheses never balance (a truncated read is not a
 * clean one, so the caller reports it rather than assuming the call is fine).
 */
function argumentList(source, from) {
  const open = source.indexOf('(', from)
  if (open === -1) return null
  let depth = 0
  for (let i = open; i < source.length; i++) {
    const char = source[i]
    if (char === '(') depth++
    else if (char === ')') {
      depth--
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  return null
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length
}

/**
 * Blank out comments, preserving offsets so reported line numbers stay true.
 *
 * Without this the JSDoc `@example` on `createMCPServer` itself reads as an
 * unwired call site — a false positive that would teach everyone to ignore this
 * gate within a week.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, lead) => lead + ' '.repeat(match.length - lead.length))
}

async function main() {
  const violations = []

  for (const root of ROOTS) {
    for await (const file of sourceFiles(root)) {
      const allowed = ALLOWLIST.find((entry) => file.endsWith(entry.file))
      if (allowed) continue
      const source = stripComments(readFileSync(file, 'utf8'))
      for (const constructor of CONSTRUCTORS) {
        let cursor = 0
        for (;;) {
          const found = source.indexOf(`${constructor}(`, cursor)
          if (found === -1) break
          cursor = found + constructor.length
          // Skip the definition/export sites themselves.
          const prefix = source.slice(Math.max(0, found - 20), found)
          if (/(function |export \{[^}]*|class )$/.test(prefix)) continue

          const args = argumentList(source, found + constructor.length)
          if (args === null) {
            violations.push({
              file,
              line: lineOf(source, found),
              constructor,
              reason: 'could not parse the argument list — check this call by hand'
            })
            continue
          }
          const satisfied = SATISFIES.some((key) =>
            new RegExp(`(^|[\\s,{])${key}\\s*[,:}]`).test(args)
          )
          if (!satisfied) {
            violations.push({
              file,
              line: lineOf(source, found),
              constructor,
              reason: `passes none of: ${SATISFIES.join(', ')}`
            })
          }
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('AI surface built without retrieval (exploration 0415):\n')
    for (const violation of violations) {
      console.error(
        `  ${relative(process.cwd(), violation.file)}:${violation.line}\n` +
          `    ${violation.constructor}() ${violation.reason}`
      )
    }
    console.error(
      '\nBuild retrieval with createAgentRetrieval({ store, schemas }) and pass it as\n' +
        '`retrieval` (MCP server) or `retrieveContext` (AI surface). Omitting it drops\n' +
        'the lane to a keyword scan with no graph stage — silently.\n'
    )
    process.exit(1)
  }

  console.log('✓ every AI surface / MCP server construction site wires retrieval')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
