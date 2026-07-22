/**
 * @xnetjs/devkit — conversation → CLI-session mapping for the agent bridge
 * (exploration 0391).
 *
 * The bridge speaks the OpenAI chat protocol, which re-sends the FULL message
 * history every turn — while Claude Code keeps its own durable sessions that
 * `--resume` continues. This module bridges the two without any client-side
 * protocol change: after each reply we remember "a conversation whose
 * transcript ends exactly like this maps to CLI session S". When the next
 * request arrives, its history minus the new tail matches that fingerprint, so
 * we resume S and send only the NEW suffix (fresh context + the user's turn)
 * instead of re-flattening everything.
 *
 * Fingerprints hash only user/assistant content: the panel injects a fresh
 * context pack as system messages each turn, which must not break matching.
 * When nothing matches (daemon restarted, edited history, first turn) we fall
 * back to a fresh session seeded with the full flattened history — never a
 * context-less resume, so a miss costs latency, not correctness.
 */

import { createHash } from 'node:crypto'
import { flattenChat, type ChatMessage } from './chat-agent'

/** One planned bridge turn: what to send, and which session to continue. */
export interface BridgeTurnPlan {
  prompt: string
  resumeSessionId?: string
}

/** Remembers transcript fingerprints → CLI session ids (bounded, in-memory). */
export interface BridgeSessionStore {
  /** Plan the prompt + resume for an incoming OpenAI-protocol message list. */
  plan(messages: readonly ChatMessage[]): BridgeTurnPlan
  /** Record the finished turn so the conversation's next request resumes it. */
  record(messages: readonly ChatMessage[], replyText: string, sessionId: string): void
  readonly size: number
}

/** Hash of the user/assistant transcript (system/context messages excluded). */
export function transcriptKey(messages: readonly ChatMessage[]): string {
  const hash = createHash('sha256')
  for (const message of messages) {
    if (message.role === 'system') continue
    hash.update(message.role)
    hash.update('\u0000')
    hash.update(message.content)
    hash.update('\u0001')
  }
  return hash.digest('base64')
}

export function createBridgeSessionStore(limit = 256): BridgeSessionStore {
  const sessions = new Map<string, string>()
  return {
    get size() {
      return sessions.size
    },
    plan(messages) {
      // The stored fingerprint ends at the previous assistant reply, so match
      // on the history up to (and including) the last assistant message.
      const lastAssistant = findLastAssistantIndex(messages)
      if (lastAssistant >= 0) {
        const sessionId = sessions.get(transcriptKey(messages.slice(0, lastAssistant + 1)))
        if (sessionId) {
          // Resume: send only what's new since that reply — any freshly
          // injected system context plus the user's turn.
          return { prompt: flattenChat(messages.slice(lastAssistant + 1)), resumeSessionId: sessionId }
        }
      }
      return { prompt: flattenChat(messages) }
    },
    record(messages, replyText, sessionId) {
      const key = transcriptKey([...messages, { role: 'assistant', content: replyText }])
      sessions.delete(key)
      sessions.set(key, sessionId)
      // Bounded: evict oldest fingerprints (Map preserves insertion order).
      while (sessions.size > limit) {
        const oldest = sessions.keys().next().value
        if (oldest === undefined) break
        sessions.delete(oldest)
      }
    }
  }
}

function findLastAssistantIndex(messages: readonly ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return i
  }
  return -1
}
