#!/usr/bin/env node
/**
 * Build the workspace packages the desktop app imports, before dev starts.
 *
 * `apps/electron` resolves most `@xnetjs/*` imports to built output —
 * `@xnetjs/plugins/node` is `dist/services/node.js`, not source. Nothing on the
 * dev path guaranteed that output was current: `pnpm dev` runs electron-vite
 * directly and never goes through turbo, so a freshly pulled `main` starts
 * against whatever `dist/` happens to be on disk.
 *
 * The failure mode is not a *missing* build, which would be obvious. It is a
 * *stale* one, and it surfaces as a lie about the source:
 *
 *     SyntaxError: The requested module '@xnetjs/plugins/node' does not
 *     provide an export named 'createAgentRetrieval'
 *
 * — while `packages/plugins/src/services/node.ts` exports exactly that. The
 * same staleness reaches the renderer as unresolved imports for dependencies
 * that are right there in `package.json`. Both read as "this code is broken"
 * when the truth is "this build is old", and the distance between those two
 * readings is the whole cost.
 *
 * turbo already knows whether the output is current — it content-hashes the
 * inputs. So delegate rather than re-derive: build the desktop app's
 * dependencies and let the cache decide what that means. A warm tree is ~1s
 * (`FULL TURBO`); a stale one pays exactly the work it owes and no more.
 *
 * This is the dev path only. `pnpm build` already runs under turbo, which
 * orders `^build` itself — adding a second turbo inside it would nest.
 *
 * Escape hatch: `XNET_SKIP_DEP_BUILD=1 pnpm dev` starts without the check.
 *
 * Run: `node scripts/build-workspace-deps.mjs` from apps/electron.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appDir, '../..')

if (process.env.XNET_SKIP_DEP_BUILD === '1') {
  console.log('[xnet-dev] XNET_SKIP_DEP_BUILD=1 — starting against whatever dist/ is on disk')
  process.exit(0)
}

const started = Date.now()

// `errors-only` keeps the warm path quiet (41 cached tasks is not news) while
// leaving a real build failure at full volume.
const result = spawnSync(
  'pnpm',
  ['exec', 'turbo', 'run', 'build', '--filter=xnet-desktop^...', '--output-logs=errors-only'],
  { cwd: repoRoot, stdio: 'inherit', shell: process.platform === 'win32' }
)

if (result.error) {
  console.error(`[xnet-dev] FATAL: could not run turbo — ${result.error.message}`)
  console.error('[xnet-dev]   Try: pnpm install, then pnpm build')
  process.exit(1)
}

if (result.status !== 0) {
  // Starting anyway is the one outcome worse than not starting: the app would
  // boot against half-current output and fail somewhere unrelated.
  console.error('[xnet-dev] FATAL: workspace dependencies failed to build (see above).')
  console.error(
    '[xnet-dev]   The desktop app imports built dist/, so dev cannot start on this tree.'
  )
  console.error(
    '[xnet-dev]   Override with XNET_SKIP_DEP_BUILD=1 if you know the failure is unrelated.'
  )
  process.exit(result.status ?? 1)
}

console.log(`[xnet-dev] workspace deps current (${((Date.now() - started) / 1000).toFixed(1)}s)`)
