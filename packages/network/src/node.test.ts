import type { NetworkNode } from './types'
import { generateIdentity } from '@xnet/identity'
import { describe, it, expect, afterEach } from 'vitest'
import { createNode, stopNode, getConnectedPeers, isStarted, getMultiaddrs } from './node'

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
})
