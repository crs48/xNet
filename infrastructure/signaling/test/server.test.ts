/**
 * Signaling Server Tests
 *
 * Tests the y-webrtc compatible signaling protocol.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { spawn, ChildProcess } from 'child_process'

const PORT = 4001 // Use different port for tests
const WS_URL = `ws://localhost:${PORT}`

describe('Signaling Server', () => {
  let serverProcess: ChildProcess

  beforeAll(async () => {
    // Start the server
    serverProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe'
    })

    // Wait for server to start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 5000)

      serverProcess.stdout?.on('data', (data) => {
        const output = data.toString()
        if (output.includes('running on port')) {
          clearTimeout(timeout)
          resolve()
        }
      })

      serverProcess.stderr?.on('data', (data) => {
        console.error('Server error:', data.toString())
      })

      serverProcess.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  })

  afterAll(async () => {
    serverProcess.kill('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

  function createClient(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL)
      ws.on('open', () => resolve(ws))
      ws.on('error', reject)
    })
  }

  function waitForMessage(ws: WebSocket, timeout = 2000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Message timeout')), timeout)
      ws.once('message', (data) => {
        clearTimeout(timer)
        resolve(JSON.parse(data.toString()))
      })
    })
  }

  it('should respond to ping with pong', async () => {
    const ws = await createClient()

    ws.send(JSON.stringify({ type: 'ping' }))
    const response = await waitForMessage(ws)

    expect(response).toEqual({ type: 'pong' })
    ws.close()
  })

  it('should allow subscribing to topics', async () => {
    const ws = await createClient()

    ws.send(JSON.stringify({ type: 'subscribe', topics: ['room1', 'room2'] }))

    // No response expected for subscribe, just verify no error
    await new Promise((resolve) => setTimeout(resolve, 100))
    ws.close()
  })

  it('should broadcast publish to other subscribers', async () => {
    const client1 = await createClient()
    const client2 = await createClient()

    // Both subscribe to same topic
    client1.send(JSON.stringify({ type: 'subscribe', topics: ['test-room'] }))
    client2.send(JSON.stringify({ type: 'subscribe', topics: ['test-room'] }))

    // Wait for subscriptions to be processed
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Client 1 publishes
    const testData = { type: 'announce', from: 'peer1' }
    client1.send(JSON.stringify({ type: 'publish', topic: 'test-room', data: testData }))

    // Client 2 should receive
    const message = (await waitForMessage(client2)) as {
      type: string
      topic: string
      data: unknown
    }

    expect(message.type).toBe('publish')
    expect(message.topic).toBe('test-room')
    expect(message.data).toEqual(testData)

    client1.close()
    client2.close()
  })

  it('should not send publish back to sender', async () => {
    const client = await createClient()

    client.send(JSON.stringify({ type: 'subscribe', topics: ['my-room'] }))
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Publish to own topic
    client.send(JSON.stringify({ type: 'publish', topic: 'my-room', data: { test: true } }))

    // Should not receive our own message
    const messagePromise = waitForMessage(client, 500)
    await expect(messagePromise).rejects.toThrow('Message timeout')

    client.close()
  })

  it('should support multiple topics per client', async () => {
    const sender = await createClient()
    const receiver = await createClient()

    receiver.send(JSON.stringify({ type: 'subscribe', topics: ['topic-a', 'topic-b'] }))
    await new Promise((resolve) => setTimeout(resolve, 100))

    sender.send(JSON.stringify({ type: 'subscribe', topics: ['topic-a'] }))
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Send to topic-a
    sender.send(JSON.stringify({ type: 'publish', topic: 'topic-a', data: { msg: 'a' } }))
    const msgA = (await waitForMessage(receiver)) as { data: { msg: string } }
    expect(msgA.data.msg).toBe('a')

    sender.close()
    receiver.close()
  })

  it('should handle unsubscribe', async () => {
    const sender = await createClient()
    const receiver = await createClient()

    // Subscribe
    receiver.send(JSON.stringify({ type: 'subscribe', topics: ['unsub-test'] }))
    sender.send(JSON.stringify({ type: 'subscribe', topics: ['unsub-test'] }))
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Unsubscribe
    receiver.send(JSON.stringify({ type: 'unsubscribe', topics: ['unsub-test'] }))
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Send message - receiver should not get it
    sender.send(JSON.stringify({ type: 'publish', topic: 'unsub-test', data: { test: true } }))

    const messagePromise = waitForMessage(receiver, 500)
    await expect(messagePromise).rejects.toThrow('Message timeout')

    sender.close()
    receiver.close()
  })

  it('should clean up on disconnect', async () => {
    const client1 = await createClient()
    const client2 = await createClient()

    // Both subscribe
    client1.send(JSON.stringify({ type: 'subscribe', topics: ['cleanup-test'] }))
    client2.send(JSON.stringify({ type: 'subscribe', topics: ['cleanup-test'] }))
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Close client1
    client1.close()
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Client2 should still work
    client2.send(JSON.stringify({ type: 'ping' }))
    const response = await waitForMessage(client2)
    expect(response).toEqual({ type: 'pong' })

    client2.close()
  })
})
