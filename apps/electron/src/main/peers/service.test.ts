import type { WireChange } from './protocol'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChatMessageSchema } from '@xnetjs/data'
import { createUnsignedChange, signChange } from '@xnetjs/sync'
import { peerMessagePrefix } from '@xnetjs/workbench/peer-chat'
import { expect, it, vi } from 'vitest'
import { createBinding } from './protocol'
vi.mock('electron', () => ({ net: { fetch }, safeStorage: { isEncryptionAvailable: () => false } }))
vi.mock('../data-process-manager', () => ({ getPeerChanges: async () => [] }))
import { PeerChatService } from './service'
const until = async (predicate: () => boolean) => {
  const deadline = Date.now() + 20000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Peer condition timed out')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
it('pairs real Iroh endpoints, waits for approval, persists delivery and catches up after restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xnet-peer-'))
  const seed = randomBytes(32),
    outbox: WireChange[] = [],
    received = new Set<string>()
  const me = createBinding(seed, '00'.repeat(32)).did
  const aOptions = {
    directory: join(dir, 'a'),
    seed,
    changed: () => {},
    apply: async () => {},
    read: async (_channel: string, _author: string, cursor: { lamport: number; hash: string }) =>
      outbox.filter((c) => c.lamport > cursor.lamport)
  }
  let a = new PeerChatService(aOptions)
  const b = new PeerChatService({
    directory: join(dir, 'b'),
    seed: randomBytes(32),
    changed: () => {},
    apply: async ({ changes }) => {
      changes.forEach((c) => received.add(c.hash))
    },
    read: async () => []
  })
  try {
    a.setDisplayName('Alice')
    b.setDisplayName('Bob')
    const invite = await a.createInvite('Friends')
    await b.join(invite)
    await b.join(invite)
    expect(b.snapshot().contacts).toHaveLength(1)
    await until(() => a.snapshot().contacts[0]?.status === 'pending')
    expect(a.snapshot().contacts[0]?.displayName).toBe('Bob')
    expect(b.snapshot().contacts[0]?.displayName).toBe('Alice')
    expect(received.size).toBe(0)
    const channel = a.snapshot().contacts[0]!.channel
    await a.approve(channel)
    await until(() => b.snapshot().contacts[0]?.status === 'approved')
    const add = (content: string, lamport: number) => {
      const c = signChange(
        createUnsignedChange({
          id: randomUUID(),
          type: 'node-change',
          payload: {
            nodeId: peerMessagePrefix(channel, me) + randomUUID(),
            schemaId: ChatMessageSchema._schemaId,
            properties: { channel, content }
          },
          lamport,
          parentHash: null,
          authorDID: me
        }),
        seed
      )
      outbox.push({ ...c, signature: Array.from(c.signature) })
    }
    add('A real encrypted message', 1)
    await until(() => received.size === 1 && !!a.snapshot().contacts[0]?.deliveredAt)
    expect(a.snapshot().contacts[0]?.connection).toBe('direct')
    const endpoint = a.snapshot().endpoint
    await a.close()
    add('Queued while offline', 2)
    a = new PeerChatService(aOptions)
    expect(a.snapshot().contacts[0]?.displayName).toBe('Bob')
    await a.resume()
    expect(a.snapshot().endpoint).toBe(endpoint)
    await until(() => received.size === 2)
    a.block(channel)
    add('Must not be delivered after disconnect', 3)
    await new Promise((resolve) => setTimeout(resolve, 3500))
    expect(received.size).toBe(2)
  } finally {
    await a.close()
    await b.close()
    rmSync(dir, { recursive: true, force: true })
  }
}, 45000)

it('hosts a three-person group, forwards original signatures, catches late authors and stops removed members', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xnet-peer-group-'))
  const histories = [
    new Map<string, WireChange>(),
    new Map<string, WireChange>(),
    new Map<string, WireChange>()
  ]
  const seeds = [randomBytes(32), randomBytes(32), randomBytes(32)]
  const dids = seeds.map((seed) => createBinding(seed, 'a'.repeat(64)).did)
  const options = seeds.map((seed, i) => ({
    directory: join(dir, String(i)),
    seed,
    changed: () => {},
    apply: async ({ changes }: { changes: WireChange[] }) => {
      for (const change of changes) histories[i].set(change.hash, change)
    },
    read: async (channel: string, author: string, cursor: { lamport: number; hash: string }) =>
      [...histories[i].values()]
        .filter(
          (c) =>
            c.payload.properties?.channel === channel &&
            c.authorDID === author &&
            (c.lamport > cursor.lamport || (c.lamport === cursor.lamport && c.hash > cursor.hash))
        )
        .sort((a, b) => a.lamport - b.lamport || a.hash.localeCompare(b.hash))
        .slice(0, 3)
  }))
  let host = new PeerChatService(options[0])
  const alice = new PeerChatService(options[1]),
    bob = new PeerChatService(options[2])
  const add = (author: number, channel: string, content: string, lamport: number) => {
    const change = signChange(
      createUnsignedChange({
        id: randomUUID(),
        type: 'node-change',
        payload: {
          nodeId: peerMessagePrefix(channel, dids[author]) + randomUUID(),
          schemaId: ChatMessageSchema._schemaId,
          properties: { channel, content }
        },
        parentHash: null,
        authorDID: dids[author],
        lamport
      }),
      seeds[author]
    )
    const wire = { ...change, signature: Array.from(change.signature) }
    histories[author].set(wire.hash, wire)
    return wire.hash
  }
  try {
    host.setDisplayName('Host')
    alice.setDisplayName('Alice')
    bob.setDisplayName('Bob')
    const group = await host.createGroup('Film night')
    await alice.join(await host.inviteToGroup(group))
    await until(() => host.snapshot().contacts.some((c) => c.binding.did === dids[1]))
    await host.approve(host.snapshot().contacts.find((c) => c.binding.did === dids[1])!.channel)
    await until(() => alice.snapshot().contacts[0]?.status === 'approved')
    const first = add(1, group, 'Alice before Bob joins', 50)
    await until(() => histories[0].has(first))
    await bob.join(await host.inviteToGroup(group))
    await until(() => host.snapshot().contacts.some((c) => c.binding.did === dids[2]))
    expect(histories[2].has(first)).toBe(false)
    const bobChannel = host.snapshot().contacts.find((c) => c.binding.did === dids[2])!.channel
    await Promise.all([host.approve(bobChannel), host.approve(bobChannel)])
    await until(() => bob.snapshot().contacts[0]?.status === 'approved' && histories[2].has(first))
    expect(bob.snapshot().groups?.[0].members).toEqual(dids)
    expect(bob.snapshot().groups?.[0].names).toEqual({
      [dids[0]]: 'Host',
      [dids[1]]: 'Alice',
      [dids[2]]: 'Bob'
    })
    const late = add(2, group, 'Bob with an earlier Lamport clock', 1)
    await until(() => histories[1].has(late))
    expect(histories[1].get(late)?.authorDID).toBe(dids[2])
    const own = add(0, group, 'Host broadcast', 100)
    await until(() => histories[1].has(own) && histories[2].has(own))
    await host.close()
    const offline = add(1, group, 'Saved while the host is away', 51)
    host = new PeerChatService(options[0])
    await host.resume()
    await until(() => histories[2].has(offline))
    await host.block(bobChannel)
    const removed = add(2, group, 'Not authorized after removal', 2)
    const privateMessage = add(0, group, 'Only remaining members', 101)
    await until(() => histories[1].has(privateMessage))
    expect(histories[2].has(privateMessage)).toBe(false)
    expect(histories[0].has(removed)).toBe(false)
    await until(() => bob.snapshot().contacts[0]?.status === 'blocked')
    expect(host.snapshot().groups?.[0].members).toEqual(dids.slice(0, 2))
  } finally {
    await host.close()
    await alice.close()
    await bob.close()
    rmSync(dir, { recursive: true, force: true })
  }
}, 90000)

it('shares approval links across people, isolates channels and public readers, and revokes admission', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xnet-chat-access-'))
  const seeds = Array.from({ length: 4 }, () => randomBytes(32))
  const dids = seeds.map((seed) => createBinding(seed, 'a'.repeat(64)).did)
  const histories = seeds.map(() => new Map<string, WireChange>())
  const peers = seeds.map(
    (seed, i) =>
      new PeerChatService({
        directory: join(dir, String(i)),
        seed,
        changed: () => {},
        apply: async ({ changes }) => {
          for (const change of changes) histories[i].set(change.hash, change)
        },
        read: async (channel, author, cursor) =>
          [...histories[i].values()]
            .filter(
              (change) =>
                change.payload.nodeId.startsWith(peerMessagePrefix(channel, author)) &&
                (change.lamport > cursor.lamport ||
                  (change.lamport === cursor.lamport && change.hash > cursor.hash))
            )
            .sort((a, b) => a.lamport - b.lamport || a.hash.localeCompare(b.hash))
            .slice(0, 3)
      })
  )
  const [host, alice, bob, outsider] = peers
  const add = (
    author: number,
    channel: string,
    content: string,
    lamport: number,
    inReplyTo?: string
  ) => {
    const signed = signChange(
      createUnsignedChange({
        id: randomUUID(),
        type: 'node-change',
        payload: {
          nodeId: peerMessagePrefix(channel, dids[author]) + randomUUID(),
          schemaId: ChatMessageSchema._schemaId,
          properties: { channel, content, ...(inReplyTo ? { inReplyTo } : {}) }
        },
        lamport,
        authorDID: dids[author],
        parentHash: null
      }),
      seeds[author]
    )
    const wire = { ...signed, signature: Array.from(signed.signature) }
    histories[author].set(wire.hash, wire)
    return wire
  }
  try {
    const group = await host.createChatGroup({ name: 'Book club', access: 'approval' })
    const root = add(0, group, 'Private until approval', 1)
    const link = await host.inviteToGroup(group)
    await Promise.all([alice.join(link), bob.join(link)])
    await until(() => host.snapshot().contacts.filter((c) => c.status === 'pending').length === 2)
    expect(histories[1].size).toBe(0)
    expect(histories[2].size).toBe(0)
    for (const contact of host.snapshot().contacts) await host.approve(contact.channel)
    await until(() => histories[1].has(root.hash) && histories[2].has(root.hash))
    await expect(host.addChannel({ groupId: group, name: 'general' })).rejects.toThrow(
      'already exists'
    )
    expect(host.snapshot().groups?.[0].channels?.map((c) => c.name)).toEqual(['Book club'])
    const channel = await host.addChannel({ groupId: group, name: 'Books' })
    const topic = add(0, channel, 'A separate topic', 1)
    await until(() => histories[1].has(topic.hash) && histories[2].has(topic.hash))
    const reply = add(1, channel, 'Reply inside Books', 2, topic.payload.nodeId)
    await until(() => histories[2].has(reply.hash))
    expect(bob.snapshot().groups?.[0].channels?.map((c) => c.name)).toEqual(['General', 'Books'])
    await expect(host.setGroupAccess({ groupId: group, access: 'public' })).rejects.toThrow(
      'separate group'
    )
    await host.revokeLink(group)
    await outsider.join(link)
    await until(() => !!outsider.snapshot().contacts[0]?.error)
    expect(histories[3].size).toBe(0)
    expect(host.snapshot().contacts).toHaveLength(2)
    const publicGroup = await host.createChatGroup({ name: 'Open studio', access: 'public' })
    const publicPost = add(0, publicGroup, 'Anyone may read this', 1)
    await outsider.join(await host.inviteToGroup(publicGroup))
    await until(
      () =>
        outsider
          .snapshot()
          .contacts.some((c) => c.groupId === publicGroup && c.status === 'viewing') &&
        histories[3].has(publicPost.hash)
    )
    expect(host.snapshot().groups?.find((g) => g.id === publicGroup)?.members).toEqual([dids[0]])
    expect(histories[3].has(root.hash)).toBe(false)
    const injected = add(3, publicGroup, 'Not a member yet', 1)
    await new Promise((resolve) => setTimeout(resolve, 3500))
    expect(histories[0].has(injected.hash)).toBe(false)
    histories[3].delete(injected.hash)
    await outsider.joinPublic(publicGroup)
    const joined = add(3, publicGroup, 'Now I have joined', 2)
    await until(() => histories[0].has(joined.hash))
    expect(host.snapshot().groups?.find((g) => g.id === publicGroup)?.members).toContain(dids[3])
  } finally {
    await Promise.all(peers.map((peer) => peer.close()))
    rmSync(dir, { recursive: true, force: true })
  }
}, 90000)
