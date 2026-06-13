/**
 * First-contact-aware DM opening (exploration 0176/0177).
 *
 * `useDmOpen().openDm(them)` opens a DM directly when `them` is known (existing
 * channel or mutual wave) and otherwise files a MessageRequest the recipient
 * must accept. `useMessageRequests()` is the receiving side: pending requests
 * with accept/decline. Together these gate cold contact (the dating-safety core).
 */
import { dmChannelId, ensureDmChannel } from '@xnetjs/comms'
import { ChannelSchema, MessageRequestSchema, ProfileSchema } from '@xnetjs/data'
import { useXNet, useQuery } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { ConnectionWaveSchema } from '@xnetjs/social/connect'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { navigateToNode } from '../workbench/navigation'
import { isFirstContact, type WaveEdge } from '../lib/first-contact'

type Row = Record<string, unknown>

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export type DmOpenResult =
  | { opened: true; channelId: string }
  | { requested: true }
  | { blocked: true }

export function useDmOpen(): {
  openDm: (them: string, firstMessage?: string) => Promise<DmOpenResult>
} {
  const { authorDID } = useXNet()
  const bridge = useDataBridge()
  const navigate = useNavigate()
  const me = authorDID ?? ''
  const { data: channels } = useQuery(ChannelSchema, {})
  const { data: waves } = useQuery(ConnectionWaveSchema, {})

  const knownChannelIds = useMemo(() => {
    const ids = new Set<string>()
    for (const channel of (channels ?? []) as unknown as Row[]) {
      const id = str(channel.id)
      if (id) ids.add(id)
    }
    return ids
  }, [channels])

  const waveEdges = useMemo<WaveEdge[]>(() => {
    return ((waves ?? []) as unknown as Row[]).flatMap((row) => {
      const fromDid = str(row.fromDid)
      const toDid = str(row.toDid)
      return fromDid && toDid ? [{ fromDid, toDid }] : []
    })
  }, [waves])

  const openDm = useCallback(
    async (them: string, firstMessage?: string): Promise<DmOpenResult> => {
      if (!bridge || !me || them === me) return { requested: true }

      if (isFirstContact({ me, them, waves: waveEdges, knownChannelIds })) {
        await bridge.create(MessageRequestSchema, {
          conversationKey: dmChannelId([me, them]),
          sender: me as `did:key:${string}`,
          recipient: them as `did:key:${string}`,
          status: 'pending',
          admission: 'message-request',
          reasonCodes: ['first-contact'],
          firstMessagePreview: firstMessage?.slice(0, 1000)
        })
        return { requested: true }
      }

      const { channelId } = await ensureDmChannel(bridge, [me, them])
      navigateToNode(navigate, 'channel', channelId)
      return { opened: true, channelId }
    },
    [bridge, me, navigate, waveEdges, knownChannelIds]
  )

  return { openDm }
}

export type PendingRequest = {
  id: string
  sender: string
  displayName: string
  preview?: string
}

export interface MessageRequestsController {
  requests: PendingRequest[]
  accept: (id: string, sender: string) => Promise<void>
  decline: (id: string) => Promise<void>
}

export function useMessageRequests(): MessageRequestsController {
  const { authorDID } = useXNet()
  const bridge = useDataBridge()
  const navigate = useNavigate()
  const me = authorDID ?? ''
  const { data: requests } = useQuery(MessageRequestSchema, {
    where: { recipient: me as `did:key:${string}`, status: 'pending' }
  })
  const { data: people } = useQuery(ProfileSchema, {})

  const list = useMemo<PendingRequest[]>(() => {
    if (!me) return []
    const nameByDid = new Map<string, string>()
    for (const person of (people ?? []) as unknown as Row[]) {
      const did = str(person.did)
      const name = str(person.displayName)
      if (did && name) nameByDid.set(did, name)
    }
    return ((requests ?? []) as unknown as Row[])
      .filter((row) => str(row.recipient) === me && (str(row.status) ?? 'pending') === 'pending')
      .map((row) => {
        const sender = str(row.sender) ?? ''
        return {
          id: str(row.id) ?? '',
          sender,
          displayName: nameByDid.get(sender) ?? `${sender.slice(0, 16)}…`,
          preview: str(row.firstMessagePreview)
        }
      })
      .filter((request) => request.id && request.sender)
  }, [me, requests, people])

  const accept = useCallback(
    async (id: string, sender: string) => {
      if (!bridge || !me) return
      const { channelId } = await ensureDmChannel(bridge, [me, sender])
      await bridge.update(id, { status: 'accepted', respondedAt: Date.now() })
      navigateToNode(navigate, 'channel', channelId)
    },
    [bridge, me, navigate]
  )

  const decline = useCallback(
    async (id: string) => {
      if (!bridge) return
      await bridge.update(id, { status: 'rejected', respondedAt: Date.now() })
    },
    [bridge]
  )

  return { requests: list, accept, decline }
}
