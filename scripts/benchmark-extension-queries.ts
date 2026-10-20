/** Local performance evidence for 0481; run with `pnpm exec tsx scripts/benchmark-extension-queries.ts`. */
import type { NodeState } from '../packages/data/src/store/types.ts'
import type { ExtensionGrant } from '../packages/workbench/src/communities/extension-data.ts'
import { strict as assert } from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { cpus, tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateSigningKeyPair } from '../packages/crypto/src/index.ts'
import { ChatMessageSchema } from '../packages/data/src/index.ts'
import { NodeStore, SQLiteNodeStorageAdapter } from '../packages/data/src/store/index.ts'
import { createMainThreadBridge } from '../packages/data-bridge/src/main-thread-bridge.ts'
import { createDID } from '../packages/identity/src/index.ts'
import { createElectronSQLiteAdapter } from '../packages/sqlite/src/adapters/electron.ts'
import { openExtensionAuthority } from '../packages/workbench/src/communities/extension-authority.ts'
import { createExtensionQueryBroker } from '../packages/workbench/src/communities/extension-queries.ts'

const directory = await mkdtemp(join(tmpdir(), 'xnet-extension-query-bench-'))
const db = await createElectronSQLiteAdapter({ path: join(directory, 'benchmark.sqlite') })
const storage = new SQLiteNodeStorageAdapter(db)
const pair = generateSigningKeyPair(),
  owner = createDID(pair.publicKey)
const store = new NodeStore({ storage, authorDID: owner, signingKey: pair.privateKey })
const bridge = createMainThreadBridge(store)
try {
  await store.initialize()
  for (let base = 0; base < 100_000; base += 1000) {
    const rows: NodeState[] = Array.from({ length: 1000 }, (_, offset) => {
      const id = base + offset
      const properties = {
        channel: id < 250 ? 'approved' : 'private-other',
        content: `Message ${id}`
      }
      return {
        id: `message-${id}`,
        schemaId: ChatMessageSchema._schemaId,
        properties,
        createdAt: id,
        updatedAt: id,
        createdBy: owner,
        updatedBy: owner,
        deleted: false,
        timestamps: Object.fromEntries(
          Object.keys(properties).map((key) => [
            key,
            { lamport: id + 1, wallTime: id, author: owner }
          ])
        )
      }
    })
    await storage.importNodes(rows, { trustMaterializedState: true })
    if ((base + 1000) % 25_000 === 0) console.error(`Seeded ${base + 1000} benchmark records`)
  }
  const grant: ExtensionGrant = {
    version: 1,
    owner,
    hash: 'benchmark',
    channelIds: ['approved'],
    records: []
  }
  const saved = (await openExtensionAuthority(bridge, owner, 'chat', grant.hash, grant))!
  const broker = createExtensionQueryBroker(bridge, grant, saved.authority, () => true)
  const read = async (after?: string) =>
    broker.query(
      {
        version: 1,
        id: crypto.randomUUID(),
        operation: 'data.query',
        schemaId: ChatMessageSchema._schemaId,
        options: { page: { first: 20, after, count: 'none' } }
      },
      AbortSignal.timeout(5000)
    )
  const start = performance.now(),
    first = await read(),
    coldMs = performance.now() - start
  const seen = new Set<string>()
  let result = first,
    maxBytes = 0,
    pages = 0
  for (let page = 0; page < 1000; page++) {
    assert.equal(result.metadata.pageInfo.totalCount, null)
    assert.ok(result.nodes.length <= 20)
    maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(result)))
    for (const node of result.nodes) {
      assert.equal(node.properties.channel, 'approved')
      assert.ok(!seen.has(node.id), 'A cursor repeated a record')
      seen.add(node.id)
    }
    pages++
    if (!result.metadata.pageInfo.hasMore) break
    assert.ok(result.metadata.pageInfo.endCursor)
    result = await read(result.metadata.pageInfo.endCursor)
  }
  assert.equal(seen.size, 250)
  const samples: number[] = []
  for (let run = 0; run < 20; run++) {
    const started = performance.now()
    await read()
    samples.push(performance.now() - started)
  }
  samples.sort((a, b) => a - b)
  const rounded = (value: number) => Math.round(value * 100) / 100
  console.log(
    JSON.stringify(
      {
        runtime: process.version,
        cpu: cpus()[0]?.model,
        records: 100_000,
        authorizedRecords: seen.size,
        pages,
        maxResponseBytes: maxBytes,
        coldMs: rounded(coldMs),
        warmP50Ms: rounded(samples[9]),
        warmP95Ms: rounded(samples[18]),
        note: 'Native SQLite and host broker only; excludes IPC, worker startup, React rendering, and encrypted storage.'
      },
      null,
      2
    )
  )
} finally {
  bridge.destroy()
  await storage.close()
  await db.close()
  await rm(directory, { recursive: true, force: true })
}
