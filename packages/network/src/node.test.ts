import type { NetworkNode } from './types'
import { generateIdentity } from '@xnetjs/identity'
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  createNode,
  stopNode,
  getConnectedPeers,
  isStarted,
  getMultiaddrs,
  connectToPeer
} from './node'

describe('NetworkNode', () => {
  const nodes: NetworkNode[] = []

  afterEach(async () => {
    for (const node of nodes) {
      await stopNode(node)
    }
    nodes.length = 0
  })

  it('should create node', async () => {
    const { identity, privateKey } = generateIdentity()
    const node = await createNode({
      did: identity.did,
      privateKey,
      config: {
        bootstrapPeers: [],
        enableDHT: false,
        signalingServers: [],
        enableRelay: false
      }
    })
    nodes.push(node)

    expect(node.peerId).toBeDefined()
    expect(node.did).toBe(identity.did)
  })

  it('should report started status', async () => {
    const { identity, privateKey } = generateIdentity()
    const node = await createNode({
      did: identity.did,
      privateKey,
      config: {
        bootstrapPeers: [],
        enableDHT: false,
        signalingServers: [],
        enableRelay: false
      }
    })
    nodes.push(node)

    expect(isStarted(node)).toBe(true)
  })

  it('should report no connected peers initially', async () => {
    const { identity, privateKey } = generateIdentity()
    const node = await createNode({
      did: identity.did,
      privateKey,
      config: {
        bootstrapPeers: [],
        enableDHT: false,
        signalingServers: [],
        enableRelay: false
      }
    })
    nodes.push(node)

    const peers = getConnectedPeers(node)
    expect(peers).toHaveLength(0)
  })

  it('should get multiaddrs', async () => {
    const { identity, privateKey } = generateIdentity()
    const node = await createNode({
      did: identity.did,
      privateKey,
      config: {
        bootstrapPeers: [],
        enableDHT: false,
        signalingServers: [],
        enableRelay: false
      }
    })
    nodes.push(node)

    const addrs = getMultiaddrs(node)
    // In a test environment, there may be no multiaddrs
    expect(Array.isArray(addrs)).toBe(true)
  })

  it('should stop node', async () => {
    const { identity, privateKey } = generateIdentity()
    const node = await createNode({
      did: identity.did,
      privateKey,
      config: {
        bootstrapPeers: [],
        enableDHT: false,
        signalingServers: [],
        enableRelay: false
      }
    })

    expect(isStarted(node)).toBe(true)
    await stopNode(node)
    expect(isStarted(node)).toBe(false)
    // Don't add to nodes array since we manually stopped it
  })

  describe('connection telemetry', () => {
    it('should accept telemetry option without error', async () => {
      const { identity, privateKey } = generateIdentity()
      const telemetry = {
        reportUsage: vi.fn(),
        reportPerformance: vi.fn(),
        reportCrash: vi.fn()
      }

      const node = await createNode({
        did: identity.did,
        privateKey,
        config: {
          bootstrapPeers: [],
          enableDHT: false,
          signalingServers: [],
          enableRelay: false
        },
        telemetry
      })
      nodes.push(node)

      expect(node.peerId).toBeDefined()
      // telemetry is attached; no usage events yet since no peers connected
      expect(telemetry.reportUsage).not.toHaveBeenCalled()
    })

    it('connectToPeer should report dial_failure telemetry on error', async () => {
      const { identity, privateKey } = generateIdentity()
      const telemetry = {
        reportUsage: vi.fn(),
        reportPerformance: vi.fn(),
        reportCrash: vi.fn()
      }

      const node = await createNode({
        did: identity.did,
        privateKey,
        config: {
          bootstrapPeers: [],
          enableDHT: false,
          signalingServers: [],
          enableRelay: false
        }
      })
      nodes.push(node)

      // Attempt to connect to a bad address - should fail and report telemetry
      await expect(
        connectToPeer(node, '/ip4/127.0.0.1/tcp/99999/p2p/QmInvalid', telemetry)
      ).rejects.toThrow()

      expect(telemetry.reportUsage).toHaveBeenCalledWith('network.dial_failure', 1)
      expect(telemetry.reportCrash).toHaveBeenCalled()
    })
  })
})
