#!/usr/bin/env node
/**
 * Enforce the canonical motion vocabulary (exploration 0199).
 *
 * Motion in xNet is a small, named vocabulary defined in
 * packages/ui/src/theme/motion.css and documented in docs/MOTION.md. This
 * guard keeps authors — human or AI — inside it by failing CI on the footguns.
 *
 * Rules come in two scopes, because they protect two different things:
 *
 *   'vocab'  — the design-token rules below. Only meaningful where the
 *              token-bearing Tailwind config is in play: `packages/ui/src` and
 *              `apps/web/src`. Other packages have their own design systems
 *              (e.g. the editor's --editor-* theme) and stay out of scope.
 *
 *   'global' — the bundle-weight rules (0422). These scan ALL of `packages/`
 *              and `apps/`, because a 34KB static import costs the same in
 *              packages/views as in apps/web, and the two call sites that
 *              legitimately use Motion (workbench TabBar, views BoardView)
 *              live outside the 'vocab' scope entirely. A guard that could not
 *              see them would not be a guard.
 *
 *   ✗ transition-all          → animates layout props off the compositor; name
 *                               the property: transition-base / -colors-fast /
 *                               transition-[opacity,transform] / transition-[width]
 *   ✗ duration-<ms> literal   → use duration-fast | duration-normal | duration-slow
 *   ✗ ease-bounce             → retired; use ease-out, or ease-spring for
 *                               direct-manipulation feedback
 *   ✗ animate-[…] arbitrary   → add a named primitive to motion.css instead
 *   ✗ import … 'motion/react' → ~34KB on the default path; go through
 *                               <MotionStage> and import `m` from
 *                               'motion/react-m' (the ~4.6KB shell, allowed)
 *   ✗ 'framer-motion'         → renamed to `motion`; same route as above
 *
 * Run: `node scripts/check-motion-vocab.mjs` (or `pnpm check:motion-vocab`).
 * Pass extra paths as args to scan them too.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

const root = resolve(process.cwd())
const SCOPED_DIRS = [join(root, 'packages/ui/src'), join(root, 'apps/web/src')]
/** Where the bundle-weight rules apply: every library and every surface. */
const WIDE_DIRS = [join(root, 'packages'), join(root, 'apps')]
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.turbo', 'coverage'])
const EXT = new Set(['.ts', '.tsx'])

/**
 * The banned patterns. Each entry: a name, a regex, a fix to suggest, and a
 * scope.
 *
 *   scope 'vocab'  — design-token rules. Only meaningful where the token-bearing
 *                    Tailwind config is in play, so they stay in SCOPED_DIRS.
 *   scope 'global' — bundle-weight rules. A 34KB import is just as expensive in
 *                    packages/views as in apps/web, so these scan WIDE_DIRS.
 */
const RULES = [
  {
    scope: 'vocab',
    name: 'transition-all',
    re: /\btransition-all\b/,
    fix: 'name the property: transition-base, transition-colors-fast, or transition-[opacity,transform] / transition-[width]'
  },
  {
    scope: 'vocab',
    name: 'raw duration literal',
    re: /\bduration-(?:75|100|150|200|300|500|700|1000)\b/,
    fix: 'use a token: duration-fast (100), duration-normal (150), or duration-slow (200)'
  },
  {
    scope: 'vocab',
    name: 'ease-bounce',
    re: /\bease-bounce\b/,
    fix: 'retired — use ease-out, or ease-spring for direct-manipulation feedback'
  },
  {
    scope: 'vocab',
    name: 'arbitrary animate-[…]',
    re: /\banimate-\[/,
    fix: 'add a named primitive to packages/ui/src/theme/motion.css instead'
  },
  {
    // The full motion/react barrel is ~34KB and pulls the eager `motion`
    // component. It may only be reached through the dynamic import() inside
    // MotionStage, which keeps it in its own chunk. `motion/react-m` (~4.6KB
    // shell) and `motion/react-mini` (2.3KB) are deliberately NOT matched —
    // the trailing quote in the pattern stops at `react`, and those shells are
    // the whole reason the LazyMotion split exists.
    //
    // This matches import STATEMENTS only; `await import('motion/react')` is an
    // expression and does not start a line with `import <specifier>`.
    scope: 'global',
    name: 'static motion/react import',
    re: /^\s*(?:import|export)\s[^\n]*?['"]motion\/react['"]/,
    fix: "reach it via <MotionStage> (packages/ui/src/motion/MotionStage.tsx), and import `m` from 'motion/react-m' — see docs/MOTION.md"
  },
  {
    scope: 'global',
    name: 'framer-motion (superseded)',
    re: /['"]framer-motion['"]/,
    fix: "framer-motion was renamed to `motion`; use <MotionStage> + 'motion/react-m' (docs/MOTION.md)"
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

// Bundle-weight rules scan every package and app, not just the token-bearing
// surfaces — importing 34KB is expensive wherever it happens.
const wideFiles = []
for (const dir of WIDE_DIRS) collect(dir, wideFiles)

for (const arg of process.argv.slice(2)) {
  const p = resolve(arg)
  if (existsSync(p) && statSync(p).isFile()) {
    if (!files.includes(p)) files.push(p)
    if (!wideFiles.includes(p)) wideFiles.push(p)
  }
}

/** Every file we must read, mapped to the rules that apply to it. */
const scanned = new Map()
for (const f of wideFiles) scanned.set(f, ['global'])
for (const f of files) scanned.set(f, scanned.has(f) ? ['global', 'vocab'] : ['vocab'])

let violations = 0
for (const [file, scopes] of scanned) {
  let lines
  try {
    lines = readFileSync(file, 'utf8').split('\n')
  } catch {
    continue
  }
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (!scopes.includes(rule.scope)) continue
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
console.log(
  `✓ motion vocabulary OK (${files.length} file(s) for token rules in packages/ui + apps/web; ` +
    `${scanned.size} for import rules across packages + apps)`
)
process.exit(0)
