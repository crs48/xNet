/**
 * Buzz relay client (exploration 0416).
 *
 * Subscribes to a Nostr relay for tool-call requests addressed to the operator,
 * and routes each one through xNet's own guardrail. The routing is the point:
 * a Buzz agent does not get to call tools directly, it gets to *ask*, and the
 * answer comes back through the same risk-tiered ceremony and audit recorder
 * every other agent goes through (exploration 0337).
 *
 * The socket is injected rather than constructed. A `WebSocket` here would make
 * the module untestable without a live relay and unusable in the Electron main
 * process, and the transport is the least interesting part of the design.
 */

import { verifyNostrEvent, type NostrEvent } from './event'
import { bytesToHex, decodeNpub } from './nip19'

/** The subset of `WebSocket` this client needs. */
export type RelaySocket = {
  send(data: string): void
  close(): void
  addEventListener(type: 'message', handler: (event: { data: string }) => void): void
  addEventListener(type: 'close', handler: () => void): void
}

export type RelaySocketFactory = (url: string) => RelaySocket

/**
 * What the guardrail exposes to the relay. Structurally the `AgentAuditRecorder`
 * from `@xnetjs/plugins`, narrowed so `comms` does not depend on it.
 */
export type GuardedToolCaller = {
  callTool(
    name: string,
    args?: Record<string, unknown>,
    instruction?: string
  ): Promise<unknown>
}

/** A tool call requested by a Buzz agent. */
export type BuzzToolRequest = {
  /** Nostr event id — used as the correlation id for the reply. */
  requestId: string
  /** Hex pubkey of the requesting agent. */
  pubkey: string
  tool: string
  args: Record<string, unknown>
  /** The originating human instruction, when the agent relays one. */
  instruction?: string
}

export type BuzzRelayOptions = {
  relayUrl: string
  /** Only events from this agent's npub are honoured. */
  agentNpub: string
  /** The guardrail every request is routed through. */
  guard: GuardedToolCaller
  connect: RelaySocketFactory
  /** Nostr kind carrying tool-call requests. */
  kind?: number
  /** Reports transport/decode problems. Defaults to `console.warn`. */
  onWarning?: (message: string) => void
}

/** Nostr event kind Buzz uses for xNet tool-call requests. */
export const BUZZ_TOOL_REQUEST_KIND = 27236

/**
 * Parse a relay frame into a tool request.
 *
 * Returns `null` — never a partially-populated request — for anything that is
 * not a verified, correctly-addressed tool call from the enrolled agent.
 */
export function parseToolRequest(
  frame: string,
  expectedPubkeyHex: string,
  kind: number
): BuzzToolRequest | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(frame)
  } catch {
    return null
  }

  // Relay frames are `["EVENT", <subId>, <event>]`.
  if (!Array.isArray(parsed) || parsed[0] !== 'EVENT' || parsed.length < 3) return null
  const event = parsed[2] as NostrEvent

  if (event?.kind !== kind) return null
  if (event.pubkey !== expectedPubkeyHex) return null
  if (!verifyNostrEvent(event)) return null

  let body: { tool?: unknown; args?: unknown; instruction?: unknown }
  try {
    body = JSON.parse(event.content) as typeof body
  } catch {
    return null
  }
  if (typeof body.tool !== 'string') return null

  return {
    requestId: event.id,
    pubkey: event.pubkey,
    tool: body.tool,
    args:
      body.args && typeof body.args === 'object'
        ? (body.args as Record<string, unknown>)
        : {},
    instruction: typeof body.instruction === 'string' ? body.instruction : undefined
  }
}

export type BuzzRelayHandle = {
  /** Stop listening and close the socket. */
  close(): void
  /** Requests routed through the guardrail so far (diagnostics). */
  readonly handled: number
}

/**
 * Connect to a Buzz relay and route the enrolled agent's tool calls through
 * the guardrail.
 *
 * @throws {Error} If `agentNpub` is not a valid npub — an unparseable identity
 * must fail at setup, not silently accept every event at runtime.
 */
export function connectBuzzRelay(options: BuzzRelayOptions): BuzzRelayHandle {
  const {
    relayUrl,
    agentNpub,
    guard,
    connect,
    kind = BUZZ_TOOL_REQUEST_KIND,
    onWarning = (m: string) => console.warn(`[xnet/buzz] ${m}`)
  } = options

  const pubkey = decodeNpub(agentNpub)
  if (!pubkey) throw new Error(`Not a valid npub: ${agentNpub}`)
  const pubkeyHex = bytesToHex(pubkey)

  const socket = connect(relayUrl)
  let handled = 0
  let closed = false

  socket.addEventListener('message', (message) => {
    const request = parseToolRequest(message.data, pubkeyHex, kind)
    if (!request) return

    handled += 1
    // Every call goes through the guardrail — including the ceremony, which
    // may park it. A parked call simply resolves to a pending payload the
    // agent relays back to the operator.
    void guard
      .callTool(request.tool, request.args, request.instruction)
      .then((result) => {
        socket.send(JSON.stringify(['XNET-RESULT', request.requestId, { ok: true, result }]))
      })
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err)
        // Report the refusal to the agent rather than dropping it: a silent
        // non-answer is indistinguishable from a hung relay.
        socket.send(
          JSON.stringify(['XNET-RESULT', request.requestId, { ok: false, error: reason }])
        )
        onWarning(`tool ${request.tool} failed: ${reason}`)
      })
  })

  socket.addEventListener('close', () => {
    closed = true
  })

  // Subscribe to the enrolled agent's requests only.
  socket.send(JSON.stringify(['REQ', 'xnet-agent', { kinds: [kind], authors: [pubkeyHex] }]))

  return {
    close() {
      if (!closed) socket.close()
      closed = true
    },
    get handled() {
      return handled
    }
  }
}
