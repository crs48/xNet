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
 *
 * A daemon restart used to lose the whole map (exploration 0391 called this
 * out), forcing every open conversation to re-seed. Exploration 0392 makes the
 * map optionally **durable**: pass a {@link SessionPersistence} (the CLI wires
 * {@link fileSessionPersistence} under `~/.xnet/agent-home`) and the map is
 * seeded on start and written through on every record, so a restart continues
 * the CLI sessions instead of amnesia.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
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

/**
 * A durable backing store for the fingerprint → session map. Injected (rather
 * than hard-coding `fs`) so the store stays unit-testable; {@link fileSessionPersistence}
 * is the production file-backed implementation.
 */
export interface SessionPersistence {
  /** Return the persisted `[fingerprint, sessionId]` entries, oldest-first, or `undefined`. */
  load(): Array<[string, string]> | undefined
  /** Persist the current entries (oldest-first). Called on every record. */
  save(entries: Array<[string, string]>): void
}

/** Options for {@link createBridgeSessionStore} (a bare number stays the limit). */
export interface BridgeSessionStoreOptions {
  /** Max fingerprints retained (oldest evicted). Default 256. */
  limit?: number
  /** Optional durable backing — seeds on start, writes through on record. */
  persistence?: SessionPersistence
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

export function createBridgeSessionStore(
  options: number | BridgeSessionStoreOptions = {}
): BridgeSessionStore {
  const { limit = 256, persistence } =
    typeof options === 'number' ? { limit: options, persistence: undefined } : options
  const sessions = new Map<string, string>()
  // Seed from the durable store (oldest-first, so eviction order is preserved).
  const persisted = persistence?.load()
  if (persisted) {
    for (const [key, sessionId] of persisted) sessions.set(key, sessionId)
    while (sessions.size > limit) {
      const oldest = sessions.keys().next().value
      if (oldest === undefined) break
      sessions.delete(oldest)
    }
  }
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
          return {
            prompt: flattenChat(messages.slice(lastAssistant + 1)),
            resumeSessionId: sessionId
          }
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
      persistence?.save([...sessions.entries()])
    }
  }
}

/**
 * A file-backed {@link SessionPersistence}. Stores the map as JSON
 * (`{ version, entries: [[fingerprint, sessionId], …] }`) at `filePath`. A
 * missing or corrupt file loads as empty (so a restart degrades to full-history
 * re-seed, never a crash); the parent directory is created on first save.
 */
export function fileSessionPersistence(filePath: string): SessionPersistence {
  return {
    load() {
      try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown
        const entries = (parsed as { entries?: unknown })?.entries
        if (!Array.isArray(entries)) return undefined
        return entries.filter(
          (e): e is [string, string] =>
            Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string'
        )
      } catch {
        return undefined // missing / unreadable / corrupt → start fresh
      }
    },
    save(entries) {
      try {
        mkdirSync(dirname(filePath), { recursive: true })
        writeFileSync(filePath, JSON.stringify({ version: 1, entries }), 'utf8')
      } catch {
        // Best-effort durability: a write failure must never break a live turn.
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
