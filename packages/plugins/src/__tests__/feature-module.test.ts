import type { NodeStore } from '@xnetjs/data'
import { describe, it, expect } from 'vitest'
import { createExtensionContext } from '../context'
import { ContributionRegistry } from '../contributions'
import { defineFeatureModule } from '../feature-module'

// registerImporter never touches the store; a minimal stub satisfies the type.
const fakeStore = {
  list: async () => [],
  subscribe: () => () => {}
} as unknown as NodeStore

describe('importers contribution point (0189)', () => {
  it('registers and disposes an importer via the context', () => {
    const contributions = new ContributionRegistry()
    const ctx = createExtensionContext({
      pluginId: 'fyi.xnet.import.instagram',
      store: fakeStore,
      contributions,
      platform: 'web'
    })

    const disposable = ctx.registerImporter({
      id: 'ig',
      platform: 'instagram',
      version: '1.0.0',
      adapter: { detect: () => 1 }
    })
    expect(contributions.importers.get('ig')?.platform).toBe('instagram')

    disposable.dispose()
    expect(contributions.importers.has('ig')).toBe(false)
  })

  it('clear() drops importers along with the other registries', () => {
    const contributions = new ContributionRegistry()
    contributions.importers.register({
      id: 'yt',
      platform: 'youtube',
      version: '1.0.0',
      adapter: {}
    })
    expect(contributions.importers.size).toBe(1)
    contributions.clear()
    expect(contributions.importers.size).toBe(0)
  })
})

describe('defineFeatureModule (0189)', () => {
  it('carries capabilities + hub linkage + importer contributions', () => {
    const mod = defineFeatureModule({
      id: 'fyi.xnet.billing',
      name: 'Billing',
      version: '1.0.0',
      capabilities: {
        secrets: ['STRIPE_SECRET_KEY', 'BTCPAY_*'],
        schemaWrite: ['xnet://xnet.fyi/Subscription@1.0.0']
      },
      hub: { featureId: 'fyi.xnet.billing' },
      contributes: {
        importers: [{ id: 'x', platform: 'p', version: '1.0.0', adapter: {} }]
      }
    })

    expect(mod.capabilities?.secrets).toContain('BTCPAY_*')
    expect(mod.capabilities?.schemaWrite).toContain('xnet://xnet.fyi/Subscription@1.0.0')
    expect(mod.hub?.featureId).toBe('fyi.xnet.billing')
    expect(mod.contributes?.importers?.[0].platform).toBe('p')
  })
})
