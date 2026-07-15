/**
 * Workspace-plugin drafts integration (exploration 0331, increment 4c).
 *
 * A plugin-authoring agent's `plugin_write_file` calls are ordinary store
 * writes — so when the host wraps the run in an agent-draft session (0329),
 * every source edit lands in a draft CLONE of the PluginSource node, the
 * live plugin keeps running its pinned source untouched, and merging the
 * draft is the review surface. This test proves that spine end-to-end with
 * the real overlay + merge machinery.
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { NodeStore, MemoryNodeStorageAdapter } from '@xnetjs/data'
import type { NodeId, SchemaIRI } from '@xnetjs/data'
import { describe, it, expect } from 'vitest'
import { startAgentDraft } from './agent-draft'
import { draftEntries, isForkable } from './draft'
import { HistoryEngine } from './engine'
import { mergeDraft } from './merge'
import { SnapshotCache, MemorySnapshotStorage } from './snapshot-cache'

const PLUGIN_SOURCE: SchemaIRI = 'xnet://xnet.fyi/PluginSource@1.0.0' as SchemaIRI

function setup() {
  const keyPair = generateSigningKeyPair()
  const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({
    storage: adapter,
    authorDID: did,
    signingKey: keyPair.privateKey
  })
  const engine = new HistoryEngine(
    adapter,
    new SnapshotCache(new MemorySnapshotStorage(), { interval: 100 })
  )
  return { store, adapter, engine }
}

describe('PluginSource in agent drafts (0331 4c)', () => {
  it('PluginSource is forkable (not on the never-fork list)', () => {
    expect(isForkable(PLUGIN_SOURCE)).toBe(true)
  })

  it('agent source edits land in a draft; main source (the running plugin) is untouched', async () => {
    const { store, adapter, engine } = setup()
    const v1Files = { 'index.js': 'export default { version: 1 }' }
    const source = await store.create({
      schemaId: PLUGIN_SOURCE,
      properties: {
        name: 'Habit Tracker',
        files: v1Files,
        entry: 'index.js',
        manifest: { id: 'com.demo.habits', name: 'Habit Tracker', version: '0.1.0' },
        publishedHash: 'pinned-v1'
      }
    })

    const session = await startAgentDraft(store, adapter, {
      name: 'AI: add streak column to habit tracker',
      targetId: source.id
    })

    // The agent's plugin_write_file — an ordinary update through the store.
    await store.update(source.id, {
      properties: { files: { 'index.js': 'export default { version: 2 }' } }
    })
    await session.end()

    // Main untouched: the running plugin's pinned source did not move.
    const main = await store.getRaw(source.id)
    expect(main?.properties.files).toEqual(v1Files)
    expect(main?.properties.publishedHash).toBe('pinned-v1')

    // The edit is in the draft clone, review-requested.
    const draftNode = await store.getRaw(session.draft.id)
    expect(draftNode?.properties.reviewRequested).toBe(true)
    const entry = draftEntries(draftNode!)[source.id]
    expect(entry).toBeDefined()
    const clone = await store.getRaw(entry.cloneId as NodeId)
    expect(clone?.properties.files).toEqual({ 'index.js': 'export default { version: 2 }' })

    // Merge = review approved: the source advances in one reviewed operation.
    const result = await mergeDraft(store, adapter, engine, session.draft.id)
    expect(result.status).toBe('merged')
    expect((await store.getRaw(source.id))?.properties.files).toEqual({
      'index.js': 'export default { version: 2 }'
    })
  })
})
