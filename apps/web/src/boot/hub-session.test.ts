/**
 * Boot URL-param handling (0290 follow-up).
 *
 * The boot resolver consumes `?hub=` pins and scrubs stray share params — but
 * it must leave the /share route's claim inputs (`link`/`hub`/`payload`/
 * `handle` + `#s=` fragment) completely alone: it runs before the route
 * mounts, and stripping them broke every web-fallback claim with
 * "Missing link, handle, or payload in share link".
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveHubSessionFromLocation } from './hub-session'

const setUrl = (pathQueryHash: string): void => {
  window.history.replaceState({}, '', pathQueryHash)
}

describe('resolveHubSessionFromLocation', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => {
    setUrl('/')
  })

  it('leaves a path-routed share-claim URL untouched and does not persist its hub', () => {
    setUrl('/share?link=AbCdEf123456&hub=https%3A%2F%2Fhub.example#s=sekret')
    const result = resolveHubSessionFromLocation()

    // Claim inputs survive for the /share route to read.
    expect(window.location.search).toContain('link=AbCdEf123456')
    expect(window.location.search).toContain('hub=')
    expect(window.location.hash).toBe('#s=sekret')
    // The issuing hub is NOT a pin request.
    expect(localStorage.getItem('xnet:hub-url')).toBeNull()
    expect(result.authToken).toBeNull()
  })

  it('leaves a hash-routed share-claim URL untouched', () => {
    setUrl('/app/#/share?link=AbCdEf123456&hub=https%3A%2F%2Fhub.example&s=sekret')
    resolveHubSessionFromLocation()

    expect(window.location.hash).toContain('link=AbCdEf123456')
    expect(window.location.hash).toContain('hub=')
    expect(window.location.hash).toContain('s=sekret')
    expect(localStorage.getItem('xnet:hub-url')).toBeNull()
  })

  it('still consumes a ?hub= pin on non-share routes (cloud dashboard flow)', () => {
    setUrl('/?hub=https%3A%2F%2Fpersonal.example')
    resolveHubSessionFromLocation()

    expect(localStorage.getItem('xnet:hub-url')).toBe('wss://personal.example')
    expect(window.location.search).not.toContain('hub=')
  })

  it('still scrubs stray payload/handle params on non-share routes', () => {
    setUrl('/doc/abc?payload=AAAA&handle=sh_0123456789abcdef')
    resolveHubSessionFromLocation()

    expect(window.location.search).not.toContain('payload=')
    expect(window.location.search).not.toContain('handle=')
  })
})
