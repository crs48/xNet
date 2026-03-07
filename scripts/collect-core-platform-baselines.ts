import type { QuerySubscription } from '../packages/data-bridge/src/types.ts'
import { generateSigningKeyPair } from '../packages/crypto/src/index.ts'
import { createRow, moveRow, queryRows, updateCells } from '../packages/data/src/database/index.ts'
import {
  DatabaseSchema,
  MemoryNodeStorageAdapter,
  NodeStore,
  YDoc,
  YXmlElement,
  YXmlText,
  defineSchema,
  text,
  number,
  date
} from '../packages/data/src/index.ts'
import { MainThreadBridge } from '../packages/data-bridge/src/main-thread-bridge.ts'
import { createSearchIndex } from '../packages/query/src/index.ts'
type MetricSummary = {
  label: string
  iterations: number
  avgMs: number
  minMs: number
  maxMs: number
}

const BenchPageSchema = defineSchema({
  name: 'BenchPage',
  namespace: 'xnet://bench/',
  properties: {
    title: text({ required: true }),
    status: text({}),
    body: text({}),
    priority: number({}),
    updatedAt: date({})
  }
})

async function measureAsync(
  label: string,
  iterations: number,
  fn: (iteration: number) => Promise<void>
): Promise<MetricSummary> {
  const times: number[] = []

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const start = performance.now()
    await fn(iteration)
    times.push(performance.now() - start)
  }

  const total = times.reduce((sum, value) => sum + value, 0)

  return {
    label,
    iterations,
    avgMs: total / iterations,
    minMs: Math.min(...times),
    maxMs: Math.max(...times)
  }
}

async function waitForSnapshot(subscription: QuerySubscription): Promise<unknown[]> {
  const existing = subscription.getSnapshot()
  if (existing !== null) {
    return existing
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      reject(new Error('Timed out waiting for query snapshot'))
    }, 5000)

    const unsubscribe = subscription.subscribe(() => {
      const snapshot = subscription.getSnapshot()
      if (snapshot !== null) {
        clearTimeout(timeout)
        unsubscribe()
        resolve(snapshot)
      }
    })
  })
}

function createSearchDoc(id: string, title: string, body: string) {
  const ydoc = new YDoc({ guid: id, gc: false })
  const paragraph = new YXmlElement('paragraph')
  paragraph.insert(0, [new YXmlText(body)])
  ydoc.getXmlFragment('content').insert(0, [paragraph])
  return {
    id,
    ydoc,
    type: 'page',
    workspace: 'baseline',
    metadata: { title }
  }
}

async function createStore(): Promise<NodeStore> {
  const keyPair = generateSigningKeyPair()
  const store = new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: 'did:key:z6Mkbaselinecollector',
    signingKey: keyPair.privateKey
  })
  await store.initialize()
  return store
}

async function populatePages(store: NodeStore, count: number): Promise<string[]> {
  const ids: string[] = []

  for (let index = 0; index < count; index += 1) {
    const node = await store.create({
      schemaId: BenchPageSchema._schemaId,
      properties: {
        title: `Bench Page ${index}`,
        status: index % 3 === 0 ? 'open' : 'archived',
        body: `Bench body ${index} irrigation orchard planning seed rotation soil schedule ${index % 100}`,
        priority: index % 5,
        updatedAt: Date.now() + index
      }
    })
    ids.push(node.id)
  }

  return ids
}

async function collectQueryMetrics(nodeCount: number): Promise<MetricSummary[]> {
  const store = await createStore()
  const ids = await populatePages(store, nodeCount)
  const bridge = new MainThreadBridge(store)
  const openIds = ids.filter((_, index) => index % 3 === 0)
  const targetId = openIds[0]

  try {
    const initialWindow = await measureAsync(`query-window-${nodeCount}`, 10, async () => {
      const subscription = bridge.query(BenchPageSchema, {
        orderBy: { updatedAt: 'desc' },
        limit: 100
      })
      await waitForSnapshot(subscription)
    })

    const limitedFiltered = await measureAsync(`query-filtered-${nodeCount}`, 10, async () => {
      const subscription = bridge.query(BenchPageSchema, {
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' },
        limit: 100
      })
      await waitForSnapshot(subscription)
    })

    const targetedUpdate = await measureAsync(`query-update-fanout-${nodeCount}`, 10, async (i) => {
      const nextTitle = `Updated fanout ${i}`
      const subscription = bridge.query(BenchPageSchema, {
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' },
        limit: 100
      })

      await waitForSnapshot(subscription)

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe()
          reject(new Error('Timed out waiting for targeted query update'))
        }, 5000)

        const unsubscribe = subscription.subscribe(() => {
          const snapshot = subscription.getSnapshot()
          const matched = snapshot?.find((node) => node.id === targetId)
          if (matched?.properties.title === nextTitle) {
            clearTimeout(timeout)
            unsubscribe()
            resolve()
          }
        })

        void bridge.update(targetId, {
          title: nextTitle,
          updatedAt: Date.now() + i + nodeCount
        })
      })
    })

    return [initialWindow, limitedFiltered, targetedUpdate]
  } finally {
    bridge.destroy()
  }
}

async function collectSearchMetrics(nodeCount: number): Promise<MetricSummary> {
  const index = createSearchIndex()

  for (let i = 0; i < nodeCount; i += 1) {
    index.add(
      createSearchDoc(
        `search-${nodeCount}-${i}`,
        `Irrigation Plan ${i}`,
        `Irrigation planning for orchard block ${i} with soil notes, seed rotation, and water schedule ${i}.`
      )
    )
  }

  return measureAsync(`global-search-${nodeCount}`, 25, async () => {
    index.search({ text: 'orchard irrigation schedule', limit: 10 })
  })
}

async function collectDatabaseMetrics(): Promise<MetricSummary[]> {
  const store = await createStore()
  const database = await store.create({
    schemaId: DatabaseSchema._schemaId,
    properties: {
      title: 'Operations',
      defaultView: 'table',
      rowCount: 0
    }
  })

  for (let index = 0; index < 250; index += 1) {
    await createRow(store, {
      databaseId: database.id,
      cells: {
        title: `Row ${index}`,
        status: index % 2 === 0 ? 'todo' : 'done'
      }
    })
  }

  const { rows } = await queryRows(store, database.id, { limit: 250 })
  const targetRowId = rows[0]?.id
  const beforeRowId = rows[1]?.id
  const afterRowId = rows[rows.length - 1]?.id

  if (!targetRowId || !beforeRowId || !afterRowId) {
    throw new Error('Database benchmark fixture did not create enough rows')
  }

  const createMetric = await measureAsync('database-create-row', 15, async (iteration) => {
    const rowId = await createRow(store, {
      databaseId: database.id,
      cells: {
        title: `Bench create ${iteration}`,
        status: 'todo'
      }
    })
    await store.delete(rowId)
  })

  const updateMetric = await measureAsync('database-update-row', 20, async (iteration) => {
    await updateCells(store, targetRowId, {
      title: `Updated ${iteration}`,
      status: iteration % 2 === 0 ? 'done' : 'todo'
    })
  })

  const reorderMetric = await measureAsync('database-reorder-row', 20, async (iteration) => {
    if (iteration % 2 === 0) {
      await moveRow(store, targetRowId, { before: beforeRowId })
      return
    }

    await moveRow(store, targetRowId, { after: afterRowId })
  })

  return [createMetric, updateMetric, reorderMetric]
}

function printMetrics(metrics: MetricSummary[]): void {
  console.log('| Metric | Iterations | Avg (ms) | Min (ms) | Max (ms) |')
  console.log('| --- | ---: | ---: | ---: | ---: |')

  for (const metric of metrics) {
    console.log(
      `| ${metric.label} | ${metric.iterations} | ${metric.avgMs.toFixed(2)} | ${metric.minMs.toFixed(2)} | ${metric.maxMs.toFixed(2)} |`
    )
  }
}

async function main(): Promise<void> {
  const metrics = [
    ...(await collectQueryMetrics(1000)),
    ...(await collectQueryMetrics(10_000)),
    await collectSearchMetrics(1000),
    await collectSearchMetrics(10_000),
    ...(await collectDatabaseMetrics())
  ]

  console.log(`# Core Platform Baselines`)
  console.log(`- recordedAt: ${new Date().toISOString()}`)
  console.log(`- node: ${process.version}`)
  console.log(`- platform: ${process.platform}`)
  console.log(`- arch: ${process.arch}`)
  printMetrics(metrics)
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
