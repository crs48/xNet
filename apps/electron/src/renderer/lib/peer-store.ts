import { ChannelSchema, SpaceSchema, SpaceMembershipSchema, type SchemaIRI } from '@xnetjs/data'
import { useNodeStore } from '@xnetjs/react/internal'
import { useEffect } from 'react'

/** Only the native transport can project signed membership and authorized channels. */
export function usePeerStore(): void {
  const { store, isReady } = useNodeStore()
  useEffect(() => {
    if (!store || !isReady) return
    let tail = Promise.resolve()
    return window.xnetPeers.onStore(async ({ contact, me, changes, group }) => {
      const apply = async () => {
        const root = group?.id ?? contact.channel
        const channels = group?.channels ?? [{ id: root, name: contact.name }]
        const members = group?.members ?? [me, contact.binding.did]
        const owner = group?.owner ?? me
        const space = `${root}-space`
        const ensure = async (
          id: string,
          schemaId: SchemaIRI,
          properties: Record<string, unknown>
        ) => {
          const existing = await store.get(id)
          if (!existing) await store.create({ id, schemaId, properties })
          else {
            if (group && existing.deleted) await store.restore(id)
            const delta = Object.fromEntries(
              Object.entries(properties).filter(
                ([key, value]) => JSON.stringify(existing.properties[key]) !== JSON.stringify(value)
              )
            )
            if (Object.keys(delta).length) await store.update(id, { properties: delta })
          }
        }
        const existingSpace = await store.get(space)
        if (
          group &&
          existingSpace &&
          Array.isArray(existingSpace.properties.owners) &&
          !existingSpace.properties.owners.includes(owner) &&
          !(
            existingSpace.createdBy === me &&
            existingSpace.properties.owners.length === 1 &&
            existingSpace.properties.owners[0] === me
          )
        )
          throw new Error('This group ID already belongs to another owner.')
        await ensure(space, SpaceSchema._schemaId, {
          name: group?.name ?? contact.name,
          kind: channels.length > 1 ? 'community' : 'team',
          visibility: group?.access === 'public' ? 'public' : 'private',
          owners: [owner]
        })
        const previous = await store.get(root)
        if (group && Array.isArray(previous?.properties.members)) {
          for (const member of previous.properties.members) {
            if (typeof member === 'string' && !members.includes(member)) {
              const id = `${root}-member-${member}`
              const old = await store.get(id)
              if (old && !old.deleted) await store.delete(id)
            }
          }
        }
        for (const [index, member] of members.entries())
          await ensure(
            `${root}-member-${group ? member : index}`,
            SpaceMembershipSchema._schemaId,
            {
              space,
              member,
              role: member === owner ? 'owner' : 'member',
              addedBy: owner,
              // Preserve the original membership timestamp on later projections.
              addedAt:
                (await store.get(`${root}-member-${group ? member : index}`))?.properties.addedAt ??
                Date.now()
            }
          )
        for (const channel of channels)
          await ensure(channel.id, ChannelSchema._schemaId, {
            name: channel.name,
            kind: group ? 'channel' : 'dm',
            members,
            space,
            visibility: 'inherit'
          })
        for (const wire of changes) {
          const change = { ...wire, signature: new Uint8Array(wire.signature) }
          const channel = channels.find((entry) =>
            change.payload.nodeId.startsWith(`${entry.id}-message-`)
          )?.id
          if (!channel) throw new Error('Message is outside this group’s channels.')
          const existing = await store.get(change.payload.nodeId)
          if (
            existing &&
            (existing.createdBy !== change.authorDID || existing.properties.channel !== channel)
          )
            throw new Error('Peer message ownership does not match this chat.')
          await store.applyRemoteChange(change)
          if (!(await store.hasChange(change.hash)))
            throw new Error(
              'The local database refused a peer message. It has not been acknowledged.'
            )
        }
      }
      const result = tail.then(apply)
      tail = result.catch(() => {})
      return result
    })
  }, [store, isReady])
}
