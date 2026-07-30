/**
 * Framed bridge client (exploration 0394, closing 0392's loop).
 *
 * The bridge daemon has spoken a richer wire than the panel consumed: the
 * OpenAI-compatible `/v1/chat/completions` flattens every tool call, cost
 * figure, and permission ask into text, while `/v1/agent/stream` forwards
 * them as structured frames — tested and clientless since #623. This is the
 * first real client: an {@link AIProvider} whose `stream()` speaks the framed
 * endpoint, yielding text deltas to the runtime while forwarding the
 * structured frames to the panel for display.
 *
 * The frame union is parsed structurally (defensive, field-by-field) rather
 * than imported from `@xnetjs/devkit`: the daemon on the other end may be any
 * version, so the wire is the contract, not a shared type.
 */

import type { AIMessage, AIProvider, AIStreamChunk } from '@xnetjs/plugins'

/** The structured frames the panel renders (ACP-aligned names, 0392). */
export type BridgeAgentFrame =
  | { type: 'session'; sessionId: string; capabilities?: string[] }
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; input?: unknown }
  | { type: 'tool_result'; id: string; ok: boolean; content?: string }
  | { type: 'permission_request'; id: string; tool: string; input?: unknown }
  | { type: 'cost'; usd?: number; inputTokens?: number; outputTokens?: number }
  | { type: 'result'; ok: boolean; text?: string; sessionId?: string; error?: string }

/** Parse one SSE `data:` payload into a frame, or null for noise. */
export function parseBridgeFrame(payload: string): BridgeAgentFrame | null {
  let raw: unknown
  try {
    raw = JSON.parse(payload)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const frame = raw as Record<string, unknown>
  switch (frame.type) {
    case 'session':
      return typeof frame.sessionId === 'string'
        ? {
            type: 'session',
            sessionId: frame.sessionId,
            ...(Array.isArray(frame.capabilities)
              ? {
                  capabilities: frame.capabilities.filter((c): c is string => typeof c === 'string')
                }
              : {})
          }
        : null
    case 'delta':
      return typeof frame.text === 'string' ? { type: 'delta', text: frame.text } : null
    case 'tool_call':
      return typeof frame.id === 'string' && typeof frame.name === 'string'
        ? { type: 'tool_call', id: frame.id, name: frame.name, input: frame.input }
        : null
    case 'tool_result':
      return typeof frame.id === 'string'
        ? {
            type: 'tool_result',
            id: frame.id,
            ok: frame.ok !== false,
            ...(typeof frame.content === 'string' ? { content: frame.content } : {})
          }
        : null
    case 'permission_request':
      return typeof frame.id === 'string' && typeof frame.tool === 'string'
        ? { type: 'permission_request', id: frame.id, tool: frame.tool, input: frame.input }
        : null
    case 'cost':
      return {
        type: 'cost',
        ...(typeof frame.usd === 'number' ? { usd: frame.usd } : {}),
        ...(typeof frame.inputTokens === 'number' ? { inputTokens: frame.inputTokens } : {}),
        ...(typeof frame.outputTokens === 'number' ? { outputTokens: frame.outputTokens } : {})
      }
    case 'result':
      return {
        type: 'result',
        ok: frame.ok !== false,
        ...(typeof frame.text === 'string' ? { text: frame.text } : {}),
        ...(typeof frame.sessionId === 'string' ? { sessionId: frame.sessionId } : {}),
        ...(typeof frame.error === 'string' ? { error: frame.error } : {})
      }
    default:
      return null
  }
}

/**
 * Split an SSE byte stream into `data:` payload strings. `[DONE]` ends the
 * stream. Exposed for tests; the provider consumes it below.
 */
export async function* sseDataPayloads(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      for (;;) {
        const boundary = buffer.indexOf('\n\n')
        if (boundary < 0) break
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        for (const line of block.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') return
          yield payload
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export type FramedBridgeProviderConfig = {
  baseUrl: string
  /** The pairing token (Bearer). */
  token: string
  /** Structured frames for the panel (tool activity, cost, permission asks). */
  onFrame?: (frame: BridgeAgentFrame) => void
  fetchImpl?: typeof fetch
}

/**
 * The framed endpoint as an {@link AIProvider}: `stream()` yields the text
 * deltas the runtime renders, and every structured frame is forwarded to
 * `onFrame`. A terminal error frame throws so a failed turn is a failed run,
 * never a silent empty reply.
 */
export function createFramedBridgeProvider(config: FramedBridgeProviderConfig): AIProvider {
  const fetchImpl = config.fetchImpl ?? fetch
  const name = 'bridge-framed'

  async function* run(messages: AIMessage[]): AsyncIterable<AIStreamChunk> {
    const response = await fetchImpl(`${config.baseUrl}/v1/agent/stream`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.token}`
      },
      body: JSON.stringify({
        messages: messages.map((message) => ({ role: message.role, content: message.content }))
      })
    })
    if (!response.ok || !response.body) {
      throw new Error(`bridge framed endpoint: HTTP ${response.status}`)
    }
    for await (const payload of sseDataPayloads(response.body)) {
      const frame = parseBridgeFrame(payload)
      if (!frame) continue
      config.onFrame?.(frame)
      if (frame.type === 'delta' && frame.text) {
        yield { type: 'text', text: frame.text, provider: name, model: 'agent' }
      } else if (frame.type === 'result') {
        if (!frame.ok) throw new Error(frame.error ?? 'agent turn failed')
        return
      }
    }
  }

  return {
    name,
    async generate(prompt: string): Promise<string> {
      let text = ''
      for await (const chunk of run([{ role: 'user', content: prompt }])) {
        if (chunk.type === 'text') text += chunk.text
      }
      return text
    },
    stream(request) {
      const messages: AIMessage[] =
        request.messages && request.messages.length
          ? request.messages
          : [{ role: 'user', content: request.prompt ?? '' }]
      return run(messages)
    }
  }
}
