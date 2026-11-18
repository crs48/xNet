import type { ExtensionAccessIntent } from './extension-access-intent'
import type { ExtensionDataset } from './extension-data'
import type { ExtensionRequest } from './extension-protocol'
import runtimeSource from 'virtual:xnet-extension-runtime?raw'
import domRuntimeSource from 'virtual:xnet-extension-dom-runtime?raw'
import { desktopExtensionHost, startDesktopExtension } from './extension-desktop-host'
import { EXTENSION_SOURCE_LIMIT, EXTENSION_CODE_LIMIT } from './extension-desktop-contract'
import type { ExtensionCheckAction, ExtensionCheckObservation } from './extension-check-contract'
import { readPreviewTree, type ChatPreviewNode } from './agent-extension'
import { createExtensionDispatcher } from './extension-dispatcher'
import { assertExtensionMessage } from './extension-protocol'

/** Untrusted code runs only in a terminable worker inside an opaque-origin frame. */
export async function compileChatExtension(
  source: string,
  signal?: AbortSignal
): Promise<{ code: string; hash: string; access: ExtensionAccessIntent }> {
  signal?.throwIfAborted()
  if (source.length > EXTENSION_SOURCE_LIMIT)
    throw new Error('Source exceeds the 200,000-character preview limit.')
  const compiled = await new Promise<{ code: string; access: ExtensionAccessIntent }>(
    (resolve, reject) => {
      const worker = new Worker(new URL('./extension-compiler.worker.ts', import.meta.url), {
        type: 'module'
      })
      const finish = (result?: { code: string; access: ExtensionAccessIntent }, error?: Error) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', cancel)
        worker.terminate()
        if (error) reject(error)
        else if (result !== undefined) resolve(result)
      }
      const cancel = () => finish(undefined, new Error('TypeScript build stopped.'))
      const timer = setTimeout(() => {
        finish(undefined, new Error('TypeScript build exceeded ten seconds.'))
      }, 10000)
      signal?.addEventListener('abort', cancel, { once: true })
      worker.onmessage = ({
        data
      }: MessageEvent<{ code?: string; error?: string; access?: ExtensionAccessIntent }>) => {
        if (
          typeof data.code === 'string' &&
          data.code.length <= EXTENSION_CODE_LIMIT &&
          data.access
        )
          finish({ code: data.code, access: data.access })
        else finish(undefined, new Error(data.error ?? 'Compiler returned an invalid build.'))
      }
      worker.onerror = (event) => finish(undefined, new Error(event.message))
      worker.postMessage(source)
    }
  )
  const { code, access } = compiled
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      JSON.stringify({
        source,
        code,
        compiler: '@swc/wasm-web@1.15.41',
        runtime: desktopExtensionHost() ? domRuntimeSource : runtimeSource
      })
    )
  )
  return {
    code,
    access,
    hash: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
}
export interface ExtensionSession {
  mount?(element: HTMLElement | null): void
  observe?(): Promise<ExtensionCheckObservation>
  act?(action: ExtensionCheckAction): Promise<void>
  update(dataset: ExtensionDataset): void
  invalidate(): void
  event(id: string, event: 'click' | 'input', value?: string): void
  stop(): void
}
export function startChatExtension(
  code: string,
  dataset: ExtensionDataset,
  channelId: string,
  callbacks: {
    title?: string
    view: (tree: ChatPreviewNode) => void
    error: (error: Error) => void
    request: (input: unknown, signal: AbortSignal) => Promise<unknown>
    authorize?: (input: ExtensionRequest, signal: AbortSignal) => Promise<void>
    document?: (handle: string, revision: number, text: string) => Promise<void>
  },
  signal?: AbortSignal
): ExtensionSession {
  signal?.throwIfAborted()
  if (desktopExtensionHost())
    return startDesktopExtension(
      code,
      dataset,
      channelId,
      { ...callbacks, ready: () => callbacks.view({ type: 'stack', children: [] }) },
      signal
    )
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.setAttribute('aria-hidden', 'true')
  frame.hidden = true
  const channel = new MessageChannel()
  let stopped = false,
    started = false,
    revision = 0,
    pong = Date.now(),
    count = 0,
    windowStart = Date.now()
  let current = dataset
  const send = (message: unknown) => {
    if (!stopped && started) channel.port1.postMessage(message)
  }
  const dispatcher = createExtensionDispatcher(callbacks.request, send, callbacks.authorize)
  const stop = () => {
    if (stopped) return
    send({ type: 'stop' })
    stopped = true
    dispatcher.stop()
    clearInterval(heartbeat)
    signal?.removeEventListener('abort', stop)
    channel.port1.close()
    channel.port2.close()
    frame.remove()
  }
  const fail = (cause: unknown) => {
    stop()
    callbacks.error(cause instanceof Error ? cause : new Error(String(cause)))
  }
  const checkDataset = (value: ExtensionDataset) => {
    if (value.nodes.length > 500 || new TextEncoder().encode(JSON.stringify(value)).length > 256000)
      throw new Error('Extension data exceeds its limit.')
  }
  let wasHidden = document.visibilityState === 'hidden'
  const heartbeat = setInterval(() => {
    // Chromium throttles workers when an Electron window is occluded. A delayed
    // background heartbeat is not proof of a hung extension.
    const hidden = document.visibilityState === 'hidden'
    if (hidden || wasHidden) {
      pong = Date.now()
      wasHidden = hidden
      return
    }
    if (Date.now() - pong > 2500)
      fail(new Error('The extension stopped responding and was terminated.'))
    else send({ type: 'ping' })
  }, 500)
  signal?.addEventListener('abort', stop, { once: true })
  channel.port1.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (stopped) return
    try {
      if (Date.now() - windowStart > 1000) {
        count = 0
        windowStart = Date.now()
      }
      assertExtensionMessage(data)
      if (++count > 100 || !data || typeof data !== 'object')
        throw new Error('Malformed or excessive extension messages.')
      const value = data as Record<string, unknown>
      if (value.ready === true) {
        if (started) throw new Error('Duplicate extension handshake.')
        checkDataset(current)
        started = true
        send({ type: 'start', runtimeSource, code, dataset: current, channelId })
      } else if (value.type === 'pong') pong = Date.now()
      else if (value.type === 'view') {
        if (!Number.isSafeInteger(value.revision) || Number(value.revision) <= revision)
          throw new Error('Invalid view revision.')
        revision = Number(value.revision)
        callbacks.view(readPreviewTree(value.tree))
      } else if (value.type === 'request') {
        dispatcher.dispatch(value.request)
      } else if (value.type === 'error')
        throw new Error(
          typeof value.message === 'string' ? value.message.slice(0, 1000) : 'The extension failed.'
        )
      else throw new Error('Unknown extension message.')
    } catch (cause) {
      fail(cause)
    }
  }
  channel.port1.onmessageerror = () => fail(new Error('Invalid extension message.'))
  frame.onload = () =>
    frame.contentWindow?.postMessage('xnet-preview-connect', '*', [channel.port2])
  frame.src = new URL('./extension-preview-frame.html', import.meta.url).href
  document.body.append(frame)
  return {
    invalidate() {
      send({ type: 'invalidate' })
    },
    update(next) {
      try {
        checkDataset(next)
        current = next
        send({ type: 'update', dataset: next })
      } catch (cause) {
        fail(cause)
      }
    },
    event(id, event, value) {
      send({ type: 'event', id, event, value, revision })
    },
    stop
  }
}
