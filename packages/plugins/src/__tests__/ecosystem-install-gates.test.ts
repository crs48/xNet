/**
 * Integration tests for the 0192 install gates + capability enforcement,
 * exercised end-to-end through a real PluginRegistry via the test harness.
 */

import type { ExtensionContext } from '../context'
import { describe, it, expect, vi } from 'vitest'
import { CapabilityError } from '../ecosystem/capability-guard'
import { createTestPluginHarness } from '../ecosystem/testing'
import { defineFeatureModule } from '../feature-module'

const NOTE = 'xnet://xnet.fyi/Note@1.0.0' as const
const SECRET = 'xnet://xnet.fyi/Secret@1.0.0' as const

describe('compatibility gate', () => {
  it('blocks install when the host is too old', async () => {
    const h = createTestPluginHarness()
    const mod = defineFeatureModule({
      id: 'com.me.newthing',
      name: 'New Thing',
      version: '1.0.0',
      xnetVersion: '>=0.6.0'
    })
    await expect(h.registry.install(mod, { hostVersion: '0.5.0' })).rejects.toThrow(/requires xNet/)
    expect(h.registry.has('com.me.newthing')).toBe(false)
  })

  it('allows install on a compatible host', async () => {
    const h = createTestPluginHarness()
    const mod = defineFeatureModule({
      id: 'com.me.newthing',
      name: 'New Thing',
      version: '1.0.0',
      xnetVersion: '>=0.6.0'
    })
    await h.registry.install(mod, { hostVersion: '0.7.0' })
    expect(h.registry.get('com.me.newthing')?.status).toBe('active')
  })
})

describe('dependency gate', () => {
  it('blocks install when a dependency is missing, then succeeds once present', async () => {
    const h = createTestPluginHarness()
    const app = defineFeatureModule({
      id: 'com.me.app',
      name: 'App',
      version: '1.0.0',
      dependencies: { 'com.me.core': '>=1.0.0' }
    })
    await expect(h.registry.install(app)).rejects.toThrow(/unmet dependencies/)

    await h.registry.install(
      defineFeatureModule({ id: 'com.me.core', name: 'Core', version: '1.2.0' })
    )
    await h.registry.install(app)
    expect(h.registry.get('com.me.app')?.status).toBe('active')
  })
})

describe('consent gate', () => {
  const mod = defineFeatureModule({
    id: 'com.acme.kanban',
    name: 'Kanban',
    version: '1.0.0',
    capabilities: { schemaWrite: [NOTE] }
  })

  it('prompts marketplace installs and aborts when declined', async () => {
    const h = createTestPluginHarness()
    const onConsent = vi.fn().mockResolvedValue(false)
    await expect(h.registry.install(mod, { provenance: 'marketplace', onConsent })).rejects.toThrow(
      /declined at capability consent/
    )
    expect(onConsent).toHaveBeenCalledOnce()
    expect(h.registry.has('com.acme.kanban')).toBe(false)
  })

  it('installs when consent is granted and records the marketplace trust tier', async () => {
    const h = createTestPluginHarness()
    const onConsent = vi.fn().mockResolvedValue(true)
    await h.registry.install(mod, { provenance: 'marketplace', onConsent })
    const reg = h.registry.get('com.acme.kanban')
    expect(reg?.status).toBe('active')
    expect(reg?.provenance).toBe('marketplace')
    expect(reg?.trustTier).toBe('marketplace')
    expect(onConsent).toHaveBeenCalledOnce()
  })

  it('does not prompt for locally authored installs', async () => {
    const h = createTestPluginHarness()
    const onConsent = vi.fn().mockResolvedValue(true)
    await h.registry.install(mod, { provenance: 'authored', onConsent })
    expect(onConsent).not.toHaveBeenCalled()
    expect(h.registry.get('com.acme.kanban')?.trustTier).toBe('user')
  })
})

describe('capability enforcement end-to-end', () => {
  function writerModule(targetSchema: `xnet://${string}/${string}`) {
    let writeError: unknown
    const mod = defineFeatureModule({
      id: 'com.me.writer',
      name: 'Writer',
      version: '1.0.0',
      capabilities: { schemaWrite: [NOTE] },
      async activate(ctx: ExtensionContext) {
        try {
          await ctx.store.create({ schemaId: targetSchema, properties: { title: 'x' } })
        } catch (err) {
          writeError = err
          throw err
        }
      }
    })
    return { mod, getError: () => writeError }
  }

  it('permits a write inside the grant', async () => {
    const h = createTestPluginHarness()
    const { mod } = writerModule(NOTE)
    await h.registry.install(mod, { provenance: 'authored' })
    expect(h.registry.get('com.me.writer')?.status).toBe('active')
    expect(h.store.count(NOTE)).toBe(1)
  })

  it('blocks a write outside the grant with a CapabilityError', async () => {
    const h = createTestPluginHarness()
    const { mod, getError } = writerModule(SECRET)
    await expect(h.registry.install(mod, { provenance: 'authored' })).rejects.toBeInstanceOf(
      CapabilityError
    )
    expect(getError()).toBeInstanceOf(CapabilityError)
    expect(h.store.count(SECRET)).toBe(0)
  })
})

describe('back-compatibility', () => {
  it('install(manifest) with no options still works', async () => {
    const h = createTestPluginHarness()
    await h.install(defineFeatureModule({ id: 'com.me.simple', name: 'Simple', version: '1.0.0' }))
    expect(h.registry.get('com.me.simple')?.status).toBe('active')
    // Default provenance is 'imported' → user tier.
    expect(h.registry.get('com.me.simple')?.trustTier).toBe('user')
  })
})
