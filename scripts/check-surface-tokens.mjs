#!/usr/bin/env node
/**
 * Enforce the two-plane surface doctrine (exploration 0299).
 *
 * Workbench backgrounds come from the token system in
 * packages/ui/src/theme/tokens.css — Plane A `--canvas` for the base surface,
 * Plane B `--island-b` for everything floating. Raw Tailwind palette
 * backgrounds (`bg-white`, `bg-gray-900`, …) and inline hex/hsl backgrounds
 * bypass both planes and are exactly how the pre-0299 drift happened
 * (DatabaseView's `bg-white dark:bg-gray-900` popovers).
 *
 * Two enforcement tiers (0294: gates must be decidable):
 *   - HARD-ZERO in apps/web/src, packages/ui/src, packages/devtools/src,
 *     packages/react/src — any hit fails, unless the line matches an
 *     ALLOWLIST entry (media letterboxes, QR quiet zones, pre-theme boot
 *     screens, literal color swatches).
 *   - RATCHET in packages/views/src — a legacy raw-palette reservoir; the
 *     violation count may only go down. Lower VIEWS_BASELINE when you clean
 *     some up (on-touch, per CLAUDE.md).
 *
 * Opacity-suffixed palette classes (`bg-black/20` scrims, `bg-white/10`
 * washes) are translucent tints, not surface fills, and are allowed.
 *
 * Run: `node scripts/check-surface-tokens.mjs` (or `pnpm check:surface-tokens`).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

const root = resolve(process.cwd())
const HARD_ZERO_DIRS = [
  'apps/web/src',
  'packages/ui/src',
  'packages/devtools/src',
  'packages/react/src'
]
const RATCHET_DIR = 'packages/views/src'
/** Raw-palette background count in packages/views/src as of 0299. Only goes down. */
const VIEWS_BASELINE = 183
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.turbo', 'coverage'])
const EXT = new Set(['.ts', '.tsx'])
const SKIP_FILE = /\.(test|stories)\.(ts|tsx)$/

const RULES = [
  {
    name: 'raw palette background class',
    // bg-white / bg-black / bg-gray-900 etc.; an opacity suffix (bg-black/20)
    // marks a translucent scrim, not a surface fill — allowed.
    re: /\bbg-(?:white|black|gray-\d+|slate-\d+|zinc-\d+|neutral-\d+|stone-\d+)\b(?!\/)/,
    fix: 'use a surface token: bg-canvas / bg-island-b / bg-popover / bg-surface-* / bg-accent (see packages/ui/src/theme/tokens.css)'
  },
  {
    name: 'inline raw background',
    re: /background(?:Color)?:\s*['"]?(?:#[0-9a-fA-F]{3}|hsl\(\s*\d|rgb\(\s*\d|white\b|black\b)/,
    fix: "use hsl(var(--token)) or a bg-* utility so light/dark both resolve"
  }
]

/** Intentional raw colors — each entry allows lines matching `re` in `file`. */
const ALLOWLIST = [
  { file: 'apps/web/src/comms/CallDock.tsx', re: /bg-black/, why: 'video tile letterbox' },
  { file: 'apps/web/src/components/ShareDialog.tsx', re: /bg-white p-1/, why: 'QR code quiet zone must stay white' },
  { file: 'apps/web/src/components/LabView.tsx', re: /bg-white/, why: 'sandboxed iframe backing (unthemed document)' },
  { file: 'apps/web/src/routes/stories.tsx', re: /bg-white/, why: 'storybook iframe backing (unthemed until it loads)' },
  { file: 'apps/web/src/routes/settings.tsx', re: /bg-black|background: 'hsl/, why: 'theme-variant color swatches (literal samples)' },
  { file: 'apps/web/src/lib/boot-diagnostics.ts', re: /background:#/, why: 'pre-theme boot error screen (tokens not loaded yet)' },
  { file: 'packages/react/src/components/ErrorBoundary.tsx', re: /background: '#/, why: 'crash screen renders outside the themed tree' },
  { file: 'packages/react/src/components/OfflineIndicator.tsx', re: /background: '#/, why: 'renders outside the themed tree' },
  { file: 'packages/react/src/components/SavedViewRunner.tsx', re: /bg-black/, why: 'media/video letterbox' },
  { file: 'packages/react/src/components/SavedViewVisualFeed.tsx', re: /bg-black/, why: 'media/video letterbox' }
]

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
      if (dot !== -1 && EXT.has(e.name.slice(dot)) && !SKIP_FILE.test(e.name)) {
        out.push(join(dir, e.name))
      }
    }
  }
}

function allowed(relFile, line) {
  return ALLOWLIST.some((a) => relFile === a.file && a.re.test(line))
}

function scan(dirs, { report }) {
  const files = []
  for (const dir of dirs) collect(join(root, dir), files)
  let count = 0
  for (const file of files) {
    const relFile = relative(root, file)
    let lines
    try {
      lines = readFileSync(file, 'utf8').split('\n')
    } catch {
      continue
    }
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        if (rule.re.test(line) && !allowed(relFile, line)) {
          count++
          if (report) {
            console.error(`✗ ${relFile}:${i + 1}  ${rule.name}`)
            console.error(`    ${line.trim()}`)
            console.error(`    → ${rule.fix}`)
          }
        }
      }
    })
  }
  return { count, fileCount: files.length }
}

const hard = scan(HARD_ZERO_DIRS, { report: true })
const ratchet = scan([RATCHET_DIR], { report: false })

let failed = false
if (hard.count > 0) {
  console.error(
    `\n${hard.count} raw background(s) in hard-zero scope. Use surface tokens, or add a justified ALLOWLIST entry.`
  )
  failed = true
}
if (ratchet.count > VIEWS_BASELINE) {
  console.error(
    `\npackages/views raw-background count grew: ${ratchet.count} > baseline ${VIEWS_BASELINE}. Use surface tokens in new/edited code.`
  )
  failed = true
} else if (ratchet.count < VIEWS_BASELINE) {
  console.log(
    `packages/views ratchet can tighten: ${ratchet.count} < baseline ${VIEWS_BASELINE} — lower VIEWS_BASELINE in scripts/check-surface-tokens.mjs.`
  )
}

if (failed) process.exit(1)
console.log(
  `✓ surface tokens OK (${hard.fileCount} file(s) hard-zero scanned; views ratchet ${ratchet.count}/${VIEWS_BASELINE})`
)
process.exit(0)
