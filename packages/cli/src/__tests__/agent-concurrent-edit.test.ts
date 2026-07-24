/**
 * Concurrent edit safety (exploration 0393): when the app writes a node after a
 * vault checkout, committing the vault's stale edit must surface a conflict —
 * never silently overwrite the newer store value. This is the Logseq hazard the
 * plan-gated design avoids; the guard is the watcher's `stale-export` conflict.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createMemoryNodeStore,
  createWorkspaceFixtureSchemas,
  type MemoryNodeStore
} from '@xnetjs/plugins/node'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAgentServices, runCommit, runStatus } from '../commands/agent.js'

describe('vault vs app concurrent edit', () => {
  let rootDir: string
  let store: MemoryNodeStore

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'xnet-concurrent-'))
    store = createMemoryNodeStore([
      {
        id: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Shared Page', markdown: 'original body' },
        deleted: false,
        createdAt: 1,
        updatedAt: 10
      }
    ])
  })

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  it('reports a stale-export conflict and does not overwrite the newer store value', async () => {
    const services = createAgentServices({ store, schemas: createWorkspaceFixtureSchemas() })
    await services.exporter.checkout({ rootDir, scope: { nodeIds: ['page_1'] } })

    // Vault edit against the checked-out (now stale) base.
    const pagePath = join(rootDir, 'Pages/shared-page.md')
    const page = await readFile(pagePath, 'utf8')
    await writeFile(pagePath, page.replace('original body', 'vault edit'), 'utf8')

    // App writes the same node — bumps updatedAt past the exported revision.
    store.setNode('page_1', { markdown: 'app edit wins' })

    const status = await runStatus(services, { dir: rootDir })
    expect(status).toContain('conflict\tPages/shared-page.md\tstale-export')

    // Applying must not clobber the newer store value with the stale vault edit.
    await runCommit(services, { dir: rootDir, apply: true })
    const node = await store.get('page_1')
    expect(node?.properties.markdown).toBe('app edit wins')
  })
})
