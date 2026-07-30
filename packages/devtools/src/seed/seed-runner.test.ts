/**
 * Runner integration tests against a real NodeStore + in-memory adapter.
 * Proves idempotency (converge), volume growth (accrete) and clean rebuild
 * (reseed).
 */

import type { SchemaIRI } from '@xnetjs/data'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import {
  MemoryNodeStorageAdapter,
  NodeStore,
  PageSchema,
  ProjectSchema,
  TaskSchema,
  SpaceSchema
} from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { runSeed } from './seed-runner'

function makeStore(): NodeStore {
  const kp = generateSigningKeyPair()
  const did = createDID(kp.publicKey)
  return new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: did,
    signingKey: kp.privateKey
  })
}

async function count(store: NodeStore, schemaId: SchemaIRI): Promise<number> {
  const res = await store.query({ schemaId, includeDeleted: false, count: 'exact' })
  return res.totalCount ?? res.nodes.length
}

describe('runSeed — converge (idempotent)', () => {
  it('re-running does not duplicate', async () => {
    const store = makeStore()
    const r1 = await runSeed({ store, scale: 'small' })
    const tasks1 = await count(store, TaskSchema._schemaId)
    const projects1 = await count(store, ProjectSchema._schemaId)
    const spaces1 = await count(store, SpaceSchema._schemaId)

    expect(r1.created).toBeGreaterThan(0)
    expect(tasks1).toBeGreaterThan(0)

    const r2 = await runSeed({ store, scale: 'small' })
    const tasks2 = await count(store, TaskSchema._schemaId)
    const projects2 = await count(store, ProjectSchema._schemaId)
    const spaces2 = await count(store, SpaceSchema._schemaId)

    expect(r2.created).toBe(0)
    expect(tasks2).toBe(tasks1)
    expect(projects2).toBe(projects1)
    expect(spaces2).toBe(spaces1)
  })
})

describe('runSeed — relationships + documents', () => {
  it('tasks resolve to a real project + space, scoped into the demo space', async () => {
    const store = makeStore()
    await runSeed({ store, scale: 'small' })

    const tasks = await store.query({
      schemaId: TaskSchema._schemaId,
      includeDeleted: false,
      count: 'none'
    })
    expect(tasks.nodes.length).toBeGreaterThan(0)
    for (const task of tasks.nodes) {
      const projectRef = task.properties.project as string
      expect(projectRef, `task ${task.id} has no project`).toBeTruthy()
      const project = await store.get(projectRef)
      expect(project, `dangling project ref ${projectRef}`).not.toBeNull()
      expect(project!.schemaId).toContain('Project')
      // Tasks are scoped into the Engineering team sub-space.
      expect(String(task.properties.space)).toContain('seed/space/demo')
    }
  })

  it('applies a Yjs document to the flagship page (decodable, has blocks)', async () => {
    const store = makeStore()
    await runSeed({ store, scale: 'small' })

    const pages = await store.query({
      schemaId: PageSchema._schemaId,
      includeDeleted: false,
      count: 'none'
    })
    const sample = pages.nodes.find((p) => p.id === 'seed/page/sample')
    expect(sample, 'flagship sample page missing').toBeTruthy()

    const content = await store.getDocumentContent(sample!.id)
    expect(content, 'sample page has no document content').toBeTruthy()

    const doc = new Y.Doc()
    Y.applyUpdate(doc, content!)
    // BlockNote v4 layout: content-v4 → blockGroup → blockContainer per block.
    const fragment = doc.getXmlFragment('content-v4')
    expect(fragment.length).toBe(1)
    const blockGroup = fragment.get(0) as Y.XmlElement
    expect(blockGroup.nodeName).toBe('blockGroup')
    expect(blockGroup.length).toBeGreaterThan(5) // many block types
    expect(doc.getMap('meta').get('title')).toBe('Sample Page - All Block Types')
  })
})

describe('runSeed — accrete (grows)', () => {
  it('appends fresh volume nodes each run', async () => {
    const store = makeStore()
    await runSeed({ store, scale: 'small' })
    const before = await count(store, TaskSchema._schemaId)

    await runSeed({ store, scale: 'small', mode: 'accrete', accreteNonce: 'a' })
    const mid = await count(store, TaskSchema._schemaId)
    expect(mid).toBeGreaterThan(before)

    await runSeed({ store, scale: 'small', mode: 'accrete', accreteNonce: 'b' })
    const after = await count(store, TaskSchema._schemaId)
    expect(after).toBeGreaterThan(mid)
  })
})

describe('runSeed — reseed (clean rebuild)', () => {
  it('rebuilds to the same live count with no duplicates', async () => {
    const store = makeStore()
    await runSeed({ store, scale: 'small' })
    const before = await count(store, TaskSchema._schemaId)

    const r = await runSeed({ store, scale: 'small', mode: 'reseed' })
    const after = await count(store, TaskSchema._schemaId)

    expect(r.mode).toBe('reseed')
    expect(after).toBe(before)
  })
})
