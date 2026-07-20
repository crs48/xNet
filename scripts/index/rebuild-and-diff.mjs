#!/usr/bin/env node
/**
 * The mirror-not-master receipt, executable (explorations 0366/0374/0383 W3).
 *
 * Rebuild the public atproto index TWICE from live inputs via the hub's own
 * engine (`xnet hub --role index` uses exactly this path) and diff the two
 * canonical artifacts. Byte-identical output proves the index is a pure
 * function of public records — anyone can run their own with one flag.
 *
 * The deterministic form of this check runs in CI on fixtures
 * (`packages/hub/test/index-role.test.ts`); this script is the same property
 * against the live network, for a stranger or a scheduled soak — NOT a
 * per-PR gate (0294: network flake must not red unrelated PRs).
 *
 * Usage: node scripts/index/rebuild-and-diff.mjs [relayUrl]
 * Zero-dep apart from the built hub package (pnpm --filter @xnetjs/hub build).
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { AtprotoIndexService } = await import('../../packages/hub/dist/index.js').catch(() => {
  console.error('Build the hub first: pnpm --filter @xnetjs/hub build')
  process.exit(1)
})

const relayUrl = process.argv[2] ?? 'https://relay1.us-west.bsky.network'

const rebuild = async (label) => {
  const svc = new AtprotoIndexService(mkdtempSync(join(tmpdir(), 'xnet-idx-diff-')), {
    enabled: true,
    relayUrl
  })
  const { entries, quarantined } = await svc.rebuild()
  console.log(`[${label}] entries=${entries} quarantined=${quarantined}`)
  return JSON.stringify(svc.snapshot())
}

const a = await rebuild('rebuild-1')
const b = await rebuild('rebuild-2')

if (a === b) {
  console.log(`OK: byte-identical (${Buffer.byteLength(a)} bytes) — diff to zero.`)
} else {
  console.error('MISMATCH: two rebuilds differ. If the network changed mid-run, retry; a')
  console.error('stable mismatch means the artifact is not a pure function of its inputs.')
  process.exit(1)
}
