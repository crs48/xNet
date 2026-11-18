import type {
  ExtensionCheckAction,
  ExtensionCheckObservation
} from '../../../../packages/workbench/src/communities/extension-check-contract'
import type {
  ExtensionSurfaceInput,
  ExtensionSurfaceBounds
} from '../../../../packages/workbench/src/communities/extension-desktop-contract'
import type { RoomValue } from '../../../../packages/workbench/src/communities/extension-room-contract'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, WebContentsView, dialog, ipcMain, protocol, session } from 'electron'
import runtimeSource from 'virtual:xnet-extension-dom-runtime?raw'
import { createExtensionFiles } from './extension-files'
import { decodeRoomRequest } from './extension-room-policy'
import { createExtensionRooms } from './extension-rooms'
import {
  allowedSurfaceResource,
  decodeDesktopRequest,
  extensionCsp,
  surfaceBounds,
  validateSurfaceInput
} from './extension-surface-policy'
import { workspaceWindows } from './workspace-windows'

protocol.registerSchemesAsPrivileged([
  { scheme: 'xnet-extension', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])
const tests = new Set<number>()
const surfaces = new Map<string, ReturnType<typeof makeSurface>>()
const inspections = new Map<
  string,
  {
    guest: number
    resolve: (value: ExtensionCheckObservation) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }
>()
const owner = (event: IpcMainEvent | IpcMainInvokeEvent) => {
  if (event.senderFrame !== event.sender.mainFrame)
    throw new Error('Only the workspace main frame can manage extensions.')
  const window =
    workspaceWindows().find((window) => window.webContents.id === event.sender.id) ??
    (tests.has(event.sender.id) ? BrowserWindow.fromWebContents(event.sender) : null)
  if (!window) throw new Error('Untrusted extension owner.')
  return window
}
const owned = (event: IpcMainEvent | IpcMainInvokeEvent, id: string) => {
  owner(event)
  const surface = surfaces.get(id)
  if (!surface || surface.owner.webContents.id !== event.sender.id)
    throw new Error('This extension belongs to another session.')
  return surface
}
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{color-scheme:light;font:14px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#24262c;background:#fff}*{box-sizing:border-box}body{margin:0;padding:16px}button,input,select,textarea{font:inherit}button{padding:8px 12px;border:1px solid #dddfe5;border-radius:10px;background:#fff;color:inherit;cursor:pointer;box-shadow:0 1px 3px #0000000a}button:disabled{cursor:default;opacity:.6}input,textarea,select{padding:8px;border:1px solid #dddfe5;border-radius:8px;color:inherit;background:white}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid #53657e;outline-offset:2px}img,video,canvas,svg{max-width:100%}.aspect-square{aspect-ratio:1}.grid{display:grid}.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.flex{display:flex}.flex-row{flex-direction:row}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
</style></head><body><div id="root"></div><script src="./runtime.js"></script></body></html>`
function makeSurface(window: BrowserWindow, input: ExtensionSurfaceInput, test: boolean) {
  const origin = `xnet-extension://${randomUUID()}`
  const privateSession = session.fromPartition(`extension-${randomUUID()}`, { cache: false })
  const view = new WebContentsView({
    webPreferences: {
      session: privateSession,
      preload: join(dirname(fileURLToPath(import.meta.url)), '../preload/extension-guest.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      webviewTag: false,
      disableDialogs: true,
      navigateOnDragDrop: false,
      enableWebSQL: false,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      spellcheck: false,
      devTools: false
    }
  })
  const ownerContents = window.webContents
  const guestId = view.webContents.id
  let active = true,
    ready = false,
    pendingNative = false,
    lastGesture = 0,
    pong = Date.now(),
    messages = 0,
    epoch = Date.now()
  const errors: string[] = []
  let requiresData = false
  let requiresNetwork = input.code.includes('@xnetjs/extensions/multiplayer')
  const emit = (message: unknown) => {
    if (active && !window.isDestroyed())
      window.webContents.send('xnet:extension:event', { id: input.id, message })
  }
  const send = (message: unknown) => {
    if (active && !view.webContents.isDestroyed())
      view.webContents.send('xnet:extension:message', message)
  }
  const checkGesture = () => {
    if (test || Date.now() - lastGesture > 2000)
      throw new Error('Use an extension control to request access.')
    lastGesture = 0
  }
  const files = createExtensionFiles({
    active: () => active,
    choose: async () => {
      checkGesture()
      const result = await dialog.showOpenDialog(window, {
        title: 'Allow this extension to read a file',
        message: `${input.title} can read only the file you choose. Access ends when this preview closes.`,
        properties: ['openFile']
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    save: async (name) => {
      checkGesture()
      const result = await dialog.showSaveDialog(window, {
        title: 'Export a file from this extension',
        message: `${input.title} will write to the location you choose.`,
        defaultPath: name
      })
      return result.canceled ? null : (result.filePath ?? null)
    },
    confirmWrite: async (name) => {
      checkGesture()
      const result = await dialog.showMessageBox(window, {
        type: 'question',
        title: 'Allow file editing?',
        message: `Allow “${input.title}” to edit “${name}”?`,
        detail:
          'Only this chosen file can be changed. Access ends when this preview closes. You can stop the extension at any time.',
        buttons: ['Don’t allow', 'Allow editing'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
      return result.response === 1
    }
  })
  const rooms = createExtensionRooms({
    application: createHash('sha256').update(input.code).digest('hex'),
    active: () => active,
    emit: (event) => send({ type: 'room-event', event }),
    confirm: async (role) => {
      checkGesture()
      const result = await dialog.showMessageBox(window, {
        type: 'question',
        title: 'Allow multiplayer?',
        message: `Allow “${input.title}” to ${role === 'host' ? 'host' : 'join'} a multiplayer room?`,
        detail:
          'Up to four players can exchange live updates. Anyone with the invitation and this extension version can join. This extension can share any data you have already allowed it to read. Peers can learn your network address; public Iroh relays may carry encrypted traffic. Access ends when you leave or close this preview, after at most one hour.',
        buttons: ['Don’t allow', 'Allow multiplayer'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
      return result.response === 1
    }
  })
  const close = () => {
    if (!active) return
    active = false
    clearInterval(heartbeat)
    surfaces.delete(input.id)
    window.removeListener('closed', close)
    ownerContents.removeListener('did-start-navigation', ownerNavigated)
    for (const [id, inspection] of inspections)
      if (inspection.guest === guestId) {
        clearTimeout(inspection.timer)
        inspection.reject(new Error('Extension stopped.'))
        inspections.delete(id)
      }
    if (!window.isDestroyed()) window.contentView.removeChildView(view)
    if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false })
    void rooms.close().catch((error) => console.error('[extension] Room cleanup failed', error))
    void files.close().catch((error) => console.error('[extension] File cleanup failed', error))
    void privateSession
      .clearStorageData()
      .catch((error) => console.error('[extension] Storage cleanup failed', error))
  }
  const fail = (message: string) => {
    emit({ type: 'error', message })
    close()
  }
  const ownerNavigated = (
    _event: unknown,
    _url: string,
    _inPlace: boolean,
    isMainFrame: boolean
  ) => {
    if (isMainFrame) close()
  }
  const heartbeat = setInterval(() => {
    // macOS pauses the child renderer while a native permission sheet is open.
    // Waiting for the user is not a hung extension.
    if (pendingNative) pong = Date.now()
    else if (Date.now() - pong > 5000) fail('This extension stopped responding and was closed.')
    else send({ type: 'ping' })
  }, 1000)
  window.once('closed', close)
  window.webContents.on('did-start-navigation', ownerNavigated)
  privateSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  privateSession.setPermissionCheckHandler(() => false)
  privateSession.setDevicePermissionHandler(() => false)
  privateSession.setDisplayMediaRequestHandler((_request, callback) => callback({}))
  view.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
  privateSession.on('will-download', (event) => event.preventDefault())
  privateSession.webRequest.onBeforeRequest((request, callback) =>
    callback({ cancel: !allowedSurfaceResource(request.url, origin) })
  )
  privateSession.protocol.handle('xnet-extension', (request) => {
    if (!allowedSurfaceResource(request.url, origin)) return new Response('Denied', { status: 403 })
    return new Response(request.url.endsWith('/runtime.js') ? runtimeSource : html, {
      headers: {
        'Content-Type': request.url.endsWith('/runtime.js') ? 'text/javascript' : 'text/html',
        'Content-Security-Policy': extensionCsp,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      }
    })
  })
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  view.webContents.on('will-navigate', (event) => event.preventDefault())
  view.webContents.on('will-frame-navigate', (event) => event.preventDefault())
  view.webContents.on('will-redirect', (event) => event.preventDefault())
  view.webContents.on('will-attach-webview', (event) => event.preventDefault())
  view.webContents.on('render-process-gone', () =>
    fail('The extension renderer stopped. Reopen the preview to try again.')
  )
  window.contentView.addChildView(view)
  view.setVisible(false)
  return {
    owner: window,
    view,
    test,
    close,
    get active() {
      return active
    },
    async load() {
      // WebRTC is not covered by CSP. Force any proxy-capable traffic into a dead
      // local proxy as well as disabling non-proxied UDP and filtering URL loads.
      await privateSession.setProxy({
        mode: 'fixed_servers',
        proxyRules: 'http=127.0.0.1:9;https=127.0.0.1:9;socks=127.0.0.1:9',
        proxyBypassRules: '<-loopback>'
      })
      await view.webContents.loadURL(origin + '/index.html')
    },
    send,
    bounds(value: ExtensionSurfaceBounds | null) {
      const bounds = surfaceBounds(value, window.getContentBounds())
      view.setVisible(!!bounds)
      if (bounds) view.setBounds(bounds)
    },
    gesture() {
      lastGesture = Date.now()
    },
    async message(raw: unknown) {
      if (!active) return
      try {
        if (Date.now() - epoch >= 1000) {
          messages = 0
          epoch = Date.now()
        }
        if (
          ++messages > 120 ||
          !raw ||
          typeof raw !== 'object' ||
          JSON.stringify(raw).length > 2_100_000
        )
          throw new Error('Invalid or excessive extension messages.')
        const value = raw as { type: string; id: string; request: unknown; message: string }
        if (value.type === 'pong') {
          pong = Date.now()
          return
        }
        if (value.type === 'ready') {
          if (ready) throw new Error('Duplicate extension handshake.')
          ready = true
          send({
            type: 'start',
            code: input.code,
            dataset: input.dataset,
            channelId: input.channelId
          })
          return
        }
        if (value.type === 'rendered') {
          emit(value)
          return
        }
        if (value.type === 'error') {
          errors.push(String(value.message).slice(0, 1000))
          emit(value)
          return
        }
        if (value.type === 'room-intent') {
          requiresNetwork = true
          return
        }
        if (value.type === 'room-send') {
          requiresNetwork = true
          if (test) {
            send({
              type: 'room-event',
              event: { type: 'error', message: 'Multiplayer is unavailable in the test copy.' }
            })
            return
          }
          try {
            rooms.send((raw as { data: RoomValue }).data)
          } catch (error) {
            send({
              type: 'room-event',
              event: {
                type: 'error',
                message: error instanceof Error ? error.message : 'Room update failed.'
              }
            })
          }
          return
        }
        if (value.type === 'desktop' || value.type === 'room') {
          if (typeof value.id !== 'string' || !/^dom-\d+$/.test(value.id))
            throw new Error('Invalid request identifier.')
          try {
            if (test) {
              requiresData = true
              throw new Error('Desktop access is unavailable in the test copy.')
            }
            if (pendingNative) throw new Error('Another permission request is in progress.')
            pendingNative = true
            try {
              const result =
                value.type === 'room'
                  ? await rooms.request(decodeRoomRequest(value.request))
                  : await files.request(decodeDesktopRequest(value.request))
              send({ type: 'result', id: value.id, result })
            } finally {
              pendingNative = false
              pong = Date.now()
            }
          } catch (error) {
            send({
              type: 'result',
              id: value.id,
              error: {
                version: 1,
                _tag: 'ExtensionAccessError',
                code:
                  error &&
                  typeof error === 'object' &&
                  'code' in error &&
                  error.code === 'unavailable'
                    ? 'unavailable'
                    : 'denied',
                message:
                  error &&
                  typeof error === 'object' &&
                  'code' in error &&
                  /^[A-Z]/.test(String(error.code))
                    ? 'The chosen file is unavailable. Choose it again.'
                    : error instanceof Error
                      ? error.message.slice(0, 300)
                      : String(error)
              }
            })
          }
          return
        }
        if (value.type === 'request' || value.type === 'document') {
          requiresData = true
          emit(value)
          return
        }
        throw new Error('Unsupported extension message.')
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    },
    async inspect(action?: ExtensionCheckAction): Promise<ExtensionCheckObservation> {
      if (!test) throw new Error('Automated controls are available only in a disposable test copy.')
      const id = randomUUID()
      const result = await new Promise<ExtensionCheckObservation>((resolve, reject) => {
        const timer = setTimeout(() => {
          inspections.delete(id)
          reject(new Error('The extension inspection timed out.'))
        }, 3000)
        inspections.set(id, { guest: view.webContents.id, resolve, reject, timer })
        view.webContents.send('xnet:extension:inspect', { id, action })
      })
      return { ...result, requiresData, requiresNetwork, errors: [...errors] }
    }
  }
}
export function registerExtensionTestOwner(window: BrowserWindow) {
  const id = window.webContents.id
  tests.add(id)
  window.once('closed', () => tests.delete(id))
}
export async function captureExtensionTest(window: BrowserWindow) {
  const surface = [...surfaces.values()].find((surface) => surface.test && surface.owner === window)
  if (!surface) throw new Error('The test surface is unavailable.')
  return surface.view.webContents.capturePage()
}
export function setupExtensionSurfaceIPC() {
  ipcMain.handle('xnet:extension:open', async (event, input: ExtensionSurfaceInput) => {
    const window = owner(event)
    validateSurfaceInput(input)
    if (
      surfaces.has(input.id) ||
      [...surfaces.values()].filter((surface) => surface.owner === window).length >= 3
    )
      throw new Error('Too many extension surfaces.')
    const surface = makeSurface(window, input, tests.has(event.sender.id))
    surfaces.set(input.id, surface)
    try {
      await surface.load()
    } catch (error) {
      surface.close()
      throw error
    }
  })
  ipcMain.on('xnet:extension:send', (event, id: string, message: unknown) => {
    try {
      const surface = owned(event, id)
      if (!message || typeof message !== 'object' || JSON.stringify(message).length > 512_000)
        throw new Error('Invalid host response.')
      surface.send(message)
    } catch (error) {
      console.warn('[extension]', String(error))
    }
  })
  ipcMain.on(
    'xnet:extension:bounds',
    (event, id: string, bounds: ExtensionSurfaceBounds | null) => {
      try {
        owned(event, id).bounds(bounds)
      } catch (error) {
        console.warn('[extension]', String(error))
      }
    }
  )
  ipcMain.on('xnet:extension:close', (event, id: string) => {
    try {
      owned(event, id).close()
    } catch (error) {
      console.warn('[extension]', String(error))
    }
  })
  ipcMain.handle('xnet:extension:observe', (event, id: string) => owned(event, id).inspect())
  ipcMain.handle('xnet:extension:act', async (event, id: string, action: ExtensionCheckAction) => {
    if (
      !action ||
      !['click', 'input'].includes(action.type) ||
      !/^element-\d+$/.test(action.target ?? '') ||
      (action.value !== null && (typeof action.value !== 'string' || action.value.length > 2000))
    )
      throw new Error('Invalid test action.')
    await owned(event, id).inspect(action)
  })
  ipcMain.on('xnet:extension:guest', (event, message: unknown) => {
    const surface = [...surfaces.values()].find(
      (surface) => surface.view.webContents.id === event.sender.id
    )
    if (surface && event.senderFrame === event.sender.mainFrame) void surface.message(message)
  })
  ipcMain.on('xnet:extension:gesture', (event) => {
    const surface = [...surfaces.values()].find(
      (surface) => surface.view.webContents.id === event.sender.id
    )
    if (surface && event.senderFrame === event.sender.mainFrame) surface.gesture()
  })
  ipcMain.on(
    'xnet:extension:inspection',
    (event, value: { id: string; error?: string; result: ExtensionCheckObservation }) => {
      const pending = inspections.get(value?.id)
      if (
        !pending ||
        pending.guest !== event.sender.id ||
        event.senderFrame !== event.sender.mainFrame
      )
        return
      clearTimeout(pending.timer)
      inspections.delete(value.id)
      if (value.error) pending.reject(new Error(value.error))
      else pending.resolve(value.result)
    }
  )
}
