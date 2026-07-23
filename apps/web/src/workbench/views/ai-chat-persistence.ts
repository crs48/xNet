/**
 * Persist AI conversations as workspace nodes (exploration 0391, Phase 2).
 *
 * Every AI thread becomes a real Channel node and each turn a ChatMessage —
 * the same schemas the comms surface uses — so a research conversation is
 * searchable (FTS-indexed like everything else), linkable, syncable, and
 * reopenable instead of evaporating with the panel. No new schema: reusing
 * Channel/ChatMessage keeps seed coverage and the comms UI's rendering free.
 *
 * Persistence is deliberately fire-and-forget from the panel's perspective:
 * a storage hiccup must never break the live chat (the transcript still
 * lives in panel state), so every step collapses failures to a warning.
 */

import type { DefinedSchema, InferCreateProps, PropertyBuilder } from '@xnetjs/data'
import { ChannelSchema, ChatMessageSchema } from '@xnetjs/data'

/** The minimal typed-create surface we need (a `DataBridge` satisfies it). */
export interface AiChatPersistenceStore {
  create<P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    data: InferCreateProps<P>,
    id?: string
  ): Promise<unknown>
}

/** Channel name for a conversation, derived from its opening message. */
export function aiChannelName(firstUserMessage: string): string {
  const compact = firstUserMessage.replace(/\s+/g, ' ').trim()
  const clipped = compact.length > 48 ? `${compact.slice(0, 47)}…` : compact
  return `AI · ${clipped || 'conversation'}`
}

export interface AiConversationLog {
  /** The Channel node id backing this conversation (set after the first turn). */
  readonly channelId: string | null
  /** Record the user's message, creating the channel on the first call. */
  logUserMessage(content: string, connectorLabel: string): Promise<void>
  /** Record the assistant's settled reply. */
  logAssistantReply(content: string): Promise<void>
}

/**
 * A per-conversation logger. Writes are serialized on an internal chain so
 * the channel exists before its first message even when callers don't await.
 */
export function createAiConversationLog(
  store: AiChatPersistenceStore,
  options: { warn?: (message: string, error: unknown) => void } = {}
): AiConversationLog {
  const warn =
    options.warn ??
    ((message: string, error: unknown) => console.warn(`[ai-chat] ${message}`, error))
  let channelId: string | null = null
  let chain: Promise<void> = Promise.resolve()

  const enqueue = (step: () => Promise<void>): Promise<void> => {
    chain = chain.then(step).catch((error) => {
      warn('failed to persist conversation turn', error)
    })
    return chain
  }

  return {
    get channelId() {
      return channelId
    },
    logUserMessage(content, connectorLabel) {
      return enqueue(async () => {
        if (!channelId) {
          const node = (await store.create(ChannelSchema, {
            kind: 'channel',
            name: aiChannelName(content),
            topic: `AI conversation — assistant replies via ${connectorLabel}`
          })) as { id?: string } | null
          if (!node?.id) throw new Error('channel create returned no id')
          channelId = node.id
        }
        await store.create(ChatMessageSchema, { channel: channelId, content })
      })
    },
    logAssistantReply(content) {
      return enqueue(async () => {
        if (!channelId || !content.trim()) return
        await store.create(ChatMessageSchema, { channel: channelId, content })
      })
    }
  }
}
