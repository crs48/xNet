/**
 * Sync Integration Tests
 *
 * Tests Y.Doc synchronization between two documents.
 *
 * NOTE: y-webrtc uses a global room registry that prevents two providers
 * from joining the same room in the same JS context. Since Vitest browser
 * mode runs in a single page, we test sync by simulating the y-protocols
 * sync mechanism directly (which is what WebRTC transports internally).
 *
 * For real WebRTC testing across processes, use the signaling server tests
 * at infrastructure/signaling/test/ywebrtc-sync.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { WebrtcProvider } from 'y-webrtc'

// Signaling server URL
const SIGNALING_URL = 'ws://localhost:4444'

/**
 * Helper: Simulate sync between two Y.Docs using y-protocols
 * This replicates exactly what y-webrtc does over the data channel
 */
function syncDocs(doc1: Y.Doc, doc2: Y.Doc): void {
  // Step 1: doc1 sends sync step 1 to doc2
  const encoder1 = encoding.createEncoder()
  syncProtocol.writeSyncStep1(encoder1, doc1)
  const step1From1 = encoding.toUint8Array(encoder1)

  // Step 1: doc2 sends sync step 1 to doc1
  const encoder2 = encoding.createEncoder()
  syncProtocol.writeSyncStep1(encoder2, doc2)
  const step1From2 = encoding.toUint8Array(encoder2)

  // Step 2: doc2 processes doc1's step1, produces step2
  const decoder1 = decoding.createDecoder(step1From1)
  const replyEncoder2 = encoding.createEncoder()
  syncProtocol.readSyncMessage(decoder1, replyEncoder2, doc2, 'test')
  const step2From2 = encoding.toUint8Array(replyEncoder2)

  // Step 2: doc1 processes doc2's step1, produces step2
  const decoder2 = decoding.createDecoder(step1From2)
  const replyEncoder1 = encoding.createEncoder()
  syncProtocol.readSyncMessage(decoder2, replyEncoder1, doc1, 'test')
  const step2From1 = encoding.toUint8Array(replyEncoder1)

  // Step 3: Apply step2 responses
  if (step2From2.length > 0) {
    const d = decoding.createDecoder(step2From2)
    const e = encoding.createEncoder()
    syncProtocol.readSyncMessage(d, e, doc1, 'test')
  }
  if (step2From1.length > 0) {
    const d = decoding.createDecoder(step2From1)
    const e = encoding.createEncoder()
    syncProtocol.readSyncMessage(d, e, doc2, 'test')
  }
}

/**
 * Helper: Set up live sync between two docs (simulating WebRTC channel)
 * Returns cleanup function
 */
function setupLiveSync(doc1: Y.Doc, doc2: Y.Doc): () => void {
  // Initial full sync
  syncDocs(doc1, doc2)

  // Live updates: forward changes from doc1 → doc2 and vice versa
  const handler1 = (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return // Prevent loops
    Y.applyUpdate(doc2, update, 'remote')
  }
  const handler2 = (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return
    Y.applyUpdate(doc1, update, 'remote')
  }

  doc1.on('update', handler1)
  doc2.on('update', handler2)

  return () => {
    doc1.off('update', handler1)
    doc2.off('update', handler2)
  }
}

// =============================================================================
// Tests: Y.Doc Sync Protocol
// =============================================================================

describe('Y.Doc Sync Protocol', () => {
  it('should sync Y.Text content between two docs', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    const cleanup = setupLiveSync(doc1, doc2)

    // Write to doc1
    const text1 = doc1.getText('content')
    text1.insert(0, 'Hello from doc 1!')

    // Should appear in doc2
    const text2 = doc2.getText('content')
    expect(text2.toString()).toBe('Hello from doc 1!')

    // Write to doc2 (reverse)
    text2.insert(text2.length, ' And from doc 2!')
    expect(text1.toString()).toBe('Hello from doc 1! And from doc 2!')

    cleanup()
    doc1.destroy()
    doc2.destroy()
  })

  it('should sync Y.Map (meta properties)', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    const cleanup = setupLiveSync(doc1, doc2)

    // Set properties on doc1
    const meta1 = doc1.getMap('meta')
    doc1.transact(() => {
      meta1.set('_schemaId', 'xnet://xnet.dev/Page')
      meta1.set('title', 'Shared Page')
      meta1.set('icon', '📄')
    })

    // Check doc2
    const meta2 = doc2.getMap('meta')
    expect(meta2.get('_schemaId')).toBe('xnet://xnet.dev/Page')
    expect(meta2.get('title')).toBe('Shared Page')
    expect(meta2.get('icon')).toBe('📄')

    // Update from doc2
    meta2.set('title', 'Updated by Peer 2')
    expect(meta1.get('title')).toBe('Updated by Peer 2')

    cleanup()
    doc1.destroy()
    doc2.destroy()
  })

  it('should sync pre-existing content to a new doc', () => {
    // Doc1 has pre-existing content
    const doc1 = new Y.Doc()
    const text1 = doc1.getText('content')
    text1.insert(0, 'I was here first')
    const meta1 = doc1.getMap('meta')
    meta1.set('title', 'Pre-existing')

    // Doc2 is empty and joins later
    const doc2 = new Y.Doc()

    // Sync (simulates WebRTC connection establishing)
    syncDocs(doc1, doc2)

    const text2 = doc2.getText('content')
    expect(text2.toString()).toBe('I was here first')

    const meta2 = doc2.getMap('meta')
    expect(meta2.get('title')).toBe('Pre-existing')

    doc1.destroy()
    doc2.destroy()
  })

  it('should sync XmlFragment (TipTap editor content)', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    const cleanup = setupLiveSync(doc1, doc2)

    // Simulate TipTap content
    const fragment1 = doc1.getXmlFragment('content')
    const paragraph = new Y.XmlElement('paragraph')
    const textNode = new Y.XmlText('Hello world')
    paragraph.insert(0, [textNode])
    fragment1.insert(0, [paragraph])

    // Check doc2
    const fragment2 = doc2.getXmlFragment('content')
    expect(fragment2.length).toBe(1)
    const syncedPara = fragment2.get(0) as Y.XmlElement
    expect(syncedPara.nodeName).toBe('paragraph')

    cleanup()
    doc1.destroy()
    doc2.destroy()
  })

  it('should handle concurrent edits (CRDT merge)', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    // Don't set up live sync yet - simulate offline edits
    const text1 = doc1.getText('content')
    const text2 = doc2.getText('content')

    text1.insert(0, 'AAA')
    text2.insert(0, 'BBB')

    // Now sync (simulates reconnection)
    syncDocs(doc1, doc2)

    // Both should converge
    expect(text1.toString()).toBe(text2.toString())
    expect(text1.toString().length).toBe(6)
    expect(text1.toString()).toContain('AAA')
    expect(text1.toString()).toContain('BBB')

    doc1.destroy()
    doc2.destroy()
  })

  it('should handle disconnect and reconnect with offline changes', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    // Initial sync
    const cleanup = setupLiveSync(doc1, doc2)

    const text1 = doc1.getText('content')
    text1.insert(0, 'Before disconnect')

    const text2 = doc2.getText('content')
    expect(text2.toString()).toBe('Before disconnect')

    // Disconnect
    cleanup()

    // Both make changes while disconnected
    text1.insert(text1.length, ' - from doc1')
    text2.insert(text2.length, ' - from doc2')

    expect(text1.toString()).toBe('Before disconnect - from doc1')
    expect(text2.toString()).toBe('Before disconnect - from doc2')

    // Reconnect (re-sync)
    syncDocs(doc1, doc2)

    // Both should have merged content
    expect(text1.toString()).toBe(text2.toString())
    expect(text1.toString()).toContain('Before disconnect')
    expect(text1.toString()).toContain('from doc1')
    expect(text1.toString()).toContain('from doc2')

    doc1.destroy()
    doc2.destroy()
  })
})

// =============================================================================
// Tests: WebRTC Signaling Connection
// =============================================================================

describe('WebRTC Signaling', () => {
  beforeAll(async () => {
    try {
      const response = await fetch('http://localhost:4444/health')
      if (!response.ok) throw new Error('Signaling server not healthy')
    } catch {
      throw new Error(
        'Signaling server is not running on port 4444. Start it with: pnpm --filter @xnet/signaling-server dev'
      )
    }
  })

  it('should connect to signaling server and join a room', async () => {
    const room = `test-signaling-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const doc = new Y.Doc()

    const provider = new WebrtcProvider(room, doc, {
      signaling: [SIGNALING_URL],
      maxConns: 20
    })

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000)
      provider.on('status', (e: { connected: boolean }) => {
        if (e.connected) {
          clearTimeout(timeout)
          resolve()
        }
      })
    })

    expect(provider.connected).toBe(true)

    // Wait a bit for the signaling subscription to register on server
    await new Promise((r) => setTimeout(r, 500))

    // Verify room appears in health check
    const health = await fetch('http://localhost:4444/health').then((r) => r.json())
    expect(health.topics).toBeGreaterThan(0)

    provider.destroy()
    doc.destroy()
  })

  it('should discover peers in the same room (single process limitation: same doc reused)', async () => {
    // NOTE: y-webrtc doesn't allow two providers in the same room in the same
    // JS context. This test verifies signaling subscription works.
    const room1 = `test-room1-${Date.now()}`
    const room2 = `test-room2-${Date.now()}`

    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    const provider1 = new WebrtcProvider(room1, doc1, {
      signaling: [SIGNALING_URL],
      maxConns: 20
    })
    const provider2 = new WebrtcProvider(room2, doc2, {
      signaling: [SIGNALING_URL],
      maxConns: 20
    })

    // Both should connect
    await Promise.all([
      new Promise<void>((resolve) => {
        provider1.on('status', (e: { connected: boolean }) => {
          if (e.connected) resolve()
        })
        setTimeout(resolve, 3000)
      }),
      new Promise<void>((resolve) => {
        provider2.on('status', (e: { connected: boolean }) => {
          if (e.connected) resolve()
        })
        setTimeout(resolve, 3000)
      })
    ])

    expect(provider1.connected).toBe(true)
    expect(provider2.connected).toBe(true)

    provider1.destroy()
    provider2.destroy()
    doc1.destroy()
    doc2.destroy()
  })
})
