/**
 * useMessageReactions — per-message emoji reactions over the existing Reaction
 * schema (0198). One indexed query per message (where target = messageId),
 * grouped into pills; toggling creates or removes the viewer's Reaction node so
 * the change syncs like any other node and the pill updates live.
 */
import { ChatMessageSchema, ReactionSchema } from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { useCallback, useMemo } from 'react'
import { groupReactions, type ReactionGroup, type ReactionLike } from './reactions'

export interface MessageReactions {
  groups: ReactionGroup[]
  toggle: (emoji: string) => Promise<void>
}

export function useMessageReactions(messageId: string, me: string): MessageReactions {
  const { data } = useQuery(ReactionSchema, { where: { target: messageId } })
  const { create, remove } = useMutate()

  const reactions = useMemo<ReactionLike[]>(
    () =>
      (data ?? []).map((node) => {
        const n = node as unknown as Record<string, unknown>
        return {
          id: n.id as string,
          emoji: n.emoji as string | undefined,
          reactor: (n.reactor as string) ?? '',
          reactionType: (n.reactionType as string) ?? 'emoji'
        }
      }),
    [data]
  )

  const groups = useMemo(() => groupReactions(reactions, me), [reactions, me])

  const toggle = useCallback(
    async (emoji: string) => {
      const existing = groups.find((group) => group.emoji === emoji && group.mine)
      if (existing?.myReactionId) {
        await remove(existing.myReactionId)
        return
      }
      await create(ReactionSchema, {
        target: messageId,
        targetSchema: ChatMessageSchema._schemaId,
        reactionType: 'emoji',
        reactor: me as `did:key:${string}`,
        emoji
      })
    },
    [groups, remove, create, messageId, me]
  )

  return { groups, toggle }
}
