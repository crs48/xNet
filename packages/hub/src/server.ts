/**
 * @xnet/hub - Hono + WebSocket server implementation.
 */

import type { IncomingMessage } from 'http'
import type { RawData, WebSocket } from 'ws'
import type { HubConfig, HubInstance } from './types'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'
import { createSignalingService } from './services/signaling'

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

  let connectionCount = 0
  const startTime = Date.now()

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

    wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      if (connectionCount >= config.maxConnections) {
        ws.close(4429, 'Too many connections')
        return
      }

      connectionCount += 1
      let closed = false

      const finalize = (): void => {
        if (closed) return
        closed = true
        connectionCount = Math.max(0, connectionCount - 1)
        signaling.handleDisconnect(ws)
      }

      ws.on('message', (data: RawData) => {
        if (getMessageSize(data) > config.maxMessageSize) {
          ws.close(4413, 'Message too large')
          return
        }

        const payload = safeParseJson(dataToString(data))
        if (!payload) return
        signaling.handleMessage(ws, payload)
      })

      ws.on('close', finalize)
      ws.on('error', finalize)
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
