import { identityFromPrivateKey } from '@xnetjs/identity'
import { ipcMain, safeStorage } from 'electron'
import { sendDataProcessRequest } from './data-process-manager'
import { getOrCreateIdentitySeed } from './identity-seed'
import { dataPath, profile } from './profile'

export async function configureLibrary(): Promise<void> {
  const { seed } = getOrCreateIdentitySeed(dataPath, safeStorage, {
    profile,
    testMode: process.env.XNET_TEST_BYPASS === 'true'
  })
  try {
    await sendDataProcessRequest('library:configure', {
      authorDID: identityFromPrivateKey(seed).did,
      signingKey: Array.from(seed)
    })
  } finally {
    seed.fill(0)
  }
}
export const freezeLibrary = () => sendDataProcessRequest('library:freeze', {}, 120_000)
export const thawLibrary = () => sendDataProcessRequest('library:thaw', {})
export const refreshLibrarySources = () =>
  sendDataProcessRequest('library:scan', {}, 10 * 60 * 1000)
export function setupLibraryIPC(): void {
  for (const action of ['status', 'search', 'get', 'scan', 'pause', 'resume', 'retry']) {
    ipcMain.handle(
      `xnet:library:${action}`,
      async (_event, payload: Record<string, unknown> = {}) => {
        const response = await sendDataProcessRequest(`library:${action}`, payload, 10 * 60 * 1000)
        return (response as { value: unknown }).value
      }
    )
  }
}
