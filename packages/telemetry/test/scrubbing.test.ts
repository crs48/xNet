import { describe, it, expect } from 'vitest'
import { scrubTelemetryData } from '../src/collection/scrubbing'

describe('scrubTelemetryData', () => {
  describe('paths', () => {
    it('scrubs macOS paths', () => {
      const result = scrubTelemetryData({
        message: 'Error at /Users/john/projects/xnet/file.ts'
      })
      expect(result.message).toContain('/Users/[USER]')
      expect(result.message).not.toContain('john')
    })

    it('scrubs Linux paths', () => {
      const result = scrubTelemetryData({
        message: 'Error at /home/alice/.config/xnet'
      })
      expect(result.message).toContain('/home/[USER]')
      expect(result.message).not.toContain('alice')
    })

    it('scrubs Windows paths', () => {
      const result = scrubTelemetryData({
        message: 'Error at C:\\Users\\bob\\Documents\\xnet'
      })
      expect(result.message).toContain('C:\\Users\\[USER]')
      expect(result.message).not.toContain('bob')
    })
  })

  describe('emails', () => {
    it('scrubs email addresses', () => {
      const result = scrubTelemetryData({
        details: 'Contact user@example.com for support'
      })
      expect(result.details).toContain('[EMAIL]')
      expect(result.details).not.toContain('user@example.com')
    })
  })

  describe('IPs', () => {
    it('scrubs IPv4 addresses', () => {
      const result = scrubTelemetryData({
        peer: 'Connected from 192.168.1.42'
      })
      expect(result.peer).toContain('[IP]')
      expect(result.peer).not.toContain('192.168.1.42')
    })

    it('scrubs IPv6 addresses', () => {
      const result = scrubTelemetryData({
        peer: 'Address: 2001:0db8:85a3:0000:0000:8a2e:0370:7334'
      })
      expect(result.peer).toContain('[IP]')
      expect(result.peer).not.toContain('2001:0db8')
    })
  })

  describe('URL params', () => {
    it('scrubs URL query parameters', () => {
      const result = scrubTelemetryData({
        url: 'https://example.com/page?token=abc123&user=john'
      })
      expect(result.url).toContain('?[PARAMS]')
      expect(result.url).not.toContain('abc123')
    })
  })

  describe('tokens and UUIDs', () => {
    it('scrubs UUIDs', () => {
      const result = scrubTelemetryData({
        id: 'Node: 550e8400-e29b-41d4-a716-446655440000'
      })
      expect(result.id).toContain('[UUID]')
      expect(result.id).not.toContain('550e8400')
    })

    it('scrubs DIDs', () => {
      const result = scrubTelemetryData({
        peer: 'Peer: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
      })
      expect(result.peer).toContain('did:method:[REDACTED]')
      expect(result.peer).not.toContain('z6Mkha')
    })

    it('scrubs long tokens', () => {
      const longToken = 'a'.repeat(40)
      const result = scrubTelemetryData({
        auth: `Bearer ${longToken}`
      })
      expect(result.auth).toContain('[TOKEN]')
      expect(result.auth).not.toContain(longToken)
    })
  })

  describe('nested objects', () => {
    it('recursively scrubs nested objects', () => {
      const result = scrubTelemetryData({
        error: {
          message: 'Failed at /Users/dev/app.ts',
          context: {
            email: 'dev@company.com'
          }
        }
      })
      expect((result.error as Record<string, unknown>).message).toContain('/Users/[USER]')
      expect(
        ((result.error as Record<string, unknown>).context as Record<string, unknown>).email
      ).toContain('[EMAIL]')
    })

    it('recursively scrubs arrays', () => {
      const result = scrubTelemetryData({
        peers: ['192.168.1.1', '10.0.0.2']
      })
      const peers = result.peers as string[]
      expect(peers[0]).toBe('[IP]')
      expect(peers[1]).toBe('[IP]')
    })
  })

  describe('custom patterns', () => {
    it('applies custom regex patterns', () => {
      const result = scrubTelemetryData(
        { secret: 'API_KEY=mysecretkey123' },
        { scrubCustom: [/API_KEY=\S+/g], customReplacement: '[API_KEY]' }
      )
      expect(result.secret).toBe('[API_KEY]')
    })
  })

  describe('options', () => {
    it('can disable path scrubbing', () => {
      const result = scrubTelemetryData({ path: '/Users/john/file.ts' }, { scrubPaths: false })
      expect(result.path).toContain('john')
    })

    it('preserves non-string values', () => {
      const result = scrubTelemetryData({
        count: 42,
        active: true,
        empty: null
      })
      expect(result.count).toBe(42)
      expect(result.active).toBe(true)
      expect(result.empty).toBeNull()
    })
  })
})
