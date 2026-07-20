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
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config'
import { createHub } from '../src/index'
import { HUB_ROLES } from '../src/roles'
import type { HubRole } from '../src/types'

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
      const resolved = resolveConfig({ ...baseOptions, port: port++, auth: false, role })
      expect(resolved.role).toBe(role)
      const hub = await createHub(resolved)
      await hub.start()
      const health = await fetch(`http://localhost:${resolved.port}/health`)
      expect(health.ok, `role ${role} /health`).toBe(true)
      await hub.stop()
    }
  })
})
