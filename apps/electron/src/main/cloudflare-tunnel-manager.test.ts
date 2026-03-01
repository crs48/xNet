import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildCloudflaredArgs,
  parseEndpointFromLogLine,
  resolveCloudflaredCommand
} from './cloudflare-tunnel-manager'

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

    it('rejects non-cloudflare hostnames', () => {
      const line = 'INF suspicious endpoint https://attacker.example.com'
      expect(parseEndpointFromLogLine(line)).toBeNull()
    })

    it('stays stable under noisy quick-tunnel logs', () => {
      const noisyLines: string[] = []
      for (let i = 0; i < 250; i++) {
        noisyLines.push(`ERR transient connection issue ${i}`)
        noisyLines.push(`INF fallback endpoint https://attacker${i}.example.com`)
      }
      noisyLines.push(
        'INF | Your quick Tunnel has been created! Visit it at https://stable.trycloudflare.com'
      )

      const parsed = noisyLines
        .map((line) => parseEndpointFromLogLine(line))
        .filter((value): value is string => typeof value === 'string')

      expect(parsed.at(-1)).toBe('https://stable.trycloudflare.com')
      expect(parsed.some((endpoint) => endpoint.includes('attacker'))).toBe(false)
    })
  })

  describe('resolveCloudflaredCommand', () => {
    it('requires absolute path when sha pinning is enabled', () => {
      const resolved = resolveCloudflaredCommand({
        XNET_CLOUDFLARED_PATH: 'cloudflared',
        XNET_CLOUDFLARED_SHA256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      })

      expect(resolved.error).toBe('XNET_CLOUDFLARED_SHA256 requires absolute XNET_CLOUDFLARED_PATH')
    })

    it('accepts binary when sha256 pin matches', () => {
      const fixtureDir = mkdtempSync(join(tmpdir(), 'xnet-cloudflared-test-'))
      const binaryPath = join(fixtureDir, 'cloudflared')
      try {
        writeFileSync(binaryPath, 'cloudflared-fixture', 'utf8')
        const digest = createHash('sha256').update('cloudflared-fixture').digest('hex')
        const resolved = resolveCloudflaredCommand({
          XNET_CLOUDFLARED_PATH: binaryPath,
          XNET_CLOUDFLARED_SHA256: digest
        })
        expect(resolved.error).toBeUndefined()
        expect(resolved.command).toBe(binaryPath)
      } finally {
        rmSync(fixtureDir, { recursive: true, force: true })
      }
    })
  })
})
