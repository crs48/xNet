import {
  ChannelSchema,
  ProfileSchema,
  SpaceSchema,
  SpaceMembershipSchema,
  profileNodeId
} from '@xnetjs/data'
import {
  useQuery,
  useDataBridge,
  useIdentity,
  useMutate,
  useXNet,
  channelShareRoom
} from '@xnetjs/react'
import { useEffect, useMemo } from 'react'
import { shortDid, type Did } from './model'
export function useCommunityData() {
  const { did } = useIdentity()
  const { syncManager } = useXNet()
  const bridge = useDataBridge()
  const mutation = useMutate()
  const channelQuery = useQuery(ChannelSchema, { orderBy: { updatedAt: 'desc' }, limit: 500 })
  const profileQuery = useQuery(ProfileSchema, { orderBy: { updatedAt: 'desc' }, limit: 500 })
  const spaceQuery = useQuery(SpaceSchema, { orderBy: { updatedAt: 'desc' }, limit: 500 })
  const memberQuery = useQuery(SpaceMembershipSchema, { limit: 2000 })
  const channels = useMemo(
    () => channelQuery.data.filter((c) => !c.archived && !c.target),
    [channelQuery.data]
  )
  const profiles = profileQuery.data
  const spaces = spaceQuery.data.filter((s) => !s.archived)
  const members = memberQuery.data
  const nameFor = (who: string | undefined) =>
    profiles.find((p) => p.did === who && p.createdBy === who)?.displayName ||
    (who === did ? 'You' : shortDid(who ?? 'Unknown'))
  const roomKey = channels
    .map((channel) => channel.id)
    .sort()
    .join('|')
  useEffect(() => {
    if (!syncManager || !roomKey) return
    const rooms = roomKey.split('|').map(channelShareRoom)
    for (const room of rooms) syncManager.subscribeShareRoom(room)
    return () => {
      for (const room of rooms) syncManager.unsubscribeShareRoom(room)
    }
  }, [syncManager, roomKey])
  const saveProfile = async (displayName: string) => {
    if (!bridge?.get || !did) throw new Error('Your identity is still loading.')
    const id = profileNodeId(did)
    if (await bridge.get(id)) await bridge.update(id, { displayName })
    else await bridge.create(ProfileSchema, { did: did as Did, displayName }, id)
  }
  return {
    did: did as Did | null,
    bridge,
    mutation,
    channels,
    profiles,
    spaces,
    members,
    nameFor,
    saveProfile,
    limited:
      channelQuery.data.length >= 500 ||
      spaceQuery.data.length >= 500 ||
      memberQuery.data.length >= 2000,
    loading: channelQuery.loading || spaceQuery.loading,
    error: channelQuery.error || profileQuery.error || spaceQuery.error || memberQuery.error
  }
}
export type CommunityData = ReturnType<typeof useCommunityData>
export type Conversation = CommunityData['channels'][number]
