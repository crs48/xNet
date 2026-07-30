/**
 * Fresh-profile guard for the landing demo seed (exploration 0384).
 *
 * The seed must run exactly once, only when /app?demo=1 was captured AND the
 * profile has no user content — infrastructure nodes (bundled-plugin installs,
 * system/meta schemas) don't count, but any content node vetoes it. A
 * returning user's workspace is never auto-seeded.
 */
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { PluginSchema } from '@xnetjs/plugins'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  captureDemoSeedSignalFromLocation,
  clearDemoSeedPending,
  demoSeedPending,
  maybeRunDemoSeed
} from './demo-seed'

const setUrl = (pathQueryHash: string): void => {
  window.history.replaceState({}, '', pathQueryHash)
}

/** Simulate arriving from the landing CTA: URL carries ?demo=1, boot captures it. */
const armDemoSignal = (): void => {
  setUrl('/?demo=1')
  captureDemoSeedSignalFromLocation()
}

async function makeStore(): Promise<NodeStore> {
  const keys = generateSigningKeyPair()
  const store = new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: createDID(keys.publicKey),
    signingKey: keys.privateKey
  })
  await store.initialize()
  return store
}

const countNodes = (store: NodeStore): Promise<number> => store.getStorageAdapter().countNodes()

describe('captureDemoSeedSignalFromLocation', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => setUrl('/'))

  it('captures ?demo=1 into sessionStorage and strips it from the URL', () => {
    setUrl('/?demo=1&hub=wss%3A%2F%2Fhub.example')
    captureDemoSeedSignalFromLocation()

    expect(demoSeedPending()).toBe(true)
    expect(window.location.search).not.toContain('demo=')
    // Only the demo param is consumed; other boot params are left for their owners.
    expect(window.location.search).toContain('hub=')
  })

  it('captures the demo signal from a hash-routed URL', () => {
    setUrl('/#/?demo=1')
    captureDemoSeedSignalFromLocation()

    expect(demoSeedPending()).toBe(true)
    expect(window.location.hash).not.toContain('demo=')
  })

  it('does nothing without the demo param', () => {
    setUrl('/')
    captureDemoSeedSignalFromLocation()

    expect(demoSeedPending()).toBe(false)
  })
})

describe('maybeRunDemoSeed fresh-profile guard', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => {
    clearDemoSeedPending()
    setUrl('/')
  })

  it('is a no-op when the demo signal was never captured', async () => {
    const store = await makeStore()

    expect(await maybeRunDemoSeed(store)).toBe('not-requested')
    expect(await countNodes(store)).toBe(0)
  })

  it('seeds a fresh profile once, then never again', async () => {
    const store = await makeStore()
    armDemoSignal()

    expect(await maybeRunDemoSeed(store)).toBe('seeded')
    expect(await countNodes(store)).toBeGreaterThan(0)

    // The pending flag is consumed — a reload doesn't re-arm the seed.
    expect(demoSeedPending()).toBe(false)
    expect(await maybeRunDemoSeed(store)).toBe('not-requested')
  })

  it('never seeds a profile that already has user content', async () => {
    const store = await makeStore()
    await store.create({
      schemaId: 'xnet://xnet.fyi/Page',
      properties: { title: 'My private notes' }
    })
    armDemoSignal()

    expect(await maybeRunDemoSeed(store)).toBe('skipped-existing-data')
    expect(await countNodes(store)).toBe(1)
    // Decision is final for this entry — the flag doesn't linger.
    expect(demoSeedPending()).toBe(false)
  })

  it('treats a profile holding only infrastructure nodes as fresh', async () => {
    const store = await makeStore()
    // Every fresh profile gets bundled-plugin install records before the seed
    // can run (BundledPluginInstaller) — they must not veto the demo.
    await store.create({
      schemaId: PluginSchema._schemaId,
      properties: {
        pluginId: 'fyi.xnet.sample',
        name: 'Sample Plugin',
        version: '1.0.0',
        description: '',
        author: '',
        enabled: true,
        manifest: '{}',
        installedAt: Date.now()
      }
    })
    armDemoSignal()

    expect(await maybeRunDemoSeed(store)).toBe('seeded')
    expect(await countNodes(store)).toBeGreaterThan(1)
  })
})
