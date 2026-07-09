import { describe, expect, it } from 'vitest'
import { litestreamConfig, toYaml } from './config'

describe('litestreamConfig', () => {
  it('builds a single-DB R2 config with env-ref credentials by default', () => {
    const cfg = litestreamConfig({
      dbPath: '/data/hub.db',
      endpoint: 'https://acct.r2.cloudflarestorage.com',
      bucket: 'xnet-db-snapshots',
      path: '/t/acme/db' // leading slash trimmed
    })
    expect(cfg.dbs[0].path).toBe('/data/hub.db')
    const r = cfg.dbs[0].replicas[0]
    expect(r).toMatchObject({
      type: 's3',
      bucket: 'xnet-db-snapshots',
      path: 't/acme/db',
      accessKeyId: '${R2_ACCESS_KEY_ID}',
      secretAccessKey: '${R2_SECRET_ACCESS_KEY}',
      syncInterval: '1s'
    })
  })

  it('requires the core fields', () => {
    expect(() => litestreamConfig({ dbPath: '', endpoint: 'e', bucket: 'b', path: 'p' })).toThrow(
      /requires/
    )
  })

  it('emits a metrics addr only when requested', () => {
    const withAddr = litestreamConfig({
      dbPath: '/data/hub.db',
      endpoint: 'e',
      bucket: 'b',
      path: 'p',
      metricsAddr: '127.0.0.1:9090'
    })
    expect(withAddr.addr).toBe('127.0.0.1:9090')
    const without = litestreamConfig({
      dbPath: '/data/hub.db',
      endpoint: 'e',
      bucket: 'b',
      path: 'p'
    })
    expect(without.addr).toBeUndefined()
  })
})

describe('toYaml', () => {
  it('renders a top-level addr line when configured', () => {
    const yaml = toYaml(
      litestreamConfig({
        dbPath: '/data/hub.db',
        endpoint: 'e',
        bucket: 'b',
        path: 't/acme/db',
        metricsAddr: '127.0.0.1:9090'
      })
    )
    expect(yaml.startsWith('addr: 127.0.0.1:9090\n')).toBe(true)
    expect(yaml).toContain('dbs:')
  })

  it('renders the Litestream YAML shape (no secrets embedded by default)', () => {
    const yaml = toYaml(
      litestreamConfig({
        dbPath: '/data/hub.db',
        endpoint: 'https://acct.r2.cloudflarestorage.com',
        bucket: 'xnet-db-snapshots',
        path: 't/acme/db'
      })
    )
    expect(yaml).toContain('dbs:')
    expect(yaml).toContain('  - path: /data/hub.db')
    expect(yaml).toContain('      - type: s3')
    expect(yaml).toContain('        bucket: xnet-db-snapshots')
    expect(yaml).toContain('        path: t/acme/db')
    expect(yaml).toContain('        access-key-id: ${R2_ACCESS_KEY_ID}')
    expect(yaml).toContain('        sync-interval: 1s')
    expect(yaml.endsWith('\n')).toBe(true)
  })
})
