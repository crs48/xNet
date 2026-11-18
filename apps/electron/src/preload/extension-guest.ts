import type {
  ExtensionCheckAction,
  ExtensionCheckObservation
} from '../../../../packages/workbench/src/communities/extension-check-contract'
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('xnetExtensionGuest', {
  send: (message: unknown) => ipcRenderer.send('xnet:extension:guest', message),
  subscribe: (callback: (message: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: unknown) => callback(message)
    ipcRenderer.on('xnet:extension:message', listener)
    return () => ipcRenderer.removeListener('xnet:extension:message', listener)
  }
})

// This observer runs in Electron's isolated world: guest scripts cannot replace it or its IDs.
const ids = new WeakMap<Element, string>()
let serial = 0
const controls = () =>
  [
    ...document.querySelectorAll<HTMLElement>(
      'button,input:not([type=file]),textarea,select,a[href],[role=button]'
    )
  ]
    .filter((element) => {
      const rect = element.getBoundingClientRect(),
        style = getComputedStyle(element)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      )
    })
    .slice(0, 500)
const identifier = (element: Element) => {
  let id = ids.get(element)
  if (!id) {
    id = `element-${++serial}`
    ids.set(element, id)
  }
  return id
}
const observe = (): ExtensionCheckObservation => {
  const nodes = controls()
  const text = document.body?.innerText.slice(0, 16000) ?? ''
  return {
    tree: { type: 'stack', children: [{ type: 'text', text: text.slice(0, 1000) }] },
    rendered: !!document.querySelector('#root')?.childNodes.length,
    text,
    errors: [],
    requiresData: false,
    width: innerWidth,
    height: innerHeight,
    overflow: document.documentElement.scrollWidth > innerWidth,
    controls: nodes.map((element) => {
      const rect = element.getBoundingClientRect()
      const label =
        element.getAttribute('aria-label') ??
        (element as HTMLInputElement).labels?.[0]?.textContent ??
        element.textContent ??
        (element as HTMLInputElement).placeholder ??
        ''
      return {
        id: identifier(element),
        label: label.trim().slice(0, 200),
        type:
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) &&
          !['checkbox', 'radio', 'submit', 'button'].includes((element as HTMLInputElement).type)
            ? 'input'
            : 'button',
        disabled: !!(element as HTMLButtonElement).disabled,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
    })
  }
}
const action = (input: ExtensionCheckAction) => {
  const element = controls().find((element) => identifier(element) === input.target)
  if (!element || (element as HTMLButtonElement).disabled)
    throw new Error('The observed control is no longer available.')
  element.focus()
  if (input.type === 'click') element.click()
  else if (input.type === 'input') {
    const prototype =
      element.tagName === 'INPUT'
        ? HTMLInputElement.prototype
        : element.tagName === 'TEXTAREA'
          ? HTMLTextAreaElement.prototype
          : element.tagName === 'SELECT'
            ? HTMLSelectElement.prototype
            : null
    if (!prototype) throw new Error('This is not an editable control.')
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, input.value ?? '')
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  } else throw new Error('Unsupported control action.')
}
ipcRenderer.on(
  'xnet:extension:inspect',
  (_event, request: { id: string; action?: ExtensionCheckAction }) => {
    try {
      if (request.action) action(request.action)
      ipcRenderer.send('xnet:extension:inspection', { id: request.id, result: observe() })
    } catch (error) {
      ipcRenderer.send('xnet:extension:inspection', { id: request.id, error: String(error) })
    }
  }
)
for (const event of ['pointerdown', 'keydown'])
  document.addEventListener(
    event,
    (event) => {
      if (event.isTrusted) ipcRenderer.send('xnet:extension:gesture')
    },
    { capture: true }
  )
