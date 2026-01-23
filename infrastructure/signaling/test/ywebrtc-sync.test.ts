/**
 * y-webrtc Sync Integration Test
 *
 * Tests that y-webrtc actually syncs data between two Y.Doc instances
 * through our signaling server. This tests the fundamental sync mechanism
 * outside of React to verify the infrastructure works.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'

const PORT = 4002
const WS_URL = `ws://localhost:${PORT}`

describe('y-webrtc Sync Integration', () => {
  let serverProcess: ChildProcess

  beforeAll(async () => {
    // Start the signaling server
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
        console.log('[Server]', output.trim())
        if (output.includes('running on port')) {
          clearTimeout(timeout)
          resolve()
        }
      })

      serverProcess.stderr?.on('data', (data) => {
        console.error('[Server Error]', data.toString())
      })

      serverProcess.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  })

  afterAll(async () => {
    serverProcess.kill('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, 200))
  })

  it('should sync Y.Doc content between two peers', async () => {
    const roomName = `test-room-${Date.now()}`

    // Create two Y.Doc instances
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    console.log('[Test] Creating providers...')
    console.log('[Test] Doc1 clientID:', doc1.clientID)
    console.log('[Test] Doc2 clientID:', doc2.clientID)

    // Create providers
    const provider1 = new WebrtcProvider(roomName, doc1, {
      signaling: [WS_URL],
      maxConns: 20
    })

    const provider2 = new WebrtcProvider(roomName, doc2, {
      signaling: [WS_URL],
      maxConns: 20
    })

    // Wait for connection
    await new Promise<void>((resolve) => {
      let connected1 = false
      let connected2 = false

      const checkBoth = () => {
        if (connected1 && connected2) resolve()
      }

      provider1.on('status', (e: { connected: boolean }) => {
        console.log('[Test] Provider1 status:', e.connected)
        if (e.connected) {
          connected1 = true
          checkBoth()
        }
      })

      provider2.on('status', (e: { connected: boolean }) => {
        console.log('[Test] Provider2 status:', e.connected)
        if (e.connected) {
          connected2 = true
          checkBoth()
        }
      })

      // Timeout after 5s
      setTimeout(() => resolve(), 5000)
    })

    console.log('[Test] Both connected, waiting for peer discovery...')

    // Wait for peers to find each other
    await new Promise<void>((resolve) => {
      let hasPeers1 = false
      let hasPeers2 = false

      const checkBoth = () => {
        if (hasPeers1 && hasPeers2) resolve()
      }

      provider1.on('peers', (e: { webrtcPeers: string[] }) => {
        console.log('[Test] Provider1 peers:', e.webrtcPeers?.length || 0)
        if (e.webrtcPeers?.length > 0) {
          hasPeers1 = true
          checkBoth()
        }
      })

      provider2.on('peers', (e: { webrtcPeers: string[] }) => {
        console.log('[Test] Provider2 peers:', e.webrtcPeers?.length || 0)
        if (e.webrtcPeers?.length > 0) {
          hasPeers2 = true
          checkBoth()
        }
      })

      // Timeout after 5s
      setTimeout(() => resolve(), 5000)
    })

    console.log('[Test] Peers connected, adding content to doc1...')

    // Add content to doc1
    const text1 = doc1.getText('content')
    text1.insert(0, 'Hello from Doc1!')

    // Also test Y.Map (like our meta map)
    const meta1 = doc1.getMap('meta')
    meta1.set('title', 'Test Document')
    meta1.set('author', 'User1')

    console.log('[Test] Doc1 state:', {
      text: text1.toString(),
      meta: Object.fromEntries(meta1.entries())
    })

    // Wait for sync
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Check doc2
    const text2 = doc2.getText('content')
    const meta2 = doc2.getMap('meta')

    console.log('[Test] Doc2 state after sync:', {
      text: text2.toString(),
      meta: Object.fromEntries(meta2.entries())
    })

    // Verify sync worked
    expect(text2.toString()).toBe('Hello from Doc1!')
    expect(meta2.get('title')).toBe('Test Document')
    expect(meta2.get('author')).toBe('User1')

    // Test reverse sync - add content to doc2
    console.log('[Test] Adding content to doc2...')
    text2.insert(text2.length, ' And from Doc2!')
    meta2.set('lastEditor', 'User2')

    await new Promise((resolve) => setTimeout(resolve, 1000))

    console.log('[Test] Doc1 state after reverse sync:', {
      text: text1.toString(),
      meta: Object.fromEntries(meta1.entries())
    })

    // Verify reverse sync
    expect(text1.toString()).toBe('Hello from Doc1! And from Doc2!')
    expect(meta1.get('lastEditor')).toBe('User2')

    // Cleanup
    provider1.destroy()
    provider2.destroy()
  }, 20000) // 20s timeout

  it('should sync pre-existing content when peer joins', async () => {
    const roomName = `test-existing-${Date.now()}`

    // Create doc1 with content BEFORE creating provider
    const doc1 = new Y.Doc()
    const text1 = doc1.getText('content')
    text1.insert(0, 'Pre-existing content')

    const meta1 = doc1.getMap('meta')
    meta1.set('createdAt', Date.now())

    console.log('[Test] Doc1 has pre-existing content:', text1.toString())

    // Now create provider for doc1
    const provider1 = new WebrtcProvider(roomName, doc1, {
      signaling: [WS_URL],
      maxConns: 20
    })

    // Wait for doc1 to connect
    await new Promise<void>((resolve) => {
      provider1.on('status', (e: { connected: boolean }) => {
        if (e.connected) resolve()
      })
      setTimeout(() => resolve(), 3000)
    })

    console.log('[Test] Doc1 connected, waiting 1s before doc2 joins...')
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Create doc2 (new peer joining later)
    const doc2 = new Y.Doc()
    const provider2 = new WebrtcProvider(roomName, doc2, {
      signaling: [WS_URL],
      maxConns: 20
    })

    // Wait for synced event
    await new Promise<void>((resolve) => {
      provider2.on('synced', (e: { synced: boolean }) => {
        console.log('[Test] Provider2 synced event:', e.synced)
        if (e.synced) resolve()
      })
      setTimeout(() => resolve(), 5000)
    })

    // Give extra time for sync
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const text2 = doc2.getText('content')
    const meta2 = doc2.getMap('meta')

    console.log('[Test] Doc2 state after joining:', {
      text: text2.toString(),
      meta: Object.fromEntries(meta2.entries())
    })

    // Verify doc2 received the pre-existing content
    expect(text2.toString()).toBe('Pre-existing content')
    expect(meta2.get('createdAt')).toBeDefined()

    // Cleanup
    provider1.destroy()
    provider2.destroy()
  }, 20000)
})
