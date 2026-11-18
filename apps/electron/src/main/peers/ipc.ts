import type { StoreOperation, PeerChatService } from './service'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { ipcMain, safeStorage } from 'electron'
import { getOrCreateIdentitySeed } from '../identity-seed'
import { dataPath, profile } from '../profile'
import { discoverBluesky } from './discovery'
import { decodeInvite } from './protocol'

let service: PeerChatService | undefined
let getService: (() => Promise<PeerChatService>) | undefined
let creating: Promise<PeerChatService> | undefined
let nextId = 0
const pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>()
export function setupPeerChat(getWindow: () => BrowserWindow | null): void {
  const guard = (event: IpcMainInvokeEvent) => {
    const window = getWindow()
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error('Peer chat is only available to the main application window.')
    if (process.env.XNET_RECOVERY_OFFLINE === 'true')
      throw new Error('Peer networking is disabled during recovery review.')
  }
  const apply = (operation: StoreOperation): Promise<void> =>
    new Promise((resolve, reject) => {
      const window = getWindow()
      if (!window || window.isDestroyed()) {
        reject(new Error('Open xNet to receive messages.'))
        return
      }
      const id = ++nextId
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('The local message database is not ready.'))
      }, 10000)
      pending.set(id, {
        resolve: () => {
          clearTimeout(timer)
          pending.delete(id)
          resolve()
        },
        reject: (error) => {
          clearTimeout(timer)
          pending.delete(id)
          reject(error)
        }
      })
      window.webContents.send('xnet:peers:store', { id, operation })
    })
  const get = async (): Promise<PeerChatService> => {
    if (service) return service
    creating ??= import('./service')
      .then(({ PeerChatService }) => {
        service = new PeerChatService({
          directory: dataPath,
          seed: getOrCreateIdentitySeed(dataPath, safeStorage, {
            profile,
            testMode: process.env.XNET_TEST_BYPASS === 'true'
          }).seed,
          relay: process.env.XNET_IROH_RELAY_URL ?? 'https://iroh.xnet.fyi/',
          changed: () => {
            const w = getWindow()
            if (w && !w.isDestroyed()) w.webContents.send('xnet:peers:changed')
          },
          apply
        })
        return service
      })
      .finally(() => {
        creating = undefined
      })
    return creating
  }
  getService = get
  ipcMain.handle('xnet:peers:store-response', (event, input: { id: number; error?: string }) => {
    guard(event)
    const request = pending.get(input.id)
    if (input.error) request?.reject(new Error(input.error))
    else request?.resolve()
  })
  for (const method of [
    'snapshot',
    'enable',
    'createInvite',
    'inspectInvite',
    'join',
    'approve',
    'block',
    'setDisplayName',
    'createGroup',
    'inviteToGroup',
    'createChatGroup',
    'addChannel',
    'setGroupAccess',
    'revokeLink',
    'joinPublic',
    'contactLink',
    'discover'
  ] as const) {
    ipcMain.handle(`xnet:peers:${method}`, async (event, input: unknown) => {
      guard(event)
      const peers = await get()
      if (method === 'snapshot') {
        void peers.resume().catch((error) => console.error('[peer-chat]', error))
        return peers.snapshot()
      }
      if (method === 'enable') return peers.enable()
      if (method === 'contactLink') return peers.contactLink()
      if (method === 'createChatGroup' || method === 'addChannel' || method === 'setGroupAccess') {
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          JSON.stringify(input).length > 500
        )
          throw new Error('Invalid group request.')
        if (method === 'createChatGroup')
          return peers.createChatGroup(input as Parameters<typeof peers.createChatGroup>[0])
        if (method === 'addChannel')
          return peers.addChannel(input as Parameters<typeof peers.addChannel>[0])
        return peers.setGroupAccess(input as Parameters<typeof peers.setGroupAccess>[0])
      }
      if (typeof input !== 'string' || input.length > 12000)
        throw new Error('Invalid peer request.')
      if (method === 'discover') return discoverBluesky(input)
      return peers[method](input)
    })
  }
}
export async function requestPeerConnection(link: string): Promise<'requesting' | 'approved'> {
  if (!getService) throw new Error('Peer chat is not ready.')
  const peers = await getService()
  await peers.join(link)
  const contact = peers
    .snapshot()
    .contacts.find(
      (entry) =>
        entry.invitationId === decodeInvite(link).channel ||
        entry.channel === decodeInvite(link).channel
    )
  if (contact?.status === 'viewing') return 'approved'
  if (contact?.status !== 'requesting' && contact?.status !== 'approved')
    throw new Error('The connection request was not saved. Please review it in Connect a friend.')
  return contact.status
}
export async function stopPeerChat(): Promise<void> {
  await service?.close()
  service = undefined
  for (const request of pending.values()) request.reject(new Error('Peer chat is closing.'))
}
