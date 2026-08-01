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
 *      `node scripts/check-motion-vocab.mjs --selftest`  (the negative control —
 *      verifies the gate still catches planted violations, exploration 0430).
 * Pass extra paths as args to scan them too.
 *
 * Why the self-test exists: a clean scan has exactly one observable state, and
 * "the codebase is clean" and "this regex stopped matching after a rename" are
 * both consistent with it. The control plants violations the gate MUST flag, so
 * green means something. Fixtures are in-memory strings, never files on disk —
 * an on-disk fixture would have to be excluded from the production glob, and
 * that exclusion is one more thing that can silently break.
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

/**
 * Scan one file's text. Pure (no I/O) so --selftest can exercise it directly.
 * @returns {{ line: number, rule: string, fix: string, text: string }[]}
 */
export function scanText(content) {
  const violations = []
  content.split('\n').forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        violations.push({ line: i + 1, rule: rule.name, fix: rule.fix, text: line.trim() })
      }
    }
  })
  return violations
}

function runScan(extraPaths) {
  const files = []
  for (const dir of SCOPED_DIRS) collect(dir, files)
  for (const arg of extraPaths) {
    const p = resolve(arg)
    if (existsSync(p) && statSync(p).isFile() && !files.includes(p)) files.push(p)
  }

  let violations = 0
  for (const file of files) {
    let content
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const v of scanText(content)) {
      violations++
      console.error(`✗ ${relative(root, file)}:${v.line}  ${v.rule}`)
      console.error(`    ${v.text}`)
      console.error(`    → ${v.fix}`)
    }
  }

  if (violations > 0) {
    console.error(
      `\n${violations} motion-vocabulary violation(s). See docs/MOTION.md for the allowed tokens.`
    )
    return 1
  }
  console.log(`✓ motion vocabulary OK (${files.length} file(s) scanned in packages/ui + apps/web)`)
  return 0
}

/**
 * The negative control: planted violations the gate must still catch, plus the
 * near-misses it must NOT (a broadened regex is as broken as a dead one).
 */
function runSelfTest() {
  const cases = [
    {
      label: 'flags transition-all',
      text: '<div className="transition-all duration-fast" />',
      expect: (v) => v.some((x) => x.rule === 'transition-all')
    },
    {
      label: 'flags a raw duration literal',
      text: '<div className="transition-base duration-300" />',
      expect: (v) => v.some((x) => x.rule === 'raw duration literal')
    },
    {
      label: 'flags retired ease-bounce',
      text: 'const cls = "ease-bounce"',
      expect: (v) => v.some((x) => x.rule === 'ease-bounce')
    },
    {
      label: 'flags an arbitrary animate-[…]',
      text: '<div className="animate-[wiggle_1s_ease-in-out]" />',
      expect: (v) => v.some((x) => x.rule === 'arbitrary animate-[…]')
    },
    {
      label: 'reports the 1-based line of a violation',
      text: 'const a = 1\nconst b = "transition-all"',
      expect: (v) => v.length === 1 && v[0].line === 2
    },
    // Near-misses. Each of these once looked like a violation to a sloppier
    // regex; they pin the boundary so a future widening fails here first.
    {
      label: 'named duration tokens pass',
      text: '<div className="transition-base duration-fast" />',
      expect: (v) => v.length === 0
    },
    {
      label: 'a named animate- primitive is not arbitrary',
      text: '<div className="animate-fade-in" />',
      expect: (v) => v.length === 0
    },
    {
      label: 'ease-out and ease-spring are allowed',
      text: '<div className="ease-out md:ease-spring" />',
      expect: (v) => v.length === 0
    },
    {
      label: 'a property-named transition passes',
      text: '<div className="transition-[opacity,transform]" />',
      expect: (v) => v.length === 0
    },
    {
      label: 'an unrelated duration-like number passes',
      text: 'const timeoutMs = 300',
      expect: (v) => v.length === 0
    }
  ]

  let failures = 0
  for (const c of cases) {
    const found = scanText(c.text)
    if (c.expect(found)) {
      console.log(`  ✓ ${c.label}`)
    } else {
      failures++
      console.error(`  ✗ ${c.label} — got ${JSON.stringify(found)}`)
    }
  }
  if (failures > 0) {
    console.error(
      `\n${failures} self-test(s) failed — the GATE is broken, not the codebase.\n` +
        '  A motion-vocab rule stopped matching what it claims to match, so a\n' +
        '  clean run no longer proves anything. Fix the rule, not the fixture.'
    )
    return 1
  }
  console.log(`\n✓ motion-vocab self-test passed (${cases.length} cases)`)
  return 0
}

// Only run as a CLI when invoked directly (keeps scanText importable for tests).
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]).endsWith('check-motion-vocab.mjs')
if (invokedDirectly) {
  const args = process.argv.slice(2)
  process.exit(args.includes('--selftest') ? runSelfTest() : runScan(args))
}
