import type { XNetExtension } from '@xnetjs/plugins'
import { describe, expect, it, vi } from 'vitest'
import { buildLabExtensionManifest, publishLabAsExtension, slugifyForId } from '../extension'

const lab = { id: 'lab-1', title: 'Overdue Tasks', description: 'counts overdue tasks' }

describe('slugifyForId', () => {
  it('produces reverse-domain-safe segments', () => {
    expect(slugifyForId('Overdue Tasks')).toBe('overdue-tasks')
    expect(slugifyForId('  weird!!name  ')).toBe('weird-name')
    expect(slugifyForId('123 numbers')).toBe('lab-123-numbers')
    expect(slugifyForId('')).toBe('untitled')
  })
})

describe('buildLabExtensionManifest', () => {
  it('builds a valid command manifest whose handler runs the Lab', () => {
    const execute = vi.fn()
    const manifest = buildLabExtensionManifest(lab, { execute })
    expect(manifest.id).toBe('xnet.lab.overdue-tasks')
    expect(manifest.version).toBe('1.0.0')
    expect(manifest.contributes?.commands).toHaveLength(1)

    manifest.contributes!.commands![0].execute()
    expect(execute).toHaveBeenCalledOnce()
  })

  it('can build a slash-command manifest', () => {
    const execute = vi.fn()
    const manifest = buildLabExtensionManifest(lab, { kind: 'slashCommand', execute })
    expect(manifest.contributes?.slashCommands).toHaveLength(1)
    manifest.contributes!.slashCommands![0].execute({ editor: null, range: { from: 0, to: 0 } })
    expect(execute).toHaveBeenCalledOnce()
  })

  it('carries declared permissions into the manifest', () => {
    const manifest = buildLabExtensionManifest(lab, {
      execute: () => {},
      permissions: { schemas: { read: ['xnet://xnet.fyi/Task@1.0.0'] } }
    })
    expect(manifest.permissions?.schemas?.read).toEqual(['xnet://xnet.fyi/Task@1.0.0'])
  })
})

describe('publishLabAsExtension', () => {
  function fakeRegistry() {
    const installed: XNetExtension[] = []
    const activated: string[] = []
    return {
      installed,
      activated,
      install: vi.fn(async (m: XNetExtension) => {
        installed.push(m)
      }),
      activate: vi.fn(async (id: string) => {
        activated.push(id)
      })
    }
  }

  it('installs and activates, deriving the user trust tier', async () => {
    const registry = fakeRegistry()
    const manifest = buildLabExtensionManifest(lab, { execute: () => {} })
    const result = await publishLabAsExtension({ manifest, registry })
    expect(registry.install).toHaveBeenCalledOnce()
    expect(registry.activated).toEqual(['xnet.lab.overdue-tasks'])
    expect(result.trustTier).toBe('user')
  })

  it('aborts when the capability prompt is declined', async () => {
    const registry = fakeRegistry()
    const manifest = buildLabExtensionManifest(lab, { execute: () => {} })
    await expect(
      publishLabAsExtension({ manifest, registry, requestPermission: () => false })
    ).rejects.toThrow(/declined/i)
    expect(registry.install).not.toHaveBeenCalled()
  })
})
