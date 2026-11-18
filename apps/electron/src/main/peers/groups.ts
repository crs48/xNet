import type { PeerGroup, GroupAccess, PeerChannel } from '@xnetjs/workbench/peer-chat'
import { sign, verify } from '@xnetjs/crypto'
import { identityFromPrivateKey, parseDID } from '@xnetjs/identity'

export type GroupDescriptor = Pick<PeerGroup, 'id' | 'name' | 'owner'>
export type GroupManifest = GroupDescriptor & {
  version: 1 | 2
  access?: GroupAccess
  channels?: PeerChannel[]
  revision: number
  members: string[]
  signature: string
}
const bytes = (group: Omit<GroupManifest, 'signature'>): Buffer =>
  Buffer.from(
    JSON.stringify([
      'xnet/peer-group/1',
      group.id,
      group.name,
      group.owner,
      group.revision,
      group.members,
      ...(group.version === 2 ? [group.access, group.channels] : [])
    ])
  )
export function signGroup(
  seed: Uint8Array,
  group: Omit<GroupManifest, 'signature' | 'owner' | 'version'>
): GroupManifest {
  const value = {
    ...group,
    version: (group.access || group.channels ? 2 : 1) as 1 | 2,
    owner: identityFromPrivateKey(seed).did
  }
  const signed = { ...value, signature: Buffer.from(sign(bytes(value), seed)).toString('hex') }
  return validateGroup(signed, value)
}
export function validateGroup(
  raw: unknown,
  expected: Pick<GroupDescriptor, 'id' | 'owner'>
): GroupManifest {
  const group = raw as GroupManifest | null
  if (
    !group ||
    ![1, 2].includes(group.version) ||
    group.id !== expected.id ||
    group.owner !== expected.owner ||
    !/^iroh-[a-f0-9-]{36}$/.test(group.id) ||
    typeof group.name !== 'string' ||
    !group.name.trim() ||
    group.name.length > 80 ||
    !Number.isSafeInteger(group.revision) ||
    group.revision < 1 ||
    !Array.isArray(group.members) ||
    group.members.length < 1 ||
    group.members.length > 8 ||
    new Set(group.members).size !== group.members.length ||
    !group.members.includes(group.owner) ||
    group.members.some(
      (did) => typeof did !== 'string' || !did.startsWith('did:key:') || did.length > 100
    ) ||
    typeof group.signature !== 'string' ||
    !/^[a-f0-9]{128}$/.test(group.signature)
  )
    throw new Error('Invalid group membership.')
  if (
    group.version === 2 &&
    (!['invite', 'approval', 'public'].includes(group.access ?? '') ||
      !Array.isArray(group.channels) ||
      group.channels.length < 1 ||
      group.channels.length > 16 ||
      group.channels[0]?.id !== group.id ||
      new Set(group.channels.map((channel) => channel.id)).size !== group.channels.length ||
      group.channels.some(
        (channel) =>
          (channel.id !== group.id &&
            !new RegExp(`^${group.id}-channel-[a-f0-9-]{36}$`).test(channel.id)) ||
          typeof channel.name !== 'string' ||
          !channel.name.trim() ||
          channel.name.length > 80
      ))
  )
    throw new Error('Invalid group channels or access.')
  for (const did of group.members) parseDID(did as `did:key:${string}`)
  if (
    !verify(
      bytes(group),
      Buffer.from(group.signature, 'hex'),
      parseDID(group.owner as `did:key:${string}`)
    )
  )
    throw new Error('The group membership signature is invalid.')
  return {
    version: group.version,
    id: group.id,
    name: group.name,
    owner: group.owner,
    revision: group.revision,
    members: [...group.members],
    ...(group.version === 2
      ? {
          access: group.access,
          channels: group.channels!.map((channel) => ({ id: channel.id, name: channel.name }))
        }
      : {}),
    signature: group.signature
  }
}

export const groupChannels = (group: GroupManifest): PeerChannel[] =>
  group.channels ?? [{ id: group.id, name: group.name }]

export function messageChannel(
  group: GroupManifest | undefined,
  fallback: string,
  nodeId: string
): string {
  const channel = (group ? groupChannels(group) : [{ id: fallback }]).find((entry) =>
    nodeId.startsWith(`${entry.id}-message-`)
  )
  if (!channel) throw new Error('Message is outside the authorized channels.')
  return channel.id
}
