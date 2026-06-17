#!/usr/bin/env node
/**
 * Enforce the canonical motion vocabulary (exploration 0199).
 *
 * Motion in xNet is a small, named vocabulary defined in
 * packages/ui/src/theme/motion.css and documented in docs/MOTION.md. This
 * guard keeps authors — human or AI — inside it by failing CI on the four
 * footguns, scoped to the surfaces that carry the tokens: `packages/ui/src`
 * and `apps/web/src` (both build with the token-bearing Tailwind config).
 * Other packages have their own design systems (e.g. the editor's --editor-*
 * theme) and are intentionally out of scope.
 *
 *   ✗ transition-all          → animates layout props off the compositor; name
 *                               the property: transition-base / -colors-fast /
 *                               transition-[opacity,transform] / transition-[width]
 *   ✗ duration-<ms> literal   → use duration-fast | duration-normal | duration-slow
 *   ✗ ease-bounce             → retired; use ease-out, or ease-spring for
 *                               direct-manipulation feedback
 *   ✗ animate-[…] arbitrary   → add a named primitive to motion.css instead
 *
 * Run: `node scripts/check-motion-vocab.mjs` (or `pnpm check:motion-vocab`).
 * Pass extra paths as args to scan them too.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

const root = resolve(process.cwd())
const SCOPED_DIRS = [join(root, 'packages/ui/src'), join(root, 'apps/web/src')]
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.turbo', 'coverage'])
const EXT = new Set(['.ts', '.tsx'])

/** The banned patterns. Each entry: a name, a regex, and the fix to suggest. */
const RULES = [
  {
    name: 'transition-all',
    re: /\btransition-all\b/,
    fix: 'name the property: transition-base, transition-colors-fast, or transition-[opacity,transform] / transition-[width]'
  },
  {
    name: 'raw duration literal',
    re: /\bduration-(?:75|100|150|200|300|500|700|1000)\b/,
    fix: 'use a token: duration-fast (100), duration-normal (150), or duration-slow (200)'
  },
  {
    name: 'ease-bounce',
    re: /\bease-bounce\b/,
    fix: 'retired — use ease-out, or ease-spring for direct-manipulation feedback'
  },
  {
    name: 'arbitrary animate-[…]',
    re: /\banimate-\[/,
    fix: 'add a named primitive to packages/ui/src/theme/motion.css instead'
  }
]

/** Recursively collect .ts/.tsx files under a directory. */
function collect(dir, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      collect(join(dir, e.name), out)
    } else if (e.isFile()) {
      const dot = e.name.lastIndexOf('.')
      if (dot !== -1 && EXT.has(e.name.slice(dot))) out.push(join(dir, e.name))
    }
  }
}

const files = []
for (const dir of SCOPED_DIRS) collect(dir, files)
for (const arg of process.argv.slice(2)) {
  const p = resolve(arg)
  if (existsSync(p) && statSync(p).isFile() && !files.includes(p)) files.push(p)
}

let violations = 0
for (const file of files) {
  let lines
  try {
    lines = readFileSync(file, 'utf8').split('\n')
  } catch {
    continue
  }
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        violations++
        console.error(`✗ ${relative(root, file)}:${i + 1}  ${rule.name}`)
        console.error(`    ${line.trim()}`)
        console.error(`    → ${rule.fix}`)
      }
    }
  })
}

if (violations > 0) {
  console.error(
    `\n${violations} motion-vocabulary violation(s). See docs/MOTION.md for the allowed tokens.`
  )
  process.exit(1)
}
console.log(`✓ motion vocabulary OK (${files.length} file(s) scanned in packages/ui + apps/web)`)
process.exit(0)
