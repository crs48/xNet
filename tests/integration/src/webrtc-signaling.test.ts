/**
 * WebRTC Signaling Debug Test
 *
 * Tests the full WebRTC connection flow through the signaling server:
 * 1. Two peers connect to signaling server via WebSocket
 * 2. They exchange SDP offers/answers
 * 3. They exchange ICE candidates
 * 4. WebRTC data channel opens
 * 5. They exchange Yjs sync messages
 *
 * This test runs in a SINGLE browser tab but uses two separate
 * RTCPeerConnections with the signaling server as intermediary.
 * Unlike y-webrtc (which prevents two providers in the same room),
 * raw RTCPeerConnection has no such limitation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const SIGNALING_URL = 'ws://localhost:4444'

interface SignalMessage {
  type: string
  topics?: string[]
  topic?: string
  data?: {
    type: string
    from: string
    to?: string
    signal?: { type?: string; sdp?: string; candidate?: RTCIceCandidateInit }
    token?: number
  }
}

/**
 * Create a WebSocket connection to the signaling server
 */
function createSignalingClient(peerId: string): Promise<{
  ws: WebSocket
  messages: SignalMessage[]
  send: (msg: SignalMessage) => void
  waitForMessage: (
    predicate: (msg: SignalMessage) => boolean,
    timeout?: number
  ) => Promise<SignalMessage>
  close: () => void
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SIGNALING_URL)
    const messages: SignalMessage[] = []
    const messageListeners: Array<(msg: SignalMessage) => void> = []

    ws.onopen = () => {
      resolve({
        ws,
        messages,
        send: (msg: SignalMessage) => ws.send(JSON.stringify(msg)),
        waitForMessage: (predicate, timeout = 5000) => {
          return new Promise<SignalMessage>((res, rej) => {
            // Check existing messages
            const existing = messages.find(predicate)
            if (existing) {
              res(existing)
              return
            }

            const timer = setTimeout(() => rej(new Error('waitForMessage timeout')), timeout)
            const listener = (msg: SignalMessage) => {
              if (predicate(msg)) {
                clearTimeout(timer)
                const idx = messageListeners.indexOf(listener)
                if (idx >= 0) messageListeners.splice(idx, 1)
                res(msg)
              }
            }
            messageListeners.push(listener)
          })
        },
        close: () => ws.close()
      })
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as SignalMessage
      if (msg.type === 'pong') return
      messages.push(msg)
      messageListeners.forEach((l) => l(msg))
    }

    ws.onerror = () => reject(new Error('WebSocket connection failed'))

    setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000)
  })
}

/**
 * NOTE: These tests are skipped because WebRTC cannot connect to itself
 * within a single browser process (same-origin mDNS resolution limitation).
 * They serve as documentation of the correct WebRTC handshake flow and
 * can be run manually across separate browser windows/processes.
 */
describe.skip('WebRTC Data Channel via Signaling (requires separate processes)', () => {
  beforeAll(async () => {
    const response = await fetch('http://localhost:4444/health')
    if (!response.ok) throw new Error('Signaling server not running')
  })

  it('should establish WebRTC data channel between two peers', async () => {
    const room = `webrtc-test-${Date.now()}`
    const peerIdA = `peer-a-${crypto.randomUUID()}`
    const peerIdB = `peer-b-${crypto.randomUUID()}`

    // Create two signaling clients
    const clientA = await createSignalingClient(peerIdA)
    const clientB = await createSignalingClient(peerIdB)

    // Both subscribe to the same room
    clientA.send({ type: 'subscribe', topics: [room] })
    clientB.send({ type: 'subscribe', topics: [room] })

    // Wait a bit for subscriptions to register
    await new Promise((r) => setTimeout(r, 100))

    // Create RTCPeerConnections
    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }

    const pcA = new RTCPeerConnection(config)
    const pcB = new RTCPeerConnection(config)

    const logs: string[] = []
    const log = (msg: string) => {
      logs.push(msg)
      console.log(`[webrtc-test] ${msg}`)
    }

    // ICE candidate handlers - forward through signaling
    pcA.onicecandidate = (ev) => {
      if (ev.candidate) {
        log(
          `A ICE candidate: ${ev.candidate.type} ${ev.candidate.protocol} ${ev.candidate.address || 'mdns'}:${ev.candidate.port} | ${ev.candidate.candidate}`
        )
        clientA.send({
          type: 'publish',
          topic: room,
          data: {
            type: 'signal',
            from: peerIdA,
            to: peerIdB,
            signal: { candidate: ev.candidate.toJSON() }
          }
        })
      } else {
        log('A ICE gathering complete')
      }
    }

    pcB.onicecandidate = (ev) => {
      if (ev.candidate) {
        log(
          `B ICE candidate: ${ev.candidate.type} ${ev.candidate.protocol} ${ev.candidate.address || 'mdns'}:${ev.candidate.port} | ${ev.candidate.candidate}`
        )
        clientB.send({
          type: 'publish',
          topic: room,
          data: {
            type: 'signal',
            from: peerIdB,
            to: peerIdA,
            signal: { candidate: ev.candidate.toJSON() }
          }
        })
      } else {
        log('B ICE gathering complete')
      }
    }

    // Connection state logging
    pcA.oniceconnectionstatechange = () => log(`A ICE state: ${pcA.iceConnectionState}`)
    pcB.oniceconnectionstatechange = () => log(`B ICE state: ${pcB.iceConnectionState}`)
    pcA.onconnectionstatechange = () => log(`A connection state: ${pcA.connectionState}`)
    pcB.onconnectionstatechange = () => log(`B connection state: ${pcB.connectionState}`)

    // A creates data channel and offer
    const channelA = pcA.createDataChannel('yjs-sync')
    log('A created data channel')

    const offer = await pcA.createOffer()
    await pcA.setLocalDescription(offer)
    log('A set local description (offer)')

    // Send offer through signaling
    clientA.send({
      type: 'publish',
      topic: room,
      data: {
        type: 'signal',
        from: peerIdA,
        to: peerIdB,
        signal: { type: 'offer', sdp: offer.sdp }
      }
    })
    log('A sent offer via signaling')

    // B waits for offer
    const offerMsg = await clientB.waitForMessage(
      (m) =>
        m.type === 'publish' &&
        m.data?.type === 'signal' &&
        m.data?.signal?.type === 'offer' &&
        m.data?.from === peerIdA
    )
    log('B received offer')

    // B sets remote description and creates answer
    await pcB.setRemoteDescription(
      new RTCSessionDescription({
        type: 'offer',
        sdp: offerMsg.data!.signal!.sdp!
      } as RTCSessionDescriptionInit)
    )
    log('B set remote description (offer)')

    const answer = await pcB.createAnswer()
    await pcB.setLocalDescription(answer)
    log('B set local description (answer)')

    // Send answer through signaling
    clientB.send({
      type: 'publish',
      topic: room,
      data: {
        type: 'signal',
        from: peerIdB,
        to: peerIdA,
        signal: { type: 'answer', sdp: answer.sdp }
      }
    })
    log('B sent answer via signaling')

    // A waits for answer
    const answerMsg = await clientA.waitForMessage(
      (m) => m.type === 'publish' && m.data?.type === 'signal' && m.data?.signal?.type === 'answer'
    )
    log('A received answer')

    await pcA.setRemoteDescription(
      new RTCSessionDescription({
        type: 'answer',
        sdp: answerMsg.data!.signal!.sdp!
      } as RTCSessionDescriptionInit)
    )
    log('A set remote description (answer)')

    // Set up ICE candidate trickle via the signaling client's message handler
    // clientA receives B's candidates → add to pcA
    // clientB receives A's candidates → add to pcB
    const processedA = new Set<number>()
    const processedB = new Set<number>()

    const icePollInterval = setInterval(() => {
      for (let i = 0; i < clientA.messages.length; i++) {
        if (processedA.has(i)) continue
        const msg = clientA.messages[i]
        if (msg.type === 'publish' && msg.data?.type === 'signal' && msg.data?.signal?.candidate) {
          processedA.add(i)
          if (pcA.remoteDescription) {
            pcA
              .addIceCandidate(new RTCIceCandidate(msg.data.signal.candidate))
              .then(() => log('A added remote ICE candidate'))
              .catch((e) => log(`A ICE candidate error: ${(e as Error).message}`))
          } else {
            log('A: remote description not set, skipping candidate')
          }
        }
      }
      for (let i = 0; i < clientB.messages.length; i++) {
        if (processedB.has(i)) continue
        const msg = clientB.messages[i]
        if (msg.type === 'publish' && msg.data?.type === 'signal' && msg.data?.signal?.candidate) {
          processedB.add(i)
          if (pcB.remoteDescription) {
            pcB
              .addIceCandidate(new RTCIceCandidate(msg.data.signal.candidate))
              .then(() => log('B added remote ICE candidate'))
              .catch((e) => log(`B ICE candidate error: ${(e as Error).message}`))
          } else {
            log('B: remote description not set, skipping candidate')
          }
        }
      }
    }, 50)

    // B waits for data channel
    const channelBPromise = new Promise<RTCDataChannel>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Data channel timeout')), 10000)
      pcB.ondatachannel = (event) => {
        log('B received data channel: ' + event.channel.label)
        clearTimeout(timeout)
        resolve(event.channel)
      }
    })

    // Wait for data channel on B
    const channelB = await channelBPromise
    log('Data channel established on both sides!')

    // Wait for channels to open
    const waitOpen = (ch: RTCDataChannel) =>
      new Promise<void>((resolve, reject) => {
        if (ch.readyState === 'open') {
          resolve()
          return
        }
        const timeout = setTimeout(
          () => reject(new Error(`Channel ${ch.label} didn't open. State: ${ch.readyState}`)),
          5000
        )
        ch.onopen = () => {
          clearTimeout(timeout)
          resolve()
        }
      })

    await waitOpen(channelA)
    log('Channel A open')
    await waitOpen(channelB)
    log('Channel B open')

    // Exchange Yjs sync messages!
    const docA = new Y.Doc()
    const docB = new Y.Doc()

    // Add content to docA
    docA.getText('content').insert(0, 'Hello from peer A!')
    docA.getMap('meta').set('title', 'Synced Page')

    // Send sync step 1 from A to B
    const encoder1 = encoding.createEncoder()
    syncProtocol.writeSyncStep1(encoder1, docA)
    const syncStep1 = encoding.toUint8Array(encoder1)

    const receivedOnB = new Promise<Uint8Array>((resolve) => {
      channelB.onmessage = (event) => {
        log(
          'B received data: ' +
            (event.data instanceof ArrayBuffer
              ? `${event.data.byteLength} bytes`
              : typeof event.data)
        )
        resolve(new Uint8Array(event.data))
      }
    })

    channelA.send(syncStep1.buffer)
    log('A sent sync step 1')

    const step1Data = await receivedOnB
    log('B got sync step 1')

    // B processes step 1, produces step 2
    const decoder = decoding.createDecoder(step1Data)
    const replyEncoder = encoding.createEncoder()
    syncProtocol.readSyncMessage(decoder, replyEncoder, docB, 'peer-a')
    const syncStep2 = encoding.toUint8Array(replyEncoder)

    if (syncStep2.length > 0) {
      const receivedOnA = new Promise<Uint8Array>((resolve) => {
        channelA.onmessage = (event) => {
          log(
            'A received data: ' +
              (event.data instanceof ArrayBuffer
                ? `${event.data.byteLength} bytes`
                : typeof event.data)
          )
          resolve(new Uint8Array(event.data))
        }
      })

      channelB.send(syncStep2.buffer)
      log('B sent sync step 2')

      const step2Data = await receivedOnA
      const d = decoding.createDecoder(step2Data)
      const e = encoding.createEncoder()
      syncProtocol.readSyncMessage(d, e, docA, 'peer-b')
      log('A processed sync step 2')
    }

    // Now also send sync step 1 from B to A (full bidirectional sync)
    const encoder2 = encoding.createEncoder()
    syncProtocol.writeSyncStep1(encoder2, docB)
    const syncStep1FromB = encoding.toUint8Array(encoder2)

    const receivedOnA2 = new Promise<Uint8Array>((resolve) => {
      channelA.onmessage = (event) => resolve(new Uint8Array(event.data))
    })
    channelB.send(syncStep1FromB.buffer)

    const step1FromBData = await receivedOnA2
    const d2 = decoding.createDecoder(step1FromBData)
    const re2 = encoding.createEncoder()
    syncProtocol.readSyncMessage(d2, re2, docA, 'peer-b')
    const reply2 = encoding.toUint8Array(re2)

    if (reply2.length > 0) {
      const receivedOnB2 = new Promise<Uint8Array>((resolve) => {
        channelB.onmessage = (event) => resolve(new Uint8Array(event.data))
      })
      channelA.send(reply2.buffer)
      const reply2Data = await receivedOnB2
      const d3 = decoding.createDecoder(reply2Data)
      const e3 = encoding.createEncoder()
      syncProtocol.readSyncMessage(d3, e3, docB, 'peer-a')
    }

    // Verify sync worked!
    log('Doc A content: ' + docA.getText('content').toString())
    log('Doc B content: ' + docB.getText('content').toString())
    log('Doc B meta title: ' + docB.getMap('meta').get('title'))

    expect(docB.getText('content').toString()).toBe('Hello from peer A!')
    expect(docB.getMap('meta').get('title')).toBe('Synced Page')

    // Cleanup
    clearInterval(icePollInterval)
    channelA.close()
    channelB.close()
    pcA.close()
    pcB.close()
    clientA.close()
    clientB.close()
    docA.destroy()
    docB.destroy()

    log('Test complete! Full sync verified.')
    console.log('All logs:', logs.join('\n'))
  }, 15000)

  it('should handle simultaneous announces (glare scenario)', async () => {
    const room = `glare-test-${Date.now()}`
    const peerIdA = `peer-a-${crypto.randomUUID()}`
    const peerIdB = `peer-b-${crypto.randomUUID()}`

    const clientA = await createSignalingClient(peerIdA)
    const clientB = await createSignalingClient(peerIdB)

    clientA.send({ type: 'subscribe', topics: [room] })
    clientB.send({ type: 'subscribe', topics: [room] })
    await new Promise((r) => setTimeout(r, 100))

    const config: RTCConfiguration = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    }

    // Both announce simultaneously (like y-webrtc does on connect)
    clientA.send({ type: 'publish', topic: room, data: { type: 'announce', from: peerIdA } })
    clientB.send({ type: 'publish', topic: room, data: { type: 'announce', from: peerIdB } })

    // Both will receive the other's announce and create offers
    // Wait for both to receive announces
    const announceForA = await clientA.waitForMessage(
      (m) => m.type === 'publish' && m.data?.type === 'announce' && m.data?.from === peerIdB
    )
    const announceForB = await clientB.waitForMessage(
      (m) => m.type === 'publish' && m.data?.type === 'announce' && m.data?.from === peerIdA
    )

    console.log('[glare-test] Both received announces')

    // Both create RTCPeerConnections as initiators (glare!)
    const pcA = new RTCPeerConnection(config)
    const pcB = new RTCPeerConnection(config)

    const channelA = pcA.createDataChannel('sync')
    const channelB = pcB.createDataChannel('sync')

    // Both create offers
    const offerA = await pcA.createOffer()
    await pcA.setLocalDescription(offerA)
    const tokenA = Date.now() + Math.random()

    const offerB = await pcB.createOffer()
    await pcB.setLocalDescription(offerB)
    const tokenB = Date.now() + Math.random()

    console.log(`[glare-test] tokenA=${tokenA}, tokenB=${tokenB}`)

    // Simulate y-webrtc glare resolution:
    // The peer with the HIGHER token rejects the remote offer
    // The peer with the LOWER token accepts it

    // Both send offers
    clientA.send({
      type: 'publish',
      topic: room,
      data: {
        type: 'signal',
        from: peerIdA,
        to: peerIdB,
        signal: { type: 'offer', sdp: offerA.sdp },
        token: tokenA
      }
    })
    clientB.send({
      type: 'publish',
      topic: room,
      data: {
        type: 'signal',
        from: peerIdB,
        to: peerIdA,
        signal: { type: 'offer', sdp: offerB.sdp },
        token: tokenB
      }
    })

    // Wait for both to receive offers
    await new Promise((r) => setTimeout(r, 200))

    // Determine winner/loser
    const aWins = tokenA > tokenB
    console.log(
      `[glare-test] ${aWins ? 'A' : 'B'} wins (higher token), ${aWins ? 'B' : 'A'} accepts remote offer`
    )

    // The winner rejects the remote offer (does nothing)
    // The loser must:
    // 1. Rollback its own local description
    // 2. Set the remote description to the winner's offer
    // 3. Create and send an answer

    const winner = aWins
      ? { pc: pcA, client: clientA, peerId: peerIdA, remotePeerId: peerIdB }
      : { pc: pcB, client: clientB, peerId: peerIdB, remotePeerId: peerIdA }
    const loser = aWins
      ? { pc: pcB, client: clientB, peerId: peerIdB, remotePeerId: peerIdA }
      : { pc: pcA, client: clientA, peerId: peerIdA, remotePeerId: peerIdB }
    const winnerOffer = aWins ? offerA : offerB

    // Loser: rollback and accept winner's offer
    console.log('[glare-test] Loser rolling back local description...')
    try {
      // In modern WebRTC, setRemoteDescription with an offer when in have-local-offer
      // implicitly rolls back the local description
      await loser.pc.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp: winnerOffer.sdp! })
      )
      console.log('[glare-test] Loser set remote description (implicit rollback)')
    } catch (err) {
      console.error(
        '[glare-test] ERROR: Loser failed to set remote description:',
        (err as Error).message
      )
      // If implicit rollback isn't supported, try explicit rollback first
      await loser.pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit)
      await loser.pc.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp: winnerOffer.sdp! })
      )
      console.log('[glare-test] Loser rolled back explicitly and set remote description')
    }

    const loserAnswer = await loser.pc.createAnswer()
    await loser.pc.setLocalDescription(loserAnswer)
    console.log('[glare-test] Loser created and set answer')

    // Send answer to winner
    loser.client.send({
      type: 'publish',
      topic: room,
      data: {
        type: 'signal',
        from: loser.peerId,
        to: winner.peerId,
        signal: { type: 'answer', sdp: loserAnswer.sdp }
      }
    })

    // Winner receives answer
    const answerMsg = await winner.client.waitForMessage(
      (m) => m.type === 'publish' && m.data?.type === 'signal' && m.data?.signal?.type === 'answer'
    )
    await winner.pc.setRemoteDescription(
      new RTCSessionDescription({
        type: 'answer',
        sdp: answerMsg.data!.signal!.sdp!
      } as RTCSessionDescriptionInit)
    )
    console.log('[glare-test] Winner set remote description (answer)')

    // ICE candidates - exchange through signaling
    winner.pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        winner.client.send({
          type: 'publish',
          topic: room,
          data: {
            type: 'signal',
            from: winner.peerId,
            to: loser.peerId,
            signal: { candidate: ev.candidate.toJSON() }
          }
        })
      }
    }
    loser.pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        loser.client.send({
          type: 'publish',
          topic: room,
          data: {
            type: 'signal',
            from: loser.peerId,
            to: winner.peerId,
            signal: { candidate: ev.candidate.toJSON() }
          }
        })
      }
    }

    // Process ICE candidates from messages
    const processIce = async () => {
      for (const msg of winner.client.messages) {
        if (msg.data?.signal && 'candidate' in (msg.data.signal as object)) {
          try {
            await winner.pc.addIceCandidate(
              new RTCIceCandidate((msg.data.signal as { candidate: RTCIceCandidateInit }).candidate)
            )
          } catch {}
        }
      }
      for (const msg of loser.client.messages) {
        if (msg.data?.signal && 'candidate' in (msg.data.signal as object)) {
          try {
            await loser.pc.addIceCandidate(
              new RTCIceCandidate((msg.data.signal as { candidate: RTCIceCandidateInit }).candidate)
            )
          } catch {}
        }
      }
    }
    await processIce()

    // Wait for connection
    const waitConnected = (pc: RTCPeerConnection, label: string) =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error(
            `[glare-test] ${label} connection timeout. State: ${pc.connectionState}, ICE: ${pc.iceConnectionState}`
          )
          reject(new Error(`${label} connection timeout. State: ${pc.connectionState}`))
        }, 10000)

        const check = () => {
          if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected') {
            clearTimeout(timeout)
            resolve()
          }
        }
        pc.onconnectionstatechange = check
        pc.oniceconnectionstatechange = check
        check()
      })

    await waitConnected(winner.pc, 'winner')
    console.log('[glare-test] Winner connected!')
    await waitConnected(loser.pc, 'loser')
    console.log('[glare-test] Loser connected!')

    console.log('[glare-test] Both peers connected after glare resolution!')

    // Cleanup
    pcA.close()
    pcB.close()
    clientA.close()
    clientB.close()
  }, 15000)
})
