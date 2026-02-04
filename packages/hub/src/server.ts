/**
 * @xnet/hub - Hono + WebSocket server implementation.
 */

import type { IncomingMessage } from 'http'
import type { RawData, WebSocket } from 'ws'
import type { AuthSession } from './auth/ucan'
import type { HubConfig, HubInstance } from './types'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'
import { hasHubCapability } from './auth/capabilities'
import { authenticateConnection, removeSession } from './auth/ucan'
import { NodePool } from './pool/node-pool'
import { RelayService } from './services/relay'
import { createSignalingService } from './services/signaling'
import { createStorage } from './storage'

const getMessageSize = (data: RawData): number => {
  if (typeof data === 'string') {
    return Buffer.byteLength(data)
  }
  if (Array.isArray(data)) {
    return data.reduce((total, chunk) => total + chunk.length, 0)
  }
  if (data instanceof ArrayBuffer) {
    return data.byteLength
  }
  return data.length
}

const dataToString = (data: RawData): string => {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return Buffer.concat(data).toString()
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString()
  return data.toString()
}

const safeParseJson = (payload: string): unknown | null => {
  try {
    return JSON.parse(payload) as unknown
  } catch {
    return null
  }
}

const parseTopics = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

const isSubscribeMessage = (value: unknown): value is { type: 'subscribe'; topics?: unknown } => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  return candidate.type === 'subscribe'
}

const isUnsubscribeMessage = (value: unknown): value is { type: 'unsubscribe'; topics?: unknown } => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  return candidate.type === 'unsubscribe'
}

const isPublishMessage = (
  value: unknown
): value is { type: 'publish'; topic?: unknown; data?: unknown } => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  return candidate.type === 'publish'
}

const topicToResource = (topic: string): string =>
  topic.startsWith('xnet-doc-') ? topic.slice('xnet-doc-'.length) : topic

const checkRoomAuth = (session: AuthSession, topics: string[]): boolean =>
  topics.every((topic) => {
    const resource = topicToResource(topic)
    return (
      hasHubCapability(session.capabilities, 'hub/relay', resource) ||
      hasHubCapability(session.capabilities, 'hub/signal', resource)
    )
  })

const createMetricsPayload = (connectionCount: number, roomCount: number, uptimeSeconds: number): string =>
  [
    '# HELP xnet_hub_connections_active Active WebSocket connections',
    '# TYPE xnet_hub_connections_active gauge',
    `xnet_hub_connections_active ${connectionCount}`,
    '# HELP xnet_hub_rooms_active Active signaling rooms',
    '# TYPE xnet_hub_rooms_active gauge',
    `xnet_hub_rooms_active ${roomCount}`,
    '# HELP xnet_hub_uptime_seconds Hub uptime in seconds',
    '# TYPE xnet_hub_uptime_seconds counter',
    `xnet_hub_uptime_seconds ${uptimeSeconds}`
  ].join('\n')

export const createServer = (config: HubConfig): HubInstance => {
  const app = new Hono()
  const signaling = createSignalingService()
  const storage = createStorage(config.storage, config.dataDir)
  const pool = new NodePool(storage)
  const relay = new RelayService(pool, { requireSignedUpdates: config.auth })

  let connectionCount = 0
  const startTime = Date.now()
  const socketTopics = new Map<WebSocket, Set<string>>()
  const socketPeers = new Map<WebSocket, Set<string>>()

  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      connections: connectionCount,
      rooms: signaling.getRoomCount(),
      version: '0.0.1'
    })
  )

  app.get('/metrics', (c) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000)
    return c.text(createMetricsPayload(connectionCount, signaling.getRoomCount(), uptimeSeconds))
  })

  let httpServer: ReturnType<typeof serve> | null = null
  let wss: WebSocketServer | null = null

  const start = async (): Promise<void> => {
    if (httpServer) return
    httpServer = serve({ fetch: app.fetch, port: config.port })

    await new Promise<void>((resolve) => {
      if (httpServer?.listening) {
        resolve()
        return
      }
      httpServer?.once('listening', () => resolve())
    })

    wss = new WebSocketServer({ server: httpServer })

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      void (async () => {
        if (connectionCount >= config.maxConnections) {
          ws.close(4429, 'Too many connections')
          return
        }

        const session = await authenticateConnection(ws, req, config)
        if (!session) return

        connectionCount += 1
        let closed = false

        const finalize = (): void => {
          if (closed) return
          closed = true
          connectionCount = Math.max(0, connectionCount - 1)
          removeSession(ws)
          const topics = socketTopics.get(ws)
          if (topics) {
            for (const topic of topics) {
              relay.handleRoomLeave(topic)
            }
          }
          socketTopics.delete(ws)
          const peers = socketPeers.get(ws)
          if (peers) {
            for (const peerId of peers) {
              relay.handlePeerDisconnect(peerId)
            }
          }
          socketPeers.delete(ws)
          signaling.handleDisconnect(ws)
        }

        ws.on('message', (data: RawData) => {
          if (getMessageSize(data) > config.maxMessageSize) {
            ws.close(4413, 'Message too large')
            return
          }

          const payload = safeParseJson(dataToString(data))
          if (!payload) return

          if (config.auth && isSubscribeMessage(payload)) {
            const topics = parseTopics(payload.topics)
            if (!checkRoomAuth(session, topics)) {
              ws.close(4403, 'Insufficient capabilities for room')
              return
            }
          }

          signaling.handleMessage(ws, payload)

          if (isSubscribeMessage(payload)) {
            const topics = parseTopics(payload.topics)
            if (topics.length > 0) {
              const existing = socketTopics.get(ws) ?? new Set<string>()
              for (const topic of topics) {
                if (!existing.has(topic)) {
                  existing.add(topic)
                  void relay.handleRoomJoin(topic, signaling.publishFromHub)
                }
              }
              socketTopics.set(ws, existing)
            }
          }

          if (isUnsubscribeMessage(payload)) {
            const topics = parseTopics(payload.topics)
            const existing = socketTopics.get(ws)
            if (existing && topics.length > 0) {
              for (const topic of topics) {
                if (existing.delete(topic)) {
                  relay.handleRoomLeave(topic)
                }
              }
              if (existing.size === 0) {
                socketTopics.delete(ws)
              }
            }
          }

          if (isPublishMessage(payload) && typeof payload.topic === 'string') {
            const peerId = (() => {
              if (!payload.data || typeof payload.data !== 'object') return null
              const data = payload.data as { from?: unknown }
              return typeof data.from === 'string' ? data.from : null
            })()
            if (peerId) {
              const peers = socketPeers.get(ws) ?? new Set<string>()
              peers.add(peerId)
              socketPeers.set(ws, peers)
            }

            void relay.handleSyncMessage(payload.topic, payload.data, signaling.publishFromHub)
          }
        })

        ws.on('close', finalize)
        ws.on('error', finalize)
      })()
    })
  }

  const stop = async (): Promise<void> => {
    if (wss) {
      for (const client of wss.clients) {
        client.close(1001, 'Server shutting down')
      }
      await new Promise<void>((resolve) => wss?.close(() => resolve()))
      wss = null
    }

    if (httpServer) {
      await new Promise<void>((resolve) => httpServer?.close(() => resolve()))
      httpServer = null
    }

    await pool.persistAll()
    pool.destroy()
    await storage.close()

    signaling.destroy()
    connectionCount = 0
  }

  return {
    port: config.port,
    config,
    start,
    stop
  }
}
