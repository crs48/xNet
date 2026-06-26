import { describe, expect, it } from 'vitest'
import { SsrfError, assertPublicUrl, validateExternalUrl } from './ssrf'

describe('assertPublicUrl', () => {
  const allowed = [
    'https://discord.com/api/webhooks/1/abc',
    'http://example.com/path',
    'https://8.8.8.8/resolve',
    // hostnames that merely *start* like a blocked range must not false-positive
    'https://fd-startup.com/x',
    'https://fe80-labs.com/x',
    'https://127.example.com/x'
  ]
  it.each(allowed)('allows public URL %s', (url) => {
    expect(() => assertPublicUrl(url)).not.toThrow()
  })

  // The bypass-vector table — each must be rejected. Several of these slipped
  // past the previous regex-based hub guard.
  const blocked = [
    'ftp://example.com/x', // non-http(s) scheme
    'http://localhost/x',
    'http://localhost./x', // trailing-dot FQDN root
    'http://box.local/x',
    'http://svc.internal/x',
    'http://metadata.google.internal/x',
    'http://127.0.0.1/x',
    'http://127.1/x', // short-form loopback — IPv4 int parse, missed by /^127\./
    'http://10.0.0.5/x',
    'http://172.16.0.1/x',
    'http://192.168.1.1/x',
    'http://169.254.169.254/latest/meta-data', // cloud metadata
    'http://100.64.0.1/x', // carrier-grade NAT — missed by the old regex
    'http://0.0.0.0/x',
    'http://[::1]/x',
    'http://[::ffff:127.0.0.1]/x', // IPv4-mapped IPv6 smuggling loopback
    'http://[64:ff9b::7f00:1]/x', // NAT64
    'http://[fc00::1]/x',
    'http://[fd12:3456::1]/x',
    'http://[fe80::1]/x',
    'http://[fe81::1]/x' // link-local /10 — missed by /^fe80:/
  ]
  it.each(blocked)('blocks non-public URL %s', (url) => {
    expect(() => assertPublicUrl(url)).toThrow(SsrfError)
  })

  it('throws SsrfError carrying the offending url', () => {
    try {
      assertPublicUrl('http://169.254.169.254/')
      throw new Error('expected to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(SsrfError)
      expect((error as SsrfError).url).toBe('http://169.254.169.254/')
    }
  })
})

describe('validateExternalUrl', () => {
  it('returns valid for a public URL', () => {
    expect(validateExternalUrl('https://example.com')).toEqual({ valid: true })
  })

  it('returns an error for a blocked URL', () => {
    const result = validateExternalUrl('http://169.254.169.254/')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns an error for an unparseable URL', () => {
    expect(validateExternalUrl('not a url').valid).toBe(false)
  })
})
