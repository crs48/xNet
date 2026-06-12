/**
 * Tests for the HTTP-backed agent backend against a real LocalAPIServer.
 */

import {
  createLocalAPI,
  createMemoryNodeStore,
  createWorkspaceFixtureSchemas,
  type LocalAPIServer
} from '@xnetjs/plugins/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRemoteAgentBackend, type AgentBackend } from '../utils/agent-remote.js'

let server: LocalAPIServer
let backend: AgentBackend
let apiUrl: string

beforeAll(async () => {
  const store = createMemoryNodeStore([
    {
      id: 'page_1',
      schemaId: 'xnet://xnet.fyi/Page@1.0.0',
      properties: { title: 'Remote Page', markdown: 'Remote body' },
      deleted: false,
      createdAt: 1,
      updatedAt: 10
    }
  ])
  const schemas = createWorkspaceFixtureSchemas()

  // Random high port; retry a few times to dodge collisions in parallel runs.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const port = 33000 + Math.floor(Math.random() * 20000)
    server = createLocalAPI({ store, schemas, port })
    try {
      await server.start()
      apiUrl = `http://127.0.0.1:${port}`
      break
    } catch (err) {
      if (attempt === 4) throw err
    }
  }
  backend = await createRemoteAgentBackend({ apiUrl })
})

afterAll(async () => {
  await server.stop()
})

describe('createRemoteAgentBackend', () => {
  it('prefetches the schema registry', async () => {
    expect(backend.schemas.getAllIRIs()).toContain('xnet://xnet.fyi/Page@1.0.0')
    const schema = await backend.schemas.get('xnet://xnet.fyi/Page@1.0.0')
    expect(schema?.name).toBe('Page')
    expect(await backend.schemas.get('xnet://missing')).toBeNull()
  })

  it('gets, lists, creates, updates, and deletes nodes over HTTP', async () => {
    expect(await backend.store.get('missing-node')).toBeNull()

    const page = await backend.store.get('page_1')
    expect(page?.properties.title).toBe('Remote Page')

    const listed = await backend.store.list({
      schemaId: 'xnet://xnet.fyi/Page@1.0.0',
      limit: 10,
      offset: 0
    })
    expect(listed.map((node) => node.id)).toContain('page_1')

    const created = await backend.store.create({
      schemaId: 'xnet://xnet.fyi/Page@1.0.0',
      properties: { title: 'Created Remotely' }
    })
    expect(created.properties.title).toBe('Created Remotely')

    const updated = await backend.store.update(created.id, {
      properties: { title: 'Updated Remotely' }
    })
    expect(updated.properties.title).toBe('Updated Remotely')

    await backend.store.delete(created.id)
  })
})
