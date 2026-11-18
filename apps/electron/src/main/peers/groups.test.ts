import { randomBytes, randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { signGroup, validateGroup } from './groups'
import { createBinding, decodeInvite, encodeInvite } from './protocol'

it('pins group authority and rejects forged, oversized and cross-group membership', () => {
  const seed = randomBytes(32),
    binding = createBinding(seed, 'a'.repeat(64))
  const group = signGroup(seed, {
    id: `iroh-${randomUUID()}`,
    name: 'Friends',
    revision: 1,
    members: [binding.did]
  })
  expect(validateGroup(group, group)).toEqual(group)
  expect(() => validateGroup({ ...group, revision: 2 }, group)).toThrow()
  expect(() => validateGroup({ ...group, members: [] }, group)).toThrow()
  expect(() => validateGroup(group, { ...group, id: `iroh-${randomUUID()}` })).toThrow()
  expect(() => validateGroup(signGroup(randomBytes(32), { ...group }), group)).toThrow()
  const members = Array.from(
    { length: 8 },
    () => createBinding(randomBytes(32), 'b'.repeat(64)).did
  )
  expect(() => signGroup(seed, { ...group, members: [binding.did, ...members] })).toThrow()
})
it('requires an explicit v2 invitation for a group owned by the pinned peer', () => {
  const seed = randomBytes(32),
    binding = createBinding(seed, 'a'.repeat(64))
  const group = { id: `iroh-${randomUUID()}`, name: 'Friends', owner: binding.did }
  const invite = {
    version: 2 as const,
    group,
    name: group.name,
    channel: `iroh-${randomUUID()}`,
    secret: 'a'.repeat(64),
    expires: Date.now() + 60000,
    ticket: 'ticket',
    binding
  }
  expect(decodeInvite(encodeInvite(invite)).group).toEqual(group)
  expect(() => decodeInvite(encodeInvite({ ...invite, version: 1 }))).toThrow()
  expect(() =>
    decodeInvite(
      encodeInvite({
        ...invite,
        group: { ...group, owner: createBinding(randomBytes(32), 'c'.repeat(64)).did }
      })
    )
  ).toThrow()
})

it('binds access and child channels to the signed group namespace', () => {
  const seed = randomBytes(32)
  const id = `iroh-${randomUUID()}`
  const owner = createBinding(seed, 'a'.repeat(64)).did
  const signed = signGroup(seed, {
    id,
    name: 'Friends',
    revision: 1,
    members: [owner],
    access: 'approval',
    channels: [
      { id, name: 'General' },
      { id: `${id}-channel-${randomUUID()}`, name: 'Books' }
    ]
  })
  expect(validateGroup(signed, signed).channels).toHaveLength(2)
  expect(() => validateGroup({ ...signed, access: 'public' }, signed)).toThrow('signature')
  expect(() =>
    signGroup(seed, {
      ...signed,
      channels: [
        { id, name: 'General' },
        { id: `iroh-${randomUUID()}`, name: 'Someone else’s private chat' }
      ]
    })
  ).toThrow('channels')
})
