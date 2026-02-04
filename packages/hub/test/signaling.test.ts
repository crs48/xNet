import type { HubInstance } from '../src/index'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { createHub } from '../src/index'

describe('Hub Signaling', () => {
  let hub: HubInstance
  const PORT = 14444

  beforeAll(async () => {
    hub = await createHub({ port: PORT, auth: false, storage: 'memory' })
    await hub.start()
  })

  afterAll(async () => {
    await hub.stop()
  })

  const connect = async (): Promise<WebSocket> =>
    new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`)
      ws.on('open', () => resolve(ws))
    })

  it('responds to ping with pong', async () => {
    const ws = await connect()
    ws.send(JSON.stringify({ type: 'ping' }))

    const msg = await new Promise<{ type: string }>((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())))
    })

    expect(msg.type).toBe('pong')
    ws.close()
  })

  it('broadcasts publish to room subscribers', async () => {
    const ws1 = await connect()
    const ws2 = await connect()
    const ws3 = await connect()

    ws1.send(JSON.stringify({ type: 'subscribe', topics: ['test-room'] }))
    ws2.send(JSON.stringify({ type: 'subscribe', topics: ['test-room'] }))

    await new Promise((resolve) => setTimeout(resolve, 50))

    ws1.send(JSON.stringify({ type: 'publish', topic: 'test-room', data: { hello: 'world' } }))

    const msg = await new Promise<{ type: string; data: { hello?: string } }>((resolve) => {
      ws2.on('message', (data) => resolve(JSON.parse(data.toString())))
    })

    expect(msg.type).toBe('publish')
    expect(msg.data.hello).toBe('world')

    ws1.close()
    ws2.close()
    ws3.close()
  })

  it('health endpoint returns status', async () => {
    const res = await fetch(`http://localhost:${PORT}/health`)
    const json = (await res.json()) as {
      status: string
      connections: { active: number; max: number }
    }
    expect(json.status).toBe('ok')
    expect(typeof json.connections.active).toBe('number')
  })
})
