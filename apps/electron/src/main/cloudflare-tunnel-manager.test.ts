import { describe, expect, it } from 'vitest'
import { buildCloudflaredArgs, parseEndpointFromLogLine } from './cloudflare-tunnel-manager'

describe('cloudflare-tunnel-manager', () => {
  describe('buildCloudflaredArgs', () => {
    it('builds args for temporary quick tunnel', () => {
      const args = buildCloudflaredArgs({ mode: 'temporary', targetUrl: 'http://127.0.0.1:4444' })
      expect(args).toEqual(['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:4444'])
    })

    it('builds args for persistent token mode', () => {
      const args = buildCloudflaredArgs({ mode: 'persistent', token: 'token-123' })
      expect(args).toEqual(['tunnel', '--no-autoupdate', 'run', '--token', 'token-123'])
    })

    it('requires persistent identity options', () => {
      expect(() => buildCloudflaredArgs({ mode: 'persistent' })).toThrow(
        'Persistent tunnel requires token, tunnelName, or hostname'
      )
    })
  })

  describe('parseEndpointFromLogLine', () => {
    it('extracts quick tunnel endpoint', () => {
      const line =
        'INF | Your quick Tunnel has been created! Visit it at https://abc.trycloudflare.com'
      expect(parseEndpointFromLogLine(line)).toBe('https://abc.trycloudflare.com')
    })

    it('returns null when no endpoint exists', () => {
      expect(parseEndpointFromLogLine('INF starting cloudflared')).toBeNull()
    })
  })
})
