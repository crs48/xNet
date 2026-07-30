#!/usr/bin/env node
/**
 * Run the dev hub on **Electron's** Node runtime instead of the system one.
 *
 * pnpm links a single physical `better-sqlite3` into both `apps/electron` and
 * `packages/hub` (one entry in `node_modules/.pnpm`, two symlinks), and a
 * native module has exactly one compiled ABI at a time. `dev:electron` rebuilds
 * that copy for Electron's ABI, so `pnpm dev` — which starts the hub and the
 * app together — used to kill the hub on boot:
 *
 *   Error: The module '…/better_sqlite3.node' was compiled against a different
 *   Node.js version using NODE_MODULE_VERSION 130. This version of Node.js
 *   requires NODE_MODULE_VERSION 131.
 *
 * Rebuilding for both ABIs is not possible; the two processes have to agree on
 * one. Electron's is the one that must win — the app cannot load a Node-ABI
 * binary — so the dev hub adopts it via `ELECTRON_RUN_AS_NODE=1`, which runs
 * the Electron binary as a plain Node process. It is the same runtime the
 * desktop app's own main process uses, and it is within the repo's supported
 * range (`engines.node >= 20`; Electron 33 ships Node 20.18).
 *
 * This is the dev sidecar only. `pnpm --filter @xnetjs/hub dev` still runs the
 * hub on the system Node, which is correct when Electron is not in the picture.
 *
 * Run: `node scripts/run-dev-hub.mjs` from apps/electron.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(here, '..')
const hubDir = resolve(appDir, '../../packages/hub')

const require = createRequire(import.meta.url)

/** Resolve a path, or exit with a message that names the actual missing piece. */
function required(what, resolver) {
  try {
    const path = resolver()
    if (typeof path !== 'string' || !existsSync(path)) {
      throw new Error(`resolved to ${String(path)}, which does not exist`)
    }
    return path
  } catch (err) {
    console.error(`[hub] cannot start: ${what} — ${err.message}`)
    console.error('[hub] run `pnpm install` from the repo root, then retry.')
    process.exit(1)
  }
}

// `electron`'s main export is the path to its binary.
const electronBinary = required('Electron binary not found', () => require('electron'))
const tsxCli = required('tsx not found in packages/hub', () =>
  createRequire(resolve(hubDir, 'package.json')).resolve('tsx/cli')
)

const child = spawn(electronBinary, [tsxCli, 'src/cli.ts'], {
  cwd: hubDir,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})

// concurrently -k kills the group; forward so the hub shuts down cleanly.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('error', (err) => {
  console.error(`[hub] failed to spawn Electron as Node: ${err.message}`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
