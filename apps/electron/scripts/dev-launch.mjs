#!/usr/bin/env node
/**
 * Resolve the dev scope once, inject it, run the dev command, and prove the
 * result is ours before saying "ready" (0413).
 *
 * Three jobs, all of which used to be nobody's:
 *
 *  1. **Scope injection.** `dev-scope.mjs` resolves the profile and port block
 *     exactly once, here, and exports them as the env vars the app already
 *     read. Nothing downstream calls `process.cwd()`.
 *
 *  2. **CDP identity assertion.** The failure this whole exploration is about
 *     is attaching to a *healthy* app that belongs to another worktree. After
 *     boot, `/json/list` must show a target served from **our** renderer port.
 *     Because renderer ports are now unique per worktree, that is a complete
 *     check, and it costs one HTTP request.
 *
 *  3. **A machine-readable ready line.** `[xnet-dev] ready {…}` gives an agent
 *     the same "wait until it is actually up" affordance Vite gives the web
 *     loop, and tells it which ports to attach to without parsing prose.
 *
 * If the probe fails the run does **not** quietly continue: it prints a FATAL
 * naming what it found instead, and exits non-zero. A dev server that is up but
 * unverifiable is exactly the state that produced false verifications.
 *
 * Run: `node scripts/dev-launch.mjs <command> [args…]` from apps/electron.
 */
import { spawn } from 'node:child_process'
import { resolveDevScope, scopeEnv } from './dev-scope.mjs'

const PROBE_TIMEOUT_MS = Number(process.env.XNET_DEV_PROBE_TIMEOUT_MS || 90_000)
const PROBE_INTERVAL_MS = 500

const argv = process.argv.slice(2)
const probeIndex = argv.indexOf('--no-probe')
const shouldProbe = probeIndex === -1
if (!shouldProbe) argv.splice(probeIndex, 1)

if (argv.length === 0) {
  console.error('[xnet-dev] usage: node scripts/dev-launch.mjs [--no-probe] <command> [args…]')
  process.exit(2)
}

const scope = resolveDevScope()
const injected = scopeEnv(scope)

console.log(
  `[xnet-dev] profile ${scope.profile}` +
    (scope.scoped ? ` (worktree ${scope.worktree})` : ' (main checkout — legacy ports)')
)
console.log(
  `[xnet-dev] renderer ${scope.ports.renderer} · cdp ${scope.ports.cdp} · ` +
    `hub ${scope.ports.hub} · localApi ${scope.ports.localApi}`
)

const child = spawn(argv[0], argv.slice(1), {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { ...process.env, ...injected },
  shell: process.platform === 'win32'
})

let exiting = false
function shutdown(signal) {
  if (exiting) return
  exiting = true
  child.kill(signal)
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal))
}

child.on('error', (err) => {
  console.error(`[xnet-dev] failed to spawn ${argv[0]}: ${err.message}`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  exiting = true
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})

if (shouldProbe) void probeUntilReady()

/**
 * The CDP targets currently served on `port`, or `null` while nothing answers.
 * A non-answering port is "not up yet"; a port answering with someone else's
 * renderer is a hard failure, and the caller distinguishes them.
 */
async function cdpTargets(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(2000)
    })
    if (!response.ok) return null
    const body = await response.json()
    return Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

function rendererPortOf(target) {
  try {
    return new URL(target.url).port
  } catch {
    return null
  }
}

async function probeUntilReady() {
  const deadline = Date.now() + PROBE_TIMEOUT_MS
  const want = String(scope.ports.renderer)

  while (Date.now() < deadline && !exiting) {
    const targets = await cdpTargets(scope.ports.cdp)

    if (targets && targets.length > 0) {
      const ours = targets.filter((t) => rendererPortOf(t) === want)
      if (ours.length > 0) {
        console.log(
          `[xnet-dev] ready ${JSON.stringify({
            profile: scope.profile,
            worktree: scope.worktree,
            branch: scope.branch,
            commit: scope.commit,
            ...scope.ports
          })}`
        )
        return
      }

      // Something is on our CDP port, and it is not us. This is the bug.
      const seen = targets.map((t) => t.url).join(', ')
      console.error(
        `[xnet-dev] FATAL: :${scope.ports.cdp} is serving ${seen || '(no targets)'}, ` +
          `not our renderer on :${want}.\n` +
          `[xnet-dev]   Another instance owns this port. Refusing to report ready — ` +
          `an agent attaching here would drive the wrong app.\n` +
          `[xnet-dev]   Check: lsof -ti :${scope.ports.cdp}`
      )
      shutdown('SIGTERM')
      process.exitCode = 1
      return
    }

    await new Promise((r) => setTimeout(r, PROBE_INTERVAL_MS))
  }

  if (exiting) return
  console.error(
    `[xnet-dev] FATAL: nothing answered CDP on :${scope.ports.cdp} within ` +
      `${Math.round(PROBE_TIMEOUT_MS / 1000)}s. The app did not reach a ` +
      `drivable state; not reporting ready.`
  )
  shutdown('SIGTERM')
  process.exitCode = 1
}
