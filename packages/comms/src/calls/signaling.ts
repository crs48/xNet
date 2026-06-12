/**
 * Call signaling transports (exploration 0167).
 *
 * The default transport speaks the y-webrtc broker protocol the hub
 * already implements ({subscribe|unsubscribe|publish} over WebSocket) on a
 * `call:{roomId}` topic — zero new server code. A loopback bus backs tests
 * and future in-process transports (libp2p, trystero) implement the same
 * interface.
 */

import type { CallSignal, SignalingTransport } from './types'

export function callTopic(roomId: string): string {
  return `call:${roomId}`
}

interface WebSocketLike {
  readyState: number
  send(data: string): void
  close(): void
  addEventListener(event: string, handler: (event: { data?: unknown }) => void): void
}

export interface WebSocketSignalingOptions {
  url: string
  roomId: string
  /** Injectable for tests; defaults to globalThis.WebSocket */
  webSocketFactory?: (url: string) => WebSocketLike
}

const OPEN = 1

/** y-webrtc broker transport over a dedicated WebSocket. */
export function createWebSocketSignaling(options: WebSocketSignalingOptions): SignalingTransport {
  const topic = callTopic(options.roomId)
  const factory =
    options.webSocketFactory ??
    ((url: string) =>
      new (globalThis as { WebSocket: new (url: string) => WebSocketLike }).WebSocket(url))
  const ws = factory(options.url)
  const handlers = new Set<(signal: CallSignal) => void>()
  const outbox: string[] = []

  function flush(): void {
    while (outbox.length > 0 && ws.readyState === OPEN) {
      ws.send(outbox.shift() as string)
    }
  }

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'subscribe', topics: [topic] }))
    flush()
  })

  ws.addEventListener('message', (event) => {
    const parsed = parseBrokerMessage(event.data, topic)
    if (!parsed) return
    for (const handler of handlers) handler(parsed)
  })

  return {
    send(signal) {
      const frame = JSON.stringify({ type: 'publish', topic, data: signal })
      if (ws.readyState === OPEN) ws.send(frame)
      else outbox.push(frame)
    },
    onMessage(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    close() {
      if (ws.readyState === OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe', topics: [topic] }))
      }
      ws.close()
    }
  }
}

function safeJsonParse(data: unknown): { type?: string; topic?: string; data?: CallSignal } | null {
  if (typeof data !== 'string') return null
  try {
    return JSON.parse(data) as { type?: string; topic?: string; data?: CallSignal }
  } catch {
    return null
  }
}

export function parseBrokerMessage(data: unknown, topic: string): CallSignal | null {
  const message = safeJsonParse(data)
  const matches = message?.type === 'publish' && message.topic === topic
  return matches ? (message.data ?? null) : null
}

// ─── Loopback (tests, single-process demos) ──────────────────────────────────

export interface LoopbackBus {
  transport(): SignalingTransport
}

/** In-memory signaling bus: every transport sees every other's sends. */
export function createLoopbackBus(): LoopbackBus {
  const members = new Set<(signal: CallSignal) => void>()

  return {
    transport() {
      const handlers = new Set<(signal: CallSignal) => void>()
      const receive = (signal: CallSignal): void => {
        for (const handler of handlers) handler(signal)
      }
      members.add(receive)
      return {
        send(signal) {
          for (const member of members) {
            if (member !== receive) member(signal)
          }
        },
        onMessage(handler) {
          handlers.add(handler)
          return () => handlers.delete(handler)
        },
        close() {
          members.delete(receive)
        }
      }
    }
  }
}
