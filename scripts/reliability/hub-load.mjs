#!/usr/bin/env node
/**
 * Hub ingest load smoke — operational wrapper (exploration 0272, Pillar 5).
 *
 * The load logic lives in tests/reliability/hub/hub-load.test.ts (it needs
 * the TypeScript workspace: real signed changes, the real hub). This wrapper
 * exists so operators and the soak workflow can scale it without remembering
 * vitest incantations:
 *
 *   node scripts/reliability/hub-load.mjs --clients 32 --changes 100 [--soak]
 *
 * Any exit code other than 0 means correctness failed under load (dropped,
 * duplicated, or corrupted changes), not merely "it was slow".
 */

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

function parseArgs(argv) {
  const args = { clients: null, changes: null, soak: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--clients') args.clients = argv[++i]
    else if (argv[i] === '--changes') args.changes = argv[++i]
    else if (argv[i] === '--soak') args.soak = true
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const env = { ...process.env }
if (args.clients) env.XNET_HUB_CLIENTS = args.clients
if (args.changes) env.XNET_HUB_CHANGES = args.changes
if (args.soak) env.XNET_SOAK = '1'

const child = spawn(
  'pnpm',
  ['exec', 'vitest', 'run', '--project', 'reliability', 'tests/reliability/hub/hub-load.test.ts'],
  { cwd: ROOT, env, stdio: 'inherit' }
)
child.on('exit', (code) => process.exit(code ?? 1))
