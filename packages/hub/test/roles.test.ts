/**
 * Named role presets (explorations 0382/0383, W1).
 *
 * Three properties under test:
 * 1. `--role demo` is byte-identical to the legacy `--demo` flag — the Railway
 *    migration proof (0383 W1's definition of done).
 * 2. Every named preset resolves and boots; the named presets are the ONLY
 *    supported combinations (the Elasticsearch `node.roles` posture).
 * 3. Precedence is preset < explicit config < flags: a role never overrides a
 *    choice the operator made by hand.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config'
import { createHub } from '../src/index'
import { HUB_ROLES } from '../src/roles'
import type { HubConfig, HubRole } from '../src/types'

const baseOptions = { port: 0, storage: 'memory' as const, dataDir: '/tmp/xnet-role-test' }

describe('hub roles (0382/0383 W1)', () => {
  afterEach(() => {
    delete process.env.HUB_ROLE
    delete process.env.HUB_MODE
  })

  it('--role demo resolves identically to the legacy --demo flag', () => {
    const viaRole = resolveConfig({ ...baseOptions, role: 'demo' })
    const viaLegacy = resolveConfig({ ...baseOptions, demo: true })
    // The legacy path resolves role to 'demo' too, so the entire configs match.
    expect(viaLegacy.role).toBe('demo')
    expect(viaRole).toEqual(viaLegacy)
  })

  it('HUB_MODE=demo env continues to work as an alias', () => {
    process.env.HUB_MODE = 'demo'
    const resolved = resolveConfig({ ...baseOptions })
    expect(resolved.role).toBe('demo')
    expect(resolved.demo).toBe(true)
    expect(resolved.demoOverrides).toBeDefined()
  })

  it('HUB_ROLE env selects the role', () => {
    process.env.HUB_ROLE = 'registry'
    const resolved = resolveConfig({ ...baseOptions })
    expect(resolved.role).toBe('registry')
    expect(resolved.shards?.enabled).toBe(true)
    expect(resolved.shards?.isRegistry).toBe(true)
  })

  it('rejects an unknown role loudly', () => {
    expect(() => resolveConfig({ ...baseOptions, role: 'blogosphere' as never })).toThrow(
      /Unknown hub role/
    )
  })

  it('defaults to personal with nothing extra enabled', () => {
    const resolved = resolveConfig({ ...baseOptions })
    expect(resolved.role).toBe('personal')
    expect(resolved.demo).toBe(false)
    expect(resolved.federation).toBeUndefined()
    expect(resolved.shards).toBeUndefined()
    expect(resolved.crawl).toBeUndefined()
  })

  it('community enables federation; index pins the legacy search stack off', () => {
    expect(resolveConfig({ ...baseOptions, role: 'community' }).federation?.enabled).toBe(true)
    const index = resolveConfig({ ...baseOptions, role: 'index' })
    expect(index.federation?.enabled).toBe(false)
    expect(index.shards?.enabled).toBe(false)
    expect(index.crawl?.enabled).toBe(false)
  })

  it('explicit config overrides the preset (preset < config < flags)', () => {
    const resolved = resolveConfig({
      ...baseOptions,
      role: 'community',
      federation: { enabled: false }
    })
    expect(resolved.federation?.enabled).toBe(false)
  })

  it('every named preset resolves and boots', async () => {
    let port = 14480
    for (const role of Object.keys(HUB_ROLES) as HubRole[]) {
      // The index role's engine gets a no-network override in CI; everything
      // else boots exactly as the preset says.
      const overrides: Partial<HubConfig> =
        role === 'index'
          ? {
              atprotoIndex: {
                enabled: true,
                rebuildOnStart: false,
                source: { listRepos: async () => [], listRecords: async () => [] }
              }
            }
          : {}
      const resolved = resolveConfig({
        ...baseOptions,
        dataDir: mkdtempSync(join(tmpdir(), `xnet-role-${role}-`)),
        port: port++,
        auth: false,
        role,
        ...overrides
      })
      expect(resolved.role).toBe(role)
      const hub = await createHub(resolved)
      await hub.start()
      const health = await fetch(`http://localhost:${resolved.port}/health`)
      expect(health.ok, `role ${role} /health`).toBe(true)
      await hub.stop()
    }
  })
})

describe('hub system identity (0371/0383 W4)', () => {
  it('mints a persistent DID, surfaces it on /health, and keeps it across restarts', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'xnet-hubid-'))
    const boot = async (): Promise<{ did: string; stop: () => Promise<void> }> => {
      const hub = await createHub(
        resolveConfig({ port: 14486, storage: 'memory', dataDir, auth: false })
      )
      await hub.start()
      const health = (await (await fetch('http://localhost:14486/health')).json()) as {
        hubDid: string
        role: string
      }
      expect(health.role).toBe('personal')
      return { did: health.hubDid, stop: () => hub.stop() }
    }
    const first = await boot()
    expect(first.did).toMatch(/^did:key:z/)
    await first.stop()
    const second = await boot()
    expect(second.did).toBe(first.did) // stable across restarts — the 0371 fix
    await second.stop()
  })
})
