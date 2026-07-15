/**
 * Agent-PR session tests (exploration 0329 P4 + validation): an assistant
 * edit lands in a draft, is reviewable as a diff, merges in one reviewed
 * operation — nothing touches main before approval.
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { NodeStore, MemoryNodeStorageAdapter } from '@xnetjs/data'
import type { NodeId, SchemaIRI } from '@xnetjs/data'
import { describe, it, expect } from 'vitest'
import { startAgentDraft } from './agent-draft'
import { draftEntries } from './draft'
import { HistoryEngine } from './engine'
import { mergeDraft, threeWayPropertyMerge } from './merge'
import { SnapshotCache, MemorySnapshotStorage } from './snapshot-cache'

const TASK: SchemaIRI = 'xnet://xnet.fyi/Task' as SchemaIRI
const PAGE: SchemaIRI = 'xnet://xnet.fyi/Page' as SchemaIRI

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

describe('startAgentDraft (agent-PR, 0329 P4)', () => {
  it('agent edits land in the draft; main is untouched until merge', async () => {
    const { store, adapter, engine } = setup()
    const page = await store.create({ schemaId: PAGE, properties: { title: 'human-v1' } })

    const session = await startAgentDraft(store, adapter, {
      name: 'AI: restructure intro',
      targetId: page.id
    })

    // The "assistant" edits the page and creates a task — plain store calls,
    // exactly what the AI surface's tools issue.
    await store.update(page.id, { properties: { title: 'ai-rewrite' } })
    const bornTask = await store.create({
      schemaId: TASK,
      properties: { title: 'follow-up from AI', parent: page.id }
    })

    await session.end()

    // Main untouched; the overlay is released; review is requested.
    expect((await store.getRaw(page.id))?.properties.title).toBe('human-v1')
    expect(store.getCheckedOutDraft()).toBeNull()
    const draftNode = await store.getRaw(session.draft.id)
    expect(draftNode?.properties.reviewRequested).toBe(true)

    // Reviewable as a three-way diff: exactly the title change pends.
    const entries = draftEntries(draftNode!)
    const entry = entries[page.id]
    expect(entry).toBeDefined()
    const base = await engine.materializeAt(page.id, {
      type: 'hash',
      hash: entry.forkedAtHash as never
    })
    const clone = await store.getRaw(entry.cloneId as NodeId)
    const review = threeWayPropertyMerge(
      base.node.properties,
      (await store.getRaw(page.id))!.properties,
      clone!.properties
    )
    expect(review.conflicts).toEqual([])
    expect(review.patch).toEqual({ title: 'ai-rewrite' })

    // Draft-born tracking captured the created task.
    expect(draftNode?.properties.created).toContain(bornTask.id)

    // Human approves: one reviewed merge applies everything.
    const result = await mergeDraft(store, adapter, engine, session.draft.id)
    expect(result.status).toBe('merged')
    expect((await store.getRaw(page.id))?.properties.title).toBe('ai-rewrite')
    if (result.status === 'merged') {
      const promoted = result.provenance.merged[bornTask.id] as NodeId
      expect((await store.getRaw(promoted))?.properties.parent).toBe(page.id)
    }
  })

  it('never forks never-fork schemas; bookkeeping writes pass through', async () => {
    const { store, adapter } = setup()
    const comment = await store.create({
      schemaId: 'xnet://xnet.fyi/Comment@1.0.0' as SchemaIRI,
      properties: { content: 'existing' }
    })

    const session = await startAgentDraft(store, adapter, { name: 'AI: comment pass' })
    await store.update(comment.id, { properties: { content: 'agent-edited' } })
    await session.end()

    // The comment was edited LIVE (never-fork), not forked.
    expect((await store.getRaw(comment.id))?.properties.content).toBe('agent-edited')
    expect(Object.keys(draftEntries((await store.getRaw(session.draft.id))!))).toEqual([])
  })

  it('an untouched session does not request review', async () => {
    const { store, adapter } = setup()
    const session = await startAgentDraft(store, adapter, { name: 'AI: no-op' })
    await session.end()
    expect((await store.getRaw(session.draft.id))?.properties.reviewRequested ?? false).toBe(
      false
    )
  })
})
