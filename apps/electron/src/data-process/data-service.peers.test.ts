import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChatMessageSchema } from '@xnetjs/data'
import { createUnsignedChange, signChange } from '@xnetjs/sync'
import { peerMessagePrefix } from '@xnetjs/workbench/peer-chat'
import { expect, it } from 'vitest'
import { createBinding, validateChange } from '../main/peers/protocol'
import { createDataService } from './data-service'

it('pages peer changes without losing Lamport ties or exporting another author or channel', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xnet-peer-query-'))
  const service = createDataService({ dbPath: join(directory, 'test.db') })
  const seed = randomBytes(32)
  const author = createBinding(seed, '00'.repeat(32)).did
  const channel = `iroh-${randomUUID()}`
  try {
    await service.initialize()
    const append = async (target: string, owner: `did:key:${string}`, lamport: number) => {
      const signed = signChange(
        createUnsignedChange({
          id: randomUUID(),
          type: 'node-change',
          authorDID: owner,
          lamport,
          parentHash: null,
          payload: {
            nodeId: peerMessagePrefix(target, owner) + randomUUID(),
            schemaId: ChatMessageSchema._schemaId,
            properties: { channel: target, content: 'hello' }
          }
        }),
        seed
      )
      const wire = { ...signed, signature: Array.from(signed.signature) }
      await service.appendChange(wire)
      return wire
    }
    const expected = []
    for (let i = 0; i < 5; i++) expected.push(await append(channel, author, 10))
    expected.push(await append(channel, author, 11))
    await append(`iroh-${randomUUID()}`, author, 10)
    await append(channel, createBinding(randomBytes(32), '11'.repeat(32)).did, 10)
    const child = `${channel}-channel-${randomUUID()}`
    const childChange = await append(child, author, 1)
    expect(
      (await service.getPeerChanges(child, author, { lamport: 0, hash: '' })).map(
        (entry) => entry.hash
      )
    ).toEqual([childChange.hash])
    const first = await service.getPeerChanges(channel, author, { lamport: 0, hash: '' })
    expect(first).toHaveLength(3)
    const last = first.at(-1)!
    const second = await service.getPeerChanges(channel, author, {
      lamport: last.lamport,
      hash: last.hash
    })
    expect(second).toHaveLength(3)
    expect(
      new Set([...first, ...second].map((c) => validateChange(c, channel, author).hash))
    ).toEqual(new Set(expected.map((c) => c.hash)))
    const end = second.at(-1)!
    expect(
      await service.getPeerChanges(channel, author, { lamport: end.lamport, hash: end.hash })
    ).toEqual([])
    await expect(
      service.getPeerChanges('not-a-peer', author, { lamport: 0, hash: '' })
    ).rejects.toThrow()
  } finally {
    await service.shutdown()
    await rm(directory, { recursive: true, force: true })
  }
})
