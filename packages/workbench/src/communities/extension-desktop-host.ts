import type { ExtensionDataset } from './extension-data'
import type { ExtensionDesktopHost } from './extension-desktop-contract'
import type { ExtensionRequest } from './extension-protocol'
import type { ExtensionSession } from './extension-sandbox'
import { createExtensionDispatcher } from './extension-dispatcher'
import { encodeExtensionFailure } from './extension-protocol'

export const desktopExtensionHost = () =>
  (window as unknown as { xnetExtensionHost?: ExtensionDesktopHost }).xnetExtensionHost
export function startDesktopExtension(
  code: string,
  dataset: ExtensionDataset,
  channelId: string,
  callbacks: {
    title?: string
    ready(): void
    error(error: Error): void
    request(input: unknown, signal: AbortSignal): Promise<unknown>
    authorize?: (input: ExtensionRequest, signal: AbortSignal) => Promise<void>
    document?: (handle: string, revision: number, text: string) => Promise<void>
  },
  signal?: AbortSignal
): ExtensionSession {
  const host = desktopExtensionHost()!
  const id = crypto.randomUUID()
  let stopped = false,
    opened = false,
    current = dataset,
    element: HTMLElement | null = null
  let lastBounds = ''
  let documentBusy = false
  const send = (message: unknown) => {
    if (!stopped) host.send(id, message)
  }
  const dispatcher = createExtensionDispatcher(callbacks.request, send, callbacks.authorize)
  const updateBounds = () => {
    if (!opened || stopped) return
    if (!element) {
      if (lastBounds !== 'null') host.bounds(id, null)
      lastBounds = 'null'
      return
    }
    const rect = element.getBoundingClientRect()
    let top = Math.max(rect.top, 0),
      bottom = Math.min(rect.bottom, innerHeight),
      left = Math.max(rect.left, 0),
      right = Math.min(rect.right, innerWidth)
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)) {
        const box = parent.getBoundingClientRect()
        top = Math.max(top, box.top)
        bottom = Math.min(bottom, box.bottom)
      }
      if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowX)) {
        const box = parent.getBoundingClientRect()
        left = Math.max(left, box.left)
        right = Math.min(right, box.right)
      }
    }
    // Native child views sit above DOM. Hide them while trusted dialogs/popovers ask for access.
    const modal = [
      ...document.querySelectorAll('[role=dialog],[role=alertdialog],[role=menu]')
    ].some((node) => !node.contains(element) && node.getBoundingClientRect().height > 0)
    const visible =
      element.isConnected &&
      !modal &&
      bottom - top >= 80 &&
      right - left >= 80 &&
      getComputedStyle(element).visibility !== 'hidden'
    const bounds = visible ? { x: left, y: top, width: right - left, height: bottom - top } : null
    const serialized = JSON.stringify(bounds)
    if (serialized !== lastBounds) {
      lastBounds = serialized
      host.bounds(id, bounds)
    }
  }
  const timer = setInterval(updateBounds, 100)
  const unsubscribe = host.subscribe((event) => {
    if (event.id !== id || stopped) return
    const value = event.message as {
      type: string
      message?: string
      request?: unknown
      id?: string
    }
    try {
      if (value.type === 'rendered') {
        callbacks.ready()
        return
      }
      if (value.type === 'error') {
        stop()
        callbacks.error(new Error(value.message ?? 'The extension failed.'))
        return
      }
      if (value.type === 'request') {
        dispatcher.dispatch(value.request)
        return
      }
      if (value.type === 'document') {
        const input = value.request as { handle: string; revision: number; text: string }
        if (
          documentBusy ||
          !callbacks.document ||
          typeof input?.handle !== 'string' ||
          !/^[a-f0-9-]{36}$/.test(input.handle) ||
          !Number.isSafeInteger(input.revision) ||
          typeof input.text !== 'string' ||
          input.text.length > 64000
        )
          throw new Error('Invalid or unavailable document edit.')
        documentBusy = true
        void callbacks
          .document(input.handle, input.revision, input.text)
          .then(
            () => send({ type: 'result', id: value.id, result: { saved: true } }),
            (error) =>
              send({
                type: 'result',
                id: value.id,
                error: encodeExtensionFailure(error)
              })
          )
          .finally(() => {
            documentBusy = false
          })
      }
    } catch (error) {
      send({
        type: 'result',
        id: value.id ?? (value.request as { id?: string })?.id,
        error: encodeExtensionFailure(error)
      })
    }
  })
  const stop = () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    dispatcher.stop()
    unsubscribe()
    signal?.removeEventListener('abort', stop)
    if (opened) host.close(id)
  }
  signal?.addEventListener('abort', stop, { once: true })
  if (signal?.aborted) {
    stop()
    throw new Error('Extension start cancelled.')
  }
  void host.open({ id, title: callbacks.title ?? 'xNet extension', code, dataset, channelId }).then(
    () => {
      opened = true
      if (stopped) {
        host.close(id)
        return
      }
      send({ type: 'update', dataset: current })
      updateBounds()
    },
    (error) => {
      stop()
      callbacks.error(error instanceof Error ? error : new Error(String(error)))
    }
  )
  return {
    mount(next) {
      element = next
      updateBounds()
    },
    update(next) {
      current = next
      send({ type: 'update', dataset: next })
    },
    invalidate() {
      send({ type: 'invalidate' })
    },
    event() {
      throw new Error('Browser extensions handle their own events.')
    },
    observe: () => host.observe(id),
    act: (action) => host.act(id, action),
    stop
  }
}
