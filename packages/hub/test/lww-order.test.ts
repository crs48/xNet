/**
 * Change-application ordering conformance for hub storages (0276).
 *
 * Replicas fold node changes in `compareChangeApplicationOrder` (lamport →
 * author by UTF-16 code units, protocol §L1.7). The hub relays history via
 * `getNodeChangesSince`, so its storages must hand changes back in that same
 * order — the in-memory storage previously used `localeCompare`, which
 * disagrees with the SQLite storage's BINARY collation on case-mixed authors
 * and is non-deterministic across ICU versions.
 */
import { compareChangeApplicationOrder } from '@xnetjs/core'
import { describe, expect, it } from 'vitest'
import type { SerializedNodeChange } from '../src/storage/interface'
import { createMemoryStorage } from '../src/storage/memory'

const ROOM = 'room-lww-order'

function change(input: {
  hash: string
  lamportTime: number
  lamportAuthor: string
}): SerializedNodeChange {
  return {
    id: `change-${input.hash}`,
    type: 'node',
    hash: input.hash,
    room: ROOM,
    nodeId: 'node-1',
    lamportTime: input.lamportTime,
    lamportAuthor: input.lamportAuthor,
    authorDid: input.lamportAuthor,
    wallTime: 1,
    parentHash: null,
    payload: { nodeId: 'node-1', properties: {} },
    signatureBase64: 'sig'
  } as SerializedNodeChange
}

describe('hub storage change ordering (protocol §L1.7)', () => {
  it('memory storage returns changes in shared application order', async () => {
    const storage = createMemoryStorage()

    // Includes the golden-vector case pair: 'did:key:zAAA' (uppercase) must
    // sort BEFORE 'did:key:zaaa' by code units — many locales collate the
    // other way, which is exactly the drift this test pins down.
    const inserted = [
      change({ hash: 'h1', lamportTime: 2, lamportAuthor: 'did:key:zAAA' }),
      change({ hash: 'h2', lamportTime: 1, lamportAuthor: 'did:key:zaaa' }),
      change({ hash: 'h3', lamportTime: 1, lamportAuthor: 'did:key:zAAA' }),
      change({ hash: 'h4', lamportTime: 3, lamportAuthor: 'did:key:zbbb' })
    ]
    for (const c of inserted) {
      await storage.appendNodeChange(ROOM, c)
    }

    const { changes: returned } = await storage.getNodeChangesSince(ROOM, 0)
    const expected = [...inserted].sort((a, b) =>
      compareChangeApplicationOrder(
        { lamport: a.lamportTime, author: a.lamportAuthor },
        { lamport: b.lamportTime, author: b.lamportAuthor }
      )
    )

    expect(returned.map((c) => c.hash)).toEqual(expected.map((c) => c.hash))
    // The case-mixed lamport tie resolves uppercase-first (code units).
    expect(returned.map((c) => c.hash).slice(0, 2)).toEqual(['h3', 'h2'])
  })
})
