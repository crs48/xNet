/**
 * URL classification for link up-res (exploration 0295).
 */
import { describe, expect, it } from 'vitest'
import { classifyUrl, currentUrlEnv, parseAppDeepLink, type UrlEnv } from './url-upres'

const ENV: UrlEnv = {
  appHosts: ['xnet.fyi', 'localhost:5173'],
  hubHosts: ['hub.xnet.fyi']
}

describe('parseAppDeepLink', () => {
  it('parses hash-routed deep links on an app host', () => {
    expect(parseAppDeepLink('https://xnet.fyi/app/#/doc/abc123', ENV.appHosts)).toEqual({
      nodeKind: 'page',
      nodeId: 'abc123'
    })
  })

  it('parses path-routed deep links (dev server)', () => {
    expect(parseAppDeepLink('http://localhost:5173/db/db-1', ENV.appHosts)).toEqual({
      nodeKind: 'database',
      nodeId: 'db-1'
    })
  })

  it('maps every routed kind', () => {
    const cases: Array<[string, string]> = [
      ['doc', 'page'],
      ['db', 'database'],
      ['canvas', 'canvas'],
      ['dashboard', 'dashboard'],
      ['view', 'savedview'],
      ['map', 'map'],
      ['channel', 'channel'],
      ['tag', 'tag'],
      ['space', 'space']
    ]
    for (const [segment, kind] of cases) {
      expect(parseAppDeepLink(`https://xnet.fyi/#/${segment}/n1`, ENV.appHosts)).toEqual({
        nodeKind: kind,
        nodeId: 'n1'
      })
    }
  })

  it('ignores hash queries in hash-routed links', () => {
    expect(parseAppDeepLink('https://xnet.fyi/#/doc/abc?panel=peek', ENV.appHosts)).toEqual({
      nodeKind: 'page',
      nodeId: 'abc'
    })
  })

  it('rejects other hosts, unknown routes, and non-http schemes', () => {
    expect(parseAppDeepLink('https://example.com/doc/abc', ENV.appHosts)).toBeNull()
    expect(parseAppDeepLink('https://xnet.fyi/#/unknown/abc', ENV.appHosts)).toBeNull()
    expect(parseAppDeepLink('https://xnet.fyi/#/doc/abc/extra', ENV.appHosts)).toBeNull()
    expect(parseAppDeepLink('ftp://xnet.fyi/doc/abc', ENV.appHosts)).toBeNull()
    expect(parseAppDeepLink('not a url', ENV.appHosts)).toBeNull()
  })
})

describe('classifyUrl', () => {
  it('classifies app deep links as internal', () => {
    expect(classifyUrl('https://xnet.fyi/app/#/doc/abc123', ENV)).toEqual({
      kind: 'internal',
      nodeKind: 'page',
      nodeId: 'abc123'
    })
  })

  it('classifies xnet:// reference URIs as internal', () => {
    expect(classifyUrl('xnet://database/db-42', ENV)).toEqual({
      kind: 'internal',
      nodeKind: 'database',
      nodeId: 'db-42'
    })
  })

  it('classifies canonical share links (secret in fragment) from any host', () => {
    expect(classifyUrl('https://other-hub.example/s/xv17-H8BwWy9#s=sekret', ENV)).toEqual({
      kind: 'share',
      linkId: 'xv17-H8BwWy9',
      hubUrl: 'https://other-hub.example',
      secret: 'sekret'
    })
  })

  it('classifies secret-less share links only on trusted hub hosts', () => {
    expect(classifyUrl('https://hub.xnet.fyi/s/xv17-H8BwWy9', ENV)).toEqual({
      kind: 'share',
      linkId: 'xv17-H8BwWy9',
      hubUrl: 'https://hub.xnet.fyi',
      secret: null
    })
    expect(classifyUrl('https://example.com/s/xv17-H8BwWy9', ENV)).toEqual({
      kind: 'external',
      url: 'https://example.com/s/xv17-H8BwWy9'
    })
  })

  it('classifies xnet://share deep links', () => {
    expect(
      classifyUrl('xnet://share?link=xv17-H8BwWy9&hub=https://hub.xnet.fyi#s=sek', ENV)
    ).toEqual({
      kind: 'share',
      linkId: 'xv17-H8BwWy9',
      hubUrl: 'https://hub.xnet.fyi',
      secret: 'sek'
    })
  })

  it('classifies everything else as external', () => {
    expect(classifyUrl('https://example.com/article', ENV)).toEqual({
      kind: 'external',
      url: 'https://example.com/article'
    })
    expect(classifyUrl('https://xnet.fyi/blog/some-post', ENV)).toEqual({
      kind: 'external',
      url: 'https://xnet.fyi/blog/some-post'
    })
    expect(classifyUrl('garbage', ENV)).toEqual({ kind: 'external', url: 'garbage' })
  })
})

describe('currentUrlEnv', () => {
  it('includes the public app host, the window host, and the hub host', () => {
    const env = currentUrlEnv('https://hub.xnet.fyi')
    expect(env.appHosts).toContain('xnet.fyi')
    expect(env.appHosts).toContain(window.location.host)
    expect(env.hubHosts).toEqual(['hub.xnet.fyi'])
  })

  it('tolerates a missing or malformed hub URL', () => {
    expect(currentUrlEnv(null).hubHosts).toEqual([])
    expect(currentUrlEnv('::not-a-url::').hubHosts).toEqual([])
  })
})
