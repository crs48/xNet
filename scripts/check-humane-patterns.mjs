#!/usr/bin/env node
/**
 * Enforce the Humane Internet Charter's machine-checkable commitments
 * (exploration 0234, docs/CHARTER.md). This is the sibling of
 * check-motion-vocab.mjs: it fails CI on the primitives of extraction so the
 * charter's "Calm" and "Own" commitments can't quietly regress.
 *
 * Two rule groups:
 *
 *   dark-pattern  (scoped to UI surfaces: packages/ui, packages/react, apps/web)
 *     ✗ infinite scroll      → design for an end; virtualize instead of an
 *                              engagement-driven endless feed
 *     ✗ streak counters      → gamified streaks weaponize loss aversion
 *     ✗ confirmshaming       → don't shame the user out of a choice they made
 *
 *   surplus       (scoped to all of packages/ + apps/)
 *     ✗ third-party ad/analytics SDKs (gtag, fbq, Segment, Mixpanel,
 *       Amplitude SDK, Hotjar, FullStory, Google Analytics/Tag Manager)
 *       → there is no behavioral-surplus pipeline; consent-gated, scrubbed,
 *         k-anon telemetry (@xnetjs/telemetry) is the only path off device.
 *
 * Escape hatch: a `/* humane-ok: <reason> *​/` comment on the offending line or
 * the line directly above it suppresses that match. The reason is REQUIRED — a
 * bare `humane-ok` with no reason is itself a violation.
 *
 * Run: `node scripts/check-humane-patterns.mjs` (or `pnpm check:humane-patterns`).
 *      `node scripts/check-humane-patterns.mjs --selftest`  (verifies the gate
 *      catches planted violations and honors humane-ok — the "Lint proves Calm"
 *      check from exploration 0234).
 * Pass extra file paths as args to scan them too.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

const root = resolve(process.cwd())

// Surplus rules scan everything that ships; dark-pattern rules scan only the
// UI-bearing surfaces (matching check-motion-vocab's scope philosophy).
const SURPLUS_ROOTS = [join(root, 'packages'), join(root, 'apps')]
const DARK_DIR_MARKERS = [
  `${join('packages', 'ui', 'src')}`,
  `${join('packages', 'react', 'src')}`,
  `${join('apps', 'web', 'src')}`
]

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.turbo', 'coverage', 'build'])
const EXT = new Set(['.ts', '.tsx'])
// Test/story/fixture files legitimately mention banned tokens (e.g. a scrubbing
// test feeding a fake analytics URL); they don't ship, so they're out of scope.
const SKIP_FILE = /\.(test|spec|stories)\.tsx?$|[/\\](__tests__|__mocks__|__fixtures__)[/\\]/

/** @type {{ name: string, group: 'dark-pattern' | 'surplus', re: RegExp, fix: string }[]} */
const RULES = [
  {
    name: 'infinite scroll',
    group: 'dark-pattern',
    re: /infinite[\s_-]?scroll/i,
    fix: 'design for an end — virtualize a bounded window instead of an endless feed (the feed uses @tanstack/react-virtual)'
  },
  {
    name: 'streak counter',
    group: 'dark-pattern',
    re: /\b(streakCount|streakCounter|streakDays|dailyStreak|loginStreak|currentStreak)\b/,
    fix: 'streaks weaponize loss aversion; track progress without a punishable chain'
  },
  {
    name: 'confirmshaming',
    group: 'dark-pattern',
    re: /\bconfirm[-_]?sham(?:e|ing)?\b/i,
    fix: "let the user decline plainly; don't guilt them out of their choice"
  },
  {
    name: 'third-party ad/analytics SDK',
    group: 'surplus',
    re: /@segment\/|google-analytics|googletagmanager|\bfbevents\b|\bfbq\(|\bgtag\(|\bmixpanel\b|@amplitude\/|cdn\.amplitude\.com|\bhotjar\b|\bfullstory\b/i,
    fix: 'no behavioral-surplus pipeline — route any metric through consent-gated @xnetjs/telemetry'
  }
]

const HUMANE_OK = /\/\*\s*humane-ok:\s*(.*?)\s*\*\//
const HUMANE_OK_BARE = /\/\*\s*humane-ok\s*\*\//

/** Recursively collect in-scope .ts/.tsx files under a directory. */
function collect(dir, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      collect(full, out)
    } else if (e.isFile()) {
      const dot = e.name.lastIndexOf('.')
      if (dot === -1 || !EXT.has(e.name.slice(dot))) continue
      if (SKIP_FILE.test(full)) continue
      out.push(full)
    }
  }
}

function isDarkScope(file) {
  return DARK_DIR_MARKERS.some((marker) => file.includes(marker))
}

/**
 * Scan one file's text. Pure (no I/O) so --selftest can exercise it directly.
 * @returns {{ line: number, rule: string, fix: string, text: string }[]}
 */
export function scanText(content, { dark }) {
  const lines = content.split('\n')
  const violations = []
  lines.forEach((line, i) => {
    // A bare `humane-ok` (no reason) is itself a violation — exceptions must
    // be justified.
    if (HUMANE_OK_BARE.test(line) && !HUMANE_OK.test(line)) {
      violations.push({
        line: i + 1,
        rule: 'humane-ok without a reason',
        fix: 'add a reason: /* humane-ok: why this is honest */',
        text: line.trim()
      })
    }
    const suppressed =
      hasReasonedOk(lines[i]) || (i > 0 && hasReasonedOk(lines[i - 1]))
    for (const rule of RULES) {
      if (rule.group === 'dark-pattern' && !dark) continue
      if (!rule.re.test(line)) continue
      if (suppressed) continue
      violations.push({ line: i + 1, rule: rule.name, fix: rule.fix, text: line.trim() })
    }
  })
  return violations
}

function hasReasonedOk(line) {
  if (!line) return false
  const match = HUMANE_OK.exec(line)
  return Boolean(match && match[1] && match[1].trim().length > 0)
}

function runScan(extraPaths) {
  const files = []
  for (const dir of SURPLUS_ROOTS) collect(dir, files)
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
    const found = scanText(content, { dark: isDarkScope(file) })
    for (const v of found) {
      violations++
      console.error(`✗ ${relative(root, file)}:${v.line}  ${v.rule}`)
      console.error(`    ${v.text}`)
      console.error(`    → ${v.fix}`)
    }
  }

  if (violations > 0) {
    console.error(
      `\n${violations} humane-pattern violation(s). See docs/CHARTER.md for the commitments and the humane-ok escape hatch.`
    )
    return 1
  }
  console.log(`✓ humane patterns OK (${files.length} file(s) scanned in packages + apps)`)
  return 0
}

/** Verify the scanner catches planted violations and honors humane-ok. */
function runSelfTest() {
  const cases = [
    {
      label: 'flags infinite scroll in a UI file',
      dark: true,
      text: 'const mode = "infinite-scroll"',
      expect: (v) => v.some((x) => x.rule === 'infinite scroll')
    },
    {
      label: 'flags a streak counter',
      dark: true,
      text: 'let dailyStreak = 0',
      expect: (v) => v.some((x) => x.rule === 'streak counter')
    },
    {
      label: 'flags a third-party analytics SDK anywhere',
      dark: false,
      text: "import mixpanel from 'mixpanel-browser'",
      expect: (v) => v.some((x) => x.rule === 'third-party ad/analytics SDK')
    },
    {
      label: 'honors a reasoned humane-ok on the line above',
      dark: true,
      text: '/* humane-ok: discussing why we avoid it */\nconst note = "infinite-scroll"',
      expect: (v) => v.length === 0
    },
    {
      label: 'rejects a bare humane-ok with no reason',
      dark: true,
      text: '/* humane-ok */\nconst note = "infinite-scroll"',
      expect: (v) => v.some((x) => x.rule === 'humane-ok without a reason')
    },
    {
      label: 'dark-pattern rules do not fire outside UI scope',
      dark: false,
      text: 'const mode = "infinite-scroll"',
      expect: (v) => v.length === 0
    },
    {
      label: 'clean code passes',
      dark: true,
      text: 'const items = useInfiniteQuery(opts) // virtualized window',
      expect: (v) => v.length === 0
    }
  ]

  let failures = 0
  for (const c of cases) {
    const found = scanText(c.text, { dark: c.dark })
    if (c.expect(found)) {
      console.log(`  ✓ ${c.label}`)
    } else {
      failures++
      console.error(`  ✗ ${c.label} — got ${JSON.stringify(found)}`)
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} self-test(s) failed.`)
    return 1
  }
  console.log(`\n✓ humane-patterns self-test passed (${cases.length} cases)`)
  return 0
}

// Only run as a CLI when invoked directly (keeps scanText importable for tests).
const invokedDirectly = process.argv[1] && resolve(process.argv[1]).endsWith('check-humane-patterns.mjs')
if (invokedDirectly) {
  const args = process.argv.slice(2)
  const exit = args.includes('--selftest') ? runSelfTest() : runScan(args)
  process.exit(exit)
}
