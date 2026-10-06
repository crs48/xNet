import { access } from 'node:fs/promises'
import { beforeEach, expect, it, vi } from 'vitest'
import { LibraryHelperError, LibraryHelperProbeError, verifyHelperVersion } from './managed-helper'
import { findExtractor } from './providers'

vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  access: vi.fn()
}))
vi.mock('./managed-helper', async (original) => ({
  ...(await original<typeof import('./managed-helper')>()),
  verifyHelperVersion: vi.fn()
}))
beforeEach(() => {
  vi.mocked(access).mockReset().mockResolvedValue(undefined)
  vi.mocked(verifyHelperVersion).mockReset()
})
it('retries an installed helper whose version probe returned no output', async () => {
  vi.mocked(verifyHelperVersion).mockRejectedValue(new LibraryHelperProbeError('Empty probe'))
  await expect(findExtractor()).rejects.toMatchObject({
    disposition: 'retry',
    message: 'Empty probe'
  })
})
it('uses a verified fallback after an empty version probe', async () => {
  vi.mocked(verifyHelperVersion)
    .mockRejectedValueOnce(new LibraryHelperProbeError('Empty probe'))
    .mockResolvedValueOnce(undefined)
  await expect(findExtractor()).resolves.toBe('/opt/homebrew/bin/yt-dlp')
})
it('still blocks installed helpers with a different version', async () => {
  vi.mocked(verifyHelperVersion).mockRejectedValue(new LibraryHelperError('Wrong version'))
  await expect(findExtractor()).rejects.toMatchObject({ disposition: 'blocked' })
})
it('still blocks when no helper is installed', async () => {
  vi.mocked(access).mockRejectedValue(Object.assign(new Error('Missing'), { code: 'ENOENT' }))
  await expect(findExtractor()).rejects.toMatchObject({ disposition: 'blocked' })
  expect(verifyHelperVersion).not.toHaveBeenCalled()
})
