import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain, safeStorage, shell } from 'electron'
import { getOrCreateIdentitySeed } from '../identity-seed'
import { requestPeerConnection } from '../peers/ipc'
import { decodeInvite } from '../peers/protocol'
import { dataPath, profile } from '../profile'
import { DesktopBlueskySignIn } from './bluesky'
import { OnboardingStore } from './store'

let store: OnboardingStore | undefined
const earlyLinks: string[] = []
let notify = () => {}
let signIn: DesktopBlueskySignIn | undefined
const requests = new Map<string, Promise<'requesting' | 'approved'>>()

export function initializeDesktopOnboarding(onError: (error: unknown) => void): void {
  store = new OnboardingStore(
    dataPath,
    {
      isEncryptionAvailable: () =>
        safeStorage.isEncryptionAvailable() &&
        (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
      encryptString: (value) => safeStorage.encryptString(value),
      decryptString: (value) => safeStorage.decryptString(value)
    },
    ['data.db', 'xnet.db'].some((name) => existsSync(join(dataPath, name)))
  )
  for (const link of earlyLinks.splice(0)) {
    try {
      store.saveInvitation(link)
    } catch (error) {
      onError(error)
    }
  }
}
export function receiveDesktopInvitation(link: string): void {
  decodeInvite(link)
  if (store) {
    store.saveInvitation(link)
    notify()
  } else {
    // macOS may deliver open-url before the key store is usable at app.ready.
    if (earlyLinks.includes(link)) return
    if (earlyLinks.length >= 8) throw new Error('Open xNet to review your saved invitations first.')
    earlyLinks.push(link)
  }
}
export function setupDesktopOnboarding(getWindow: () => BrowserWindow | null): void {
  const current = () => {
    if (!store) throw new Error('Desktop setup is not ready.')
    return store
  }
  const guard = (event: IpcMainInvokeEvent) => {
    const window = getWindow()
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error('Desktop setup is only available to the main application window.')
    if (process.env.XNET_RECOVERY_OFFLINE === 'true')
      throw new Error(
        'Finish recovery review before changing desktop setup or joining a conversation.'
      )
  }
  notify = () => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send('xnet:onboarding:changed')
  }
  signIn = new DesktopBlueskySignIn({
    development: !app.isPackaged,
    openExternal: (url) => shell.openExternal(url),
    linked: (identity) => {
      current().linkIdentity(identity)
      notify()
      getWindow()?.focus()
    },
    changed: () => notify()
  })
  ipcMain.handle('xnet:onboarding:signInBluesky', async (event, handle: unknown) => {
    guard(event)
    await signIn!.start(handle)
  })
  ipcMain.handle('xnet:onboarding:cancelSignIn', (event) => {
    guard(event)
    signIn!.cancel()
  })
  ipcMain.handle('xnet:onboarding:unlinkBluesky', (event) => {
    guard(event)
    signIn!.cancel()
    current().unlinkIdentity()
    notify()
  })
  ipcMain.handle('xnet:onboarding:snapshot', (event) => {
    // Recovery settings must remain reachable even when network actions are paused.
    const window = getWindow()
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error('Desktop setup is only available to the main application window.')
    const { mode } = getOrCreateIdentitySeed(dataPath, safeStorage, {
      profile,
      testMode: process.env.XNET_TEST_BYPASS === 'true'
    })
    const identityStorage =
      mode === 'secure' &&
      process.platform === 'linux' &&
      safeStorage.getSelectedStorageBackend() === 'basic_text'
        ? 'plaintext'
        : mode
    return { ...current().snapshot(), identityStorage, signIn: signIn!.snapshot() }
  })
  ipcMain.handle('xnet:onboarding:complete', (event) => {
    guard(event)
    current().complete()
    notify()
  })
  ipcMain.handle('xnet:onboarding:saveInvitation', (event, link: unknown) => {
    guard(event)
    if (typeof link !== 'string') throw new Error('Paste an xNet invitation link.')
    receiveDesktopInvitation(link)
  })
  ipcMain.handle('xnet:onboarding:dismissInvitation', (event, id: unknown) => {
    guard(event)
    if (typeof id !== 'string') throw new Error('Invalid invitation.')
    current().dismissInvitation(id)
    notify()
  })
  ipcMain.handle('xnet:onboarding:requestConnection', (event, id: unknown) => {
    guard(event)
    if (typeof id !== 'string') throw new Error('Invalid invitation.')
    if (!current().snapshot().complete) throw new Error('Choose your profile name first.')
    const inFlight = requests.get(id)
    if (inFlight) return inFlight
    const request = requestPeerConnection(current().invitation(id))
      .then((status) => {
        current().dismissInvitation(id)
        notify()
        return status
      })
      .finally(() => requests.delete(id))
    requests.set(id, request)
    return request
  })
}
export function stopDesktopSignIn(): void {
  signIn?.cancel()
}

export async function receiveDesktopSignInCallback(url: string): Promise<void> {
  if (!signIn)
    throw new Error('Open xNet and start Bluesky sign-in again. Your invitation is still saved.')
  await signIn.receiveCallback(url)
}
