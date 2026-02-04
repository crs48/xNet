import type { HubInstance } from '../src/index'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { createHub } from '../src/index'

describe('Production Readiness', () => {
  let hub: HubInstance
  const PORT = 14449

  beforeAll(async () => {
    hub = await createHub({
      port: PORT,
      auth: false,
      storage: 'memory',
      rateLimit: {
        perConnectionRate: 5,
        maxConnections: 3,
        maxMessageSize: 100
      }
    })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  describe('Health Check', () => {
    it('returns 200 with status info', async () => {
      const res = await fetch(`http://localhost:${PORT}/health`)
      expect(res.status).toBe(200)

      const body = (await res.json()) as {
        status: string
        uptime: number
        docs: unknown
        connections: unknown
        memory: { rss: number }
      }
      expect(body.status).toBe('ok')
      expect(body.uptime).toBeGreaterThan(0)
      expect(body.docs).toBeDefined()
      expect(body.connections).toBeDefined()
      expect(body.memory.rss).toBeGreaterThan(0)
    })
  })

  describe('Metrics', () => {
    it('returns Prometheus-format metrics', async () => {
      const res = await fetch(`http://localhost:${PORT}/metrics`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/plain')

      const body = await res.text()
      expect(body).toContain('hub_ws_connections_active')
    })
  })

  describe('Rate Limiting', () => {
    it('rejects oversized messages', async () => {
      const ws = await new Promise<WebSocket>((resolve) => {
        const w = new WebSocket(`ws://localhost:${PORT}`)
        w.on('open', () => resolve(w))
      })

      const bigMsg = JSON.stringify({ type: 'publish', topic: 'x', data: 'a'.repeat(200) })
      ws.send(bigMsg)

      const error = await new Promise<{ type: string; message: string }>((resolve) => {
        ws.on('message', (raw) => {
          const data = JSON.parse(raw.toString()) as { type: string; message: string }
          if (data.type === 'error') resolve(data)
        })
      })

      expect(error.message).toContain('max size')
      ws.close()
    })

    it('rejects connections over max limit', async () => {
      const connections: WebSocket[] = []
      for (let i = 0; i < 3; i += 1) {
        const ws = await new Promise<WebSocket>((resolve) => {
          const w = new WebSocket(`ws://localhost:${PORT}`)
          w.on('open', () => resolve(w))
        })
        connections.push(ws)
      }

      const ws4 = new WebSocket(`ws://localhost:${PORT}`)
      const closeCode = await new Promise<number>((resolve) => {
        ws4.on('close', (code) => resolve(code))
      })

      expect(closeCode).toBe(1013)

      for (const ws of connections) {
        ws.close()
      }
    })
  })
})
