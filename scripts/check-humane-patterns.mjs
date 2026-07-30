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
 *     ✗ ratio scorekeeping   → reciprocity is legible, never scored; show
 *                              stewardship, not standing (exploration 0352)
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
// `site/` is in scope too (exploration 0257): the essays that preach "no dark
// patterns" ship from the marketing site, so its UI code must clear the same
// bar as the app. Only .ts/.tsx are scanned, so the essays' prose (.astro/.md)
// is untouched — the gate guards code, not copy.
const SURPLUS_ROOTS = [join(root, 'packages'), join(root, 'apps'), join(root, 'site')]
const DARK_DIR_MARKERS = [
  `${join('packages', 'ui', 'src')}`,
  `${join('packages', 'react', 'src')}`,
  `${join('apps', 'web', 'src')}`,
  `${join('site', 'src')}`
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
    // The Oink lesson (exploration 0352): ratio economies turned generosity into
    // scorekeeping and scorekeeping into anxiety. Stewardship surfaces may show
    // care ("held this space 340 days"), never standing ("#14 in this space").
    name: 'ratio scorekeeping',
    group: 'dark-pattern',
    re: /\b(shareRatio|uploadRatio|seedRatio|leaderboard|userRank|rankBadge)\b/i,
    fix: 'show stewardship, never standing — reciprocity is legible, not scored (docs/VIBE.md)'
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

/** Whether a filename is an in-scope source file (right extension, not a test). */
function isScannableFile(name, full) {
  const dot = name.lastIndexOf('.')
  if (dot === -1 || !EXT.has(name.slice(dot))) return false
  return !SKIP_FILE.test(full)
}

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
      if (!SKIP_DIRS.has(e.name)) collect(full, out)
    } else if (e.isFile() && isScannableFile(e.name, full)) {
      out.push(full)
    }
  }
}

function isDarkScope(file) {
  return DARK_DIR_MARKERS.some((marker) => file.includes(marker))
}

/** A bare `humane-ok` (no reason) is itself a violation — exceptions must be justified. */
function isBareOk(line) {
  return HUMANE_OK_BARE.test(line) && !HUMANE_OK.test(line)
}

/** A reasoned humane-ok on the line or the one above suppresses a match. */
function isSuppressed(line, prevLine) {
  return hasReasonedOk(line) || hasReasonedOk(prevLine)
}

/** Violations for a single line (no line numbers; the caller stamps those). */
function scanLine(line, prevLine, dark) {
  const out = []
  if (isBareOk(line)) {
    out.push({
      rule: 'humane-ok without a reason',
      fix: 'add a reason: /* humane-ok: why this is honest */',
      text: line.trim()
    })
  }
  if (isSuppressed(line, prevLine)) return out
  for (const rule of RULES) {
    if (rule.group === 'dark-pattern' && !dark) continue
    if (rule.re.test(line)) out.push({ rule: rule.name, fix: rule.fix, text: line.trim() })
  }
  return out
}

/**
 * Scan one file's text. Pure (no I/O) so --selftest can exercise it directly.
 * @returns {{ line: number, rule: string, fix: string, text: string }[]}
 */
export function scanText(content, { dark }) {
  const lines = content.split('\n')
  const violations = []
  lines.forEach((line, i) => {
    for (const v of scanLine(line, i > 0 ? lines[i - 1] : '', dark)) {
      violations.push({ line: i + 1, ...v })
    }
  })
  return violations
}

function hasReasonedOk(line) {
  if (!line) return false
  const match = HUMANE_OK.exec(line)
  return Boolean(match && match[1] && match[1].trim().length > 0)
}

/** A resolved path that exists, is a file, and isn't already collected. */
function isNewFile(p, files) {
  return existsSync(p) && statSync(p).isFile() && !files.includes(p)
}

/** All in-scope files plus any extra paths passed on the CLI. */
function collectFiles(extraPaths) {
  const files = []
  for (const dir of SURPLUS_ROOTS) collect(dir, files)
  for (const arg of extraPaths) {
    const p = resolve(arg)
    if (isNewFile(p, files)) files.push(p)
  }
  return files
}

function printViolation(file, v) {
  console.error(`✗ ${relative(root, file)}:${v.line}  ${v.rule}`)
  console.error(`    ${v.text}`)
  console.error(`    → ${v.fix}`)
}

function runScan(extraPaths) {
  const files = collectFiles(extraPaths)
  let violations = 0
  for (const file of files) {
    let content
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const v of scanText(content, { dark: isDarkScope(file) })) {
      violations++
      printViolation(file, v)
    }
  }

  if (violations > 0) {
    console.error(
      `\n${violations} humane-pattern violation(s). See docs/CHARTER.md for the commitments and the humane-ok escape hatch.`
    )
    return 1
  }
  console.log(`✓ humane patterns OK (${files.length} file(s) scanned in packages + apps + site)`)
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
      label: 'flags ratio scorekeeping in a UI file',
      dark: true,
      text: 'const leaderboard = rankMembers(members)',
      expect: (v) => v.some((x) => x.rule === 'ratio scorekeeping')
    },
    {
      label: 'aspect-ratio style code is not ratio scorekeeping',
      dark: true,
      text: 'const aspectRatio = width / height',
      expect: (v) => v.length === 0
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
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]).endsWith('check-humane-patterns.mjs')
if (invokedDirectly) {
  const args = process.argv.slice(2)
  const exit = args.includes('--selftest') ? runSelfTest() : runScan(args)
  process.exit(exit)
}
