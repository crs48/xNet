import { describe, expect, it } from 'vitest'
import { resolvePreviewAddress, validatePreviewUrl } from './chat-media-fetch'

describe('chat preview network boundary', () => {
  it('rejects local addresses, credentials and custom ports before connecting', () => {
    for (const url of [
      'http://127.1',
      'http://[::ffff:127.0.0.1]',
      'http://169.254.169.254/',
      'http://localhost.',
      'http://host.internal',
      'https://u:p@example.com',
      'https://example.com:8080',
      'file:///tmp/test'
    ])
      expect(() => validatePreviewUrl(url)).toThrow()
    expect(validatePreviewUrl('https://example.com/path').hostname).toBe('example.com')
  })
  it('rejects DNS names resolving to private addresses, including mixed answers', async () => {
    await expect(
      resolvePreviewAddress('public.example', async () => [{ address: '10.0.0.1', family: 4 }])
    ).rejects.toThrow()
    await expect(
      resolvePreviewAddress('public.example', async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '::1', family: 6 }
      ])
    ).rejects.toThrow()
    await expect(resolvePreviewAddress('public.example', async () => [])).rejects.toThrow()
  })
  it('returns a checked address for socket pinning and rejects multicast', async () => {
    expect(
      await resolvePreviewAddress('example.com', async () => [{ address: '8.8.8.8', family: 4 }])
    ).toEqual({ address: '8.8.8.8', family: 4 })
    await expect(resolvePreviewAddress('224.0.0.1')).rejects.toThrow()
    await expect(resolvePreviewAddress('[ff02::1]')).rejects.toThrow()
  })
})
