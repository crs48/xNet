/**
 * The lane that was worst is now the lane under test (exploration 0415).
 *
 * When the desktop app is running, the CLI *prefers* its local API — and that
 * backend had no `searchText`, so `xnet search` silently fell back to a
 * substring scan over the first 500 nodes in the configuration most people
 * actually run. This drives a real `LocalAPIServer` over a real SQLite store
 * and asserts the CLI reports an indexed tier through it.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAgentRetrieval, createAiSurfaceService, createLocalAPI } from '@xnetjs/plugins/node'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAgentServices, runRecall, runSearch } from '../commands/agent.js'
import { createLocalAgentBackend } from '../utils/agent-local.js'
import { createRemoteAgentBackend } from '../utils/agent-remote.js'

const KEY = Uint8Array.from(Buffer.from('11'.repeat(32), 'hex'))
const PAGE = 'xnet://xnet.fyi/Page@1.0.0'

describe('CLI over the app local API', () => {
  let dir: string
  let stopApi: (() => Promise<void>) | null = null
  let disposeLocal: (() => Promise<void>) | null = null
  let apiUrl = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'xnet-remote-tier-'))

    // The "app": a SQLite-backed store (so `nodes_fts` exists) behind the same
    // LocalAPIServer the desktop app runs.
    const backend = await createLocalAgentBackend({ db: join(dir, 'data.db'), agentKey: KEY })
    disposeLocal = () => backend.client.destroy()

    await backend.store.create({
      schemaId: PAGE,
      properties: { title: 'Cutover runbook', markdown: 'Rollback procedure for the Q2 cutover.' }
    })
    // The multi-hop fixture: a Task that matches the query, pointing at a Page
    // whose own text contains none of the query's words.
    const runbook = await backend.store.create({
      schemaId: PAGE,
      properties: {
        title: 'Rollback procedure',
        markdown: 'Restore the previous snapshot, then re-run the migration in dry-run mode.'
      }
    })
    await backend.store.create({
      schemaId: 'xnet://xnet.fyi/Task@1.0.0',
      properties: { title: 'Acme renewal cutover', status: 'todo', page: runbook.id }
    })

    for (let i = 0; i < 40; i++) {
      await backend.store.create({
        schemaId: PAGE,
        properties: { title: `Routine note ${i}`, markdown: `Nothing notable here, ${i}.` }
      })
    }

    const aiSurface = createAiSurfaceService({
      store: backend.store,
      schemas: backend.schemas,
      retrieveContext: createAgentRetrieval({ store: backend.store, schemas: backend.schemas })
        .retrieveContext
    })
    const api = createLocalAPI({
      store: backend.store,
      schemas: backend.schemas,
      aiSurface,
      port: 0
    })
    await api.start()
    const port = api.getPort()
    if (port === null) throw new Error('local API did not report a bound port')
    apiUrl = `http://127.0.0.1:${port}`
    stopApi = () => api.stop()
  })

  afterEach(async () => {
    await stopApi?.()
    await disposeLocal?.()
    await rm(dir, { recursive: true, force: true })
  })

  it('reports an indexed tier — never scan — through the remote backend', async () => {
    const services = createAgentServices(await createRemoteAgentBackend({ apiUrl }))
    const warnings: string[] = []
    const output = await runSearch(services, { text: 'cutover', warn: (m) => warnings.push(m) })

    expect(output.split('\n')[0]).toBe('tier\tbm25-graph')
    expect(output).toContain('Cutover runbook')
    // Nothing to warn about: an indexed search stays silent, which is what
    // makes the warning mean something when it does appear.
    expect(warnings).toHaveLength(0)
  })

  it('recall works through the remote backend too', async () => {
    const services = createAgentServices(await createRemoteAgentBackend({ apiUrl }))
    const output = await runRecall(services, { text: 'cutover runbook', warn: () => {} })
    expect(output.split('\n')[0]).toMatch(/^tier\tbm25-graph\t/)
    expect(output).toContain('Cutover runbook')
  })

  it('walks a typed relation to a node the query never mentions', async () => {
    const services = createAgentServices(await createRemoteAgentBackend({ apiUrl }))
    const output = await runRecall(services, {
      text: 'how do we roll back the Acme renewal cutover',
      warn: () => {}
    })

    // The Page says nothing about Acme or renewals; it is only reachable by
    // walking `page` from the Task, and the path column is the receipt.
    expect(output).toContain('Rollback procedure')
    expect(output).toMatch(/\(page\) Rollback procedure/)
    expect(output.split('\n')[0]).toMatch(/expanded=[1-9]/)
  })
})
