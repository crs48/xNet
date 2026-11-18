import type { ExtensionMutationResult } from './extension-broker'
import type { ExtensionDataset } from './extension-data'
import type { ExtensionGuestPort, ExtensionFile } from './extension-desktop-contract'
import type { ExtensionQueryResult } from './extension-queries'
import type { RoomEvent, RoomState, RoomValue } from './extension-room-contract'
import { ChannelSchema, ChatMessageSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import { DataBridgeProvider, useQuery, useMutate } from '@xnetjs/react/queries'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as THREE from 'three'
import { createLiveExtensionBridge } from './extension-live-client'
import { decodeExtensionFailure } from './extension-protocol'

const port = (window as unknown as { xnetExtensionGuest: ExtensionGuestPort }).xnetExtensionGuest
let live: ReturnType<typeof createLiveExtensionBridge> | undefined
let dataset: ExtensionDataset
let serial = 0
const pending = new Map<
  string,
  {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }
>()
const request = (type: 'request' | 'desktop' | 'document' | 'room', payload: unknown) =>
  new Promise<unknown>((resolve, reject) => {
    if (pending.size >= 20) {
      reject(new Error('Too many pending extension requests.'))
      return
    }
    const id = type === 'request' ? (payload as { id: string }).id : `dom-${++serial}`
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('The request timed out. Refresh before retrying an edit.'))
    }, 125_000)
    pending.set(id, { resolve, reject, timer })
    port.send(type === 'request' ? { type, request: payload } : { type, id, request: payload })
  })
let roomState: RoomState | null = null
const roomListeners = new Set<(event: RoomEvent) => void>()
const rooms = Object.freeze({
  host: () => request('room', { operation: 'host' }) as Promise<RoomState | null>,
  join: (invitation: string) =>
    request('room', { operation: 'join', invitation }) as Promise<RoomState | null>,
  leave: () => request('room', { operation: 'leave' }) as Promise<null>,
  current: () => roomState,
  send: (data: RoomValue) => {
    if (!roomState) throw new Error('Join a room before sending updates.')
    const message = JSON.stringify({ type: 'room-send', data })
    if (message.length > 1000) throw new Error('Send compact room updates under 1,000 bytes.')
    port.send(JSON.parse(message))
  },
  subscribe: (listener: (event: RoomEvent) => void) => {
    if (roomListeners.size >= 20) throw new Error('Too many room subscriptions.')
    roomListeners.add(listener)
    return () => {
      roomListeners.delete(listener)
    }
  }
})
const files = Object.freeze({
  open: () => request('desktop', { operation: 'files.open' }) as Promise<ExtensionFile | null>,
  readText: (file: ExtensionFile) =>
    request('desktop', { operation: 'files.readText', handle: file.id }) as Promise<string>,
  readDataURL: (file: ExtensionFile) =>
    request('desktop', { operation: 'files.readDataURL', handle: file.id }) as Promise<string>,
  writeText: (file: ExtensionFile, text: string) =>
    request('desktop', { operation: 'files.writeText', handle: file.id, text }),
  saveText: (text: string, name = 'extension.txt') =>
    request('desktop', { operation: 'files.saveText', text, name })
})
const saveDocument = (handle: string, revision: number, text: string) =>
  request('document', { handle, revision, text })
function useDocument(id: string) {
  if (!live) throw new Error('Data bridge unavailable.')
  return React.useSyncExternalStore(live.documents.subscribe, () => live!.documents.get(id))
}
function useDocumentIds() {
  if (!live) throw new Error('Data bridge unavailable.')
  return React.useSyncExternalStore(live.documents.subscribe, live.documents.ids)
}
function useHandle(handle: string) {
  if (!live) throw new Error('Data bridge unavailable.')
  return React.useSyncExternalStore(live.documents.subscribe, () => {
    const value = dataset.documents?.find((document) => document.handle === handle)
    if (!value) throw new Error('Document access is unavailable.')
    return value
  })
}
function DocumentView({ handle }: { handle: string }) {
  const document = useHandle(handle)
  return <div style={{ whiteSpace: 'pre-wrap' }}>{document.text}</div>
}
function DocumentEditor({ handle }: { handle: string }) {
  return <DocumentEditorSession key={handle} handle={handle} />
}
function DocumentEditorSession({ handle }: { handle: string }) {
  const document = useHandle(handle)
  const [draft, setDraft] = React.useState<{ text: string; revision: number } | null>(null)
  const [status, setStatus] = React.useState(''),
    [busy, setBusy] = React.useState(false)
  const save = async () => {
    if (!draft) return
    setBusy(true)
    try {
      await saveDocument(handle, draft.revision, draft.text)
      setDraft(null)
      setStatus('Saved on this device.')
    } catch (error) {
      setStatus(String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section>
      <strong>{document.title ?? 'Approved page'}</strong>
      {document.editable ? (
        <>
          <textarea
            aria-label="Page text"
            style={{ width: '100%', minHeight: 180 }}
            value={draft?.text ?? document.text}
            disabled={busy}
            maxLength={64000}
            onChange={(event) =>
              setDraft({ text: event.target.value, revision: draft?.revision ?? document.revision })
            }
          />
          <button disabled={!draft || busy || draft.revision !== document.revision} onClick={save}>
            Save page
          </button>
          <button disabled={busy} onClick={() => setDraft(null)}>
            Reload page text
          </button>
        </>
      ) : (
        <DocumentView handle={handle} />
      )}
      <p role="status">{status}</p>
    </section>
  )
}
const modules: Record<string, unknown> = {
  react: React,
  three: THREE,
  '@xnetjs/extensions/multiplayer': { rooms },
  'react/jsx-runtime': jsxRuntime,
  'react-dom': ReactDOM,
  'react-dom/client': ReactDOMClient,
  '@xnetjs/react': { useQuery, useMutate },
  '@xnetjs/react/queries': { useQuery, useMutate },
  '@xnetjs/extensions/react': { useQuery, useMutate, useDocument, useDocumentIds, saveDocument },
  '@xnetjs/extensions/desktop': { files },
  '@xnetjs/data': { ChannelSchema, ChatMessageSchema, TaskSchema, PageSchema },
  '@xnetjs/ui': {
    Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
    Badge: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />
  },
  '@xnetjs/extensions/ui': {
    Grid: ({ columns = 2, children }: React.PropsWithChildren<{ columns?: number }>) => (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(1, Math.min(24, columns))},minmax(0,1fr))`,
          gap: 8
        }}
      >
        {children}
      </div>
    ),
    Row: ({ children }: React.PropsWithChildren) => (
      <div style={{ display: 'flex', gap: 8 }}>{children}</div>
    ),
    DocumentView,
    DocumentEditor
  }
}
const fail = (error: unknown) =>
  port.send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
class Boundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error) {
    fail(error)
  }
  render() {
    return this.state.failed ? (
      <p role="alert">This extension encountered an error.</p>
    ) : (
      this.props.children
    )
  }
}
port.subscribe((raw: unknown) => {
  if ((raw as { type: string }).type === 'room-event') {
    const event = (raw as { event: RoomEvent }).event
    if (event.type === 'state') roomState = event.room
    for (const listener of roomListeners) {
      try {
        listener(event)
      } catch (error) {
        fail(error)
      }
    }
    return
  }
  const message = raw as {
    type: string
    id?: string
    error?: Parameters<typeof decodeExtensionFailure>[0]
    result?: unknown
    dataset: ExtensionDataset
    code: string
    channelId: string
  }
  try {
    if (message.type === 'ping') {
      port.send({ type: 'pong' })
      return
    }
    if (message.type === 'result') {
      const item = pending.get(message.id!)
      if (item) {
        clearTimeout(item.timer)
        pending.delete(message.id!)
        if (message.error) item.reject(decodeExtensionFailure(message.error))
        else item.resolve(message.result)
      }
      return
    }
    if (message.type === 'update') {
      dataset = message.dataset
      live?.update(dataset)
      return
    }
    if (message.type === 'invalidate') {
      live?.invalidate()
      return
    }
    if (message.type !== 'start' || live) throw new Error('Invalid extension handshake.')
    dataset = message.dataset
    live = createLiveExtensionBridge(
      dataset,
      (value) => request('request', value) as Promise<ExtensionMutationResult>,
      (value) => request('request', value) as Promise<ExtensionQueryResult>
    )
    const module: { exports: { default?: unknown } } = { exports: {} }
    new Function('require', 'module', 'exports', message.code)(
      (id: string) => {
        if (!Object.hasOwn(modules, id))
          throw new Error(
            `Dependency is not bundled: ${id}. Use browser APIs or the documented xNet imports.`
          )
        if (id === '@xnetjs/extensions/multiplayer') port.send({ type: 'room-intent' })
        return modules[id]
      },
      module,
      module.exports
    )
    if (typeof module.exports.default !== 'function')
      throw new Error('Export a default React component.')
    const Component = module.exports.default as React.ComponentType<{ channelId: string }>
    ReactDOM.flushSync(() =>
      ReactDOMClient.createRoot(document.getElementById('root')!).render(
        <Boundary>
          <DataBridgeProvider bridge={live!.bridge}>
            <Component channelId={message.channelId} />
          </DataBridgeProvider>
        </Boundary>
      )
    )
    port.send({ type: 'rendered' })
  } catch (error) {
    fail(error)
  }
})
window.addEventListener('error', (event) => fail(event.message))
window.addEventListener('unhandledrejection', (event) => fail(event.reason))
port.send({ type: 'ready' })
