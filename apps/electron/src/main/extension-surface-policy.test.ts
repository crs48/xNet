import { describe, expect, it } from 'vitest'
import {
  allowedSurfaceResource,
  decodeDesktopRequest,
  extensionCsp,
  surfaceBounds,
  validateSurfaceInput
} from './extension-surface-policy'
describe('browser extension authority boundaries', () => {
  it('serves only exact entry/runtime URLs, never arbitrary files, hosts, queries or traversal', () => {
    const origin = 'xnet-extension://session'
    expect(allowedSurfaceResource(origin + '/index.html', origin)).toBe(true)
    expect(allowedSurfaceResource(origin + '/runtime.js', origin)).toBe(true)
    for (const url of [
      'file:///etc/passwd',
      'https://example.com',
      'http://127.0.0.1:31415',
      'xnet-extension://other/runtime.js',
      origin + '/../runtime.js',
      origin + '/runtime.js?secret=1',
      origin + '/index.html#secret'
    ])
      expect(allowedSurfaceResource(url, origin)).toBe(false)
    for (const directive of [
      "connect-src 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "form-action 'none'"
    ])
      expect(extensionCsp).toContain(directive)
  })
  it('limits native requests to named capabilities and opaque handles', () => {
    expect(decodeDesktopRequest({ operation: 'files.open' })).toEqual({ operation: 'files.open' })
    for (const request of [
      { operation: 'shell.exec', command: 'whoami' },
      { operation: 'files.open', path: '/etc/passwd' },
      { operation: 'files.readText', handle: '../../secret' },
      { operation: 'files.writeText', handle: 'a'.repeat(36), text: 'x'.repeat(2_000_001) },
      { operation: 'files.saveText', text: 'ok', name: '../startup.js' }
    ])
      expect(() => decodeDesktopRequest(request)).toThrow()
  })
  it('clamps native child views to the owning window and rejects nonfinite geometry', () => {
    expect(
      surfaceBounds({ x: 900, y: 500, width: 400, height: 300 }, { width: 1000, height: 600 })
    ).toEqual({ x: 900, y: 500, width: 100, height: 100 })
    expect(
      surfaceBounds({ x: 2000, y: 0, width: 400, height: 300 }, { width: 1000, height: 600 })
    ).toBeNull()
    expect(() =>
      surfaceBounds({ x: NaN, y: 0, width: 400, height: 300 }, { width: 1000, height: 600 })
    ).toThrow()
  })
  it('rejects oversized source and invalid surface identities', () => {
    expect(() => validateSurfaceInput({ id: 'forged' } as never)).toThrow()
  })
})
