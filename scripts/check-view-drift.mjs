#!/usr/bin/env node
/**
 * Warn when one side of a known web ↔ desktop component fork changes without
 * its twin (exploration 0276, Theme 3).
 *
 * A handful of components exist as deliberate forks in BOTH
 * apps/web/src/components and apps/electron/src/renderer/components. Their
 * shared logic now lives in packages (usePageComments, DataWorkspaceBody, …),
 * but the per-app chrome still comes in pairs — and history shows the pairs
 * drift silently: PageView reached ~93% identical copies with ZERO shared
 * commits before 0276 extracted the common core.
 *
 * This tripwire looks at a git diff and, when it touches one side of a known
 * pair but not the other, prints a WARNING naming the untouched twin. It is
 * advisory by default (exit 0) so intentionally one-sided changes stay cheap;
 * `--strict` turns warnings into failures for use as a gate.
 *
 * Usage:
 *   node scripts/check-view-drift.mjs                 # staged changes (git diff --cached)
 *   node scripts/check-view-drift.mjs --base main     # changes vs. a base ref
 *   node scripts/check-view-drift.mjs --strict        # exit 1 on warnings
 *
 * (or `pnpm check:view-drift`)
 */
import { execFileSync } from 'node:child_process'

const WEB_COMPONENTS = 'apps/web/src/components'
const ELECTRON_COMPONENTS = 'apps/electron/src/renderer/components'

// Known duplicated pairs: <name>.tsx exists (on purpose) in both component
// trees. Add here when a new deliberate fork lands; remove when a fork is
// dissolved into a shared package.
const PAIRED_COMPONENTS = [
  'PageView',
  'DataWorkspaceView',
  'CanvasView',
  'DatabaseView',
  'PluginManager',
  'AddSharedDialog',
  'ShareButton',
  'PresenceAvatars',
  'BundledPluginInstaller'
]

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const strict = args.includes('--strict')
const baseIndex = args.indexOf('--base')
const baseRef = baseIndex !== -1 ? args[baseIndex + 1] : null
if (baseIndex !== -1 && !baseRef) {
  console.error('✗ view drift: --base requires a git ref argument')
  process.exit(2)
}

// ── Collect changed files ────────────────────────────────────────────────────
function changedFiles() {
  const diffArgs = baseRef
    ? ['diff', '--name-only', `${baseRef}...HEAD`]
    : ['diff', '--name-only', '--cached']
  try {
    return execFileSync('git', diffArgs, { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch (error) {
    console.error(`✗ view drift: git ${diffArgs.join(' ')} failed: ${error.message}`)
    process.exit(2)
  }
}

const changed = new Set(changedFiles())

// ── Check pairs ──────────────────────────────────────────────────────────────
const warnings = []
for (const name of PAIRED_COMPONENTS) {
  const webPath = `${WEB_COMPONENTS}/${name}.tsx`
  const electronPath = `${ELECTRON_COMPONENTS}/${name}.tsx`
  const webChanged = changed.has(webPath)
  const electronChanged = changed.has(electronPath)

  if (webChanged && !electronChanged) {
    warnings.push(`${name}: ${webPath} changed but its desktop twin (${electronPath}) did not`)
  } else if (electronChanged && !webChanged) {
    warnings.push(`${name}: ${electronPath} changed but its web twin (${webPath}) did not`)
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
const source = baseRef ? `vs ${baseRef}` : 'staged'
if (warnings.length > 0) {
  for (const w of warnings) console.warn(`⚠ view drift (${source}): ${w}`)
  console.warn(
    '  → These components are known web/desktop forks (0276). If the change is\n' +
      '    shared behavior, port it to the twin (or better: lift it into the\n' +
      '    shared core in packages/editor or packages/views). If it is truly\n' +
      '    platform-specific, ignore this warning.'
  )
  process.exit(strict ? 1 : 0)
}

console.log(
  `✓ view drift OK (${source}) — ${PAIRED_COMPONENTS.length} paired components checked`
)
process.exit(0)
