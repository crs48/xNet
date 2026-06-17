/**
 * Integration tests for the 0192 install gates + capability enforcement,
 * exercised end-to-end through a real PluginRegistry via the test harness.
 */

import type { ExtensionContext } from '../context'
import { describe, it, expect, vi } from 'vitest'
import {
  generateLicenseKeypair,
  mintPluginLicense,
  checkLicenseFor,
  publicKeyFromHex,
  privateKeyFromHex
} from '@xnetjs/licenses'
import { CapabilityError } from '../ecosystem/capability-guard'
import { createTestPluginHarness } from '../ecosystem/testing'
import { defineFeatureModule } from '../feature-module'
import { LicenseRequiredError } from '../registry'

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

describe('paid-license gate (0196)', () => {
  const paidPlugin = defineFeatureModule({
    id: 'com.acme.pro',
    name: 'Acme Pro',
    version: '1.0.0',
    license: 'FSL-1.1-MIT',
    pricing: { mode: 'one-time', amountMinor: 999, currency: 'USD' }
  })
  const buyerDid = 'did:key:zBuyer'

  it('blocks a paid install when no license provider is wired in (fail-closed)', async () => {
    const h = createTestPluginHarness()
    await expect(
      h.registry.install(paidPlugin, { provenance: 'marketplace' })
    ).rejects.toBeInstanceOf(LicenseRequiredError)
    expect(h.registry.has('com.acme.pro')).toBe(false)
  })

  it('blocks when the buyer has no valid license', async () => {
    const h = createTestPluginHarness()
    const { publicKeyHex } = generateLicenseKeypair()
    const checkLicense = vi.fn(() =>
      checkLicenseFor(undefined, {
        pluginId: paidPlugin.id,
        buyerDid,
        publicKey: publicKeyFromHex(publicKeyHex),
        now: 1_700_000_000_000
      })
    )
    await expect(
      h.registry.install(paidPlugin, { provenance: 'marketplace', checkLicense })
    ).rejects.toThrow(/no-license/)
    expect(checkLicense).toHaveBeenCalledOnce()
  })

  it('installs a paid plugin when the buyer holds a valid minted license', async () => {
    const h = createTestPluginHarness()
    const { publicKeyHex, privateKeyHex } = generateLicenseKeypair()
    const now = 1_700_000_000_000
    const token = mintPluginLicense(
      { pluginId: paidPlugin.id, buyerDid, mode: 'one-time', now },
      privateKeyFromHex(privateKeyHex)
    )
    const checkLicense = vi.fn((manifest) =>
      checkLicenseFor(token, {
        pluginId: manifest.id,
        buyerDid,
        publicKey: publicKeyFromHex(publicKeyHex),
        now
      })
    )
    await h.registry.install(paidPlugin, { provenance: 'marketplace', checkLicense })
    expect(h.registry.get('com.acme.pro')?.status).toBe('active')
  })

  it('does not run the license check for free plugins', async () => {
    const h = createTestPluginHarness()
    const checkLicense = vi.fn(() => ({ ok: true }))
    const free = defineFeatureModule({ id: 'com.acme.free', name: 'Free', version: '1.0.0' })
    await h.registry.install(free, { checkLicense })
    expect(checkLicense).not.toHaveBeenCalled()
    expect(h.registry.get('com.acme.free')?.status).toBe('active')
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
