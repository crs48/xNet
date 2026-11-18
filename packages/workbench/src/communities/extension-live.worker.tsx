import '@remote-dom/core/polyfill'
import '@remote-dom/react/polyfill'
import type { ExtensionMutationResult } from './extension-broker'
import type { ExtensionDataset } from './extension-data'
import type { ExtensionRequest } from './extension-protocol'
import type { ExtensionQueryResult } from './extension-queries'
import { RemoteRootElement } from '@remote-dom/core/elements'
import { ChannelSchema, ChatMessageSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import { DataBridgeProvider, useQuery, useMutate } from '@xnetjs/react/queries'
import { Badge } from '@xnetjs/ui'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { createRoot } from 'react-dom/client'
import { readPreviewTree, type ChatPreviewNode } from './agent-extension'
import { createLiveExtensionBridge } from './extension-live-client'
import { decodeExtensionFailure, ExtensionAccessError } from './extension-protocol'

function useDocument(nodeId: string) {
  if (!live) throw new Error('Extension document client is unavailable.')
  const client = live.documents
  return React.useSyncExternalStore(client.subscribe, () => client.get(nodeId))
}
function useDocumentIds() {
  if (!live) throw new Error('Extension document client is unavailable.')
  return React.useSyncExternalStore(live.documents.subscribe, live.documents.ids)
}
const modules: Record<string, unknown> = {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  '@xnetjs/react': { useQuery, useMutate },
  '@xnetjs/react/queries': { useQuery, useMutate },
  '@xnetjs/extensions/react': { useQuery, useMutate, useDocument, useDocumentIds },
  '@xnetjs/extensions/ui': {
    Grid: ({ columns = 2, children }: React.PropsWithChildren<{ columns?: number }>) => (
      <div data-xnet-columns={columns}>{children}</div>
    ),
    Row: ({ children }: React.PropsWithChildren) => <div data-xnet-row="true">{children}</div>,
    DocumentEditor: ({ handle }: { handle: string }) => <div data-xnet-document-editor={handle} />,
    DocumentView: ({ handle }: { handle: string }) => <div data-xnet-document={handle} />
  },
  '@xnetjs/data': { ChannelSchema, ChatMessageSchema, PageSchema, TaskSchema },
  '@xnetjs/ui': {
    Badge,
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    )
  }
}
const tags: Record<string, ChatPreviewNode['type']> = {
  div: 'stack',
  section: 'stack',
  main: 'stack',
  nav: 'stack',
  header: 'stack',
  footer: 'stack',
  ul: 'stack',
  ol: 'stack',
  article: 'card',
  li: 'card',
  p: 'text',
  h1: 'text',
  h2: 'text',
  h3: 'text',
  h4: 'text',
  strong: 'text',
  b: 'text',
  em: 'text',
  small: 'text',
  span: 'badge',
  br: 'text',
  button: 'button',
  input: 'input',
  label: 'stack'
}
customElements.define('extension-root', RemoteRootElement)
const root = document.createElement('extension-root') as RemoteRootElement
const elements = new Map<string, HTMLElement>()
const ids = new WeakMap<Node, string>()
let serial = 0,
  scheduled = false,
  revision = 0
const send = self.postMessage.bind(self)
function tree(): ChatPreviewNode {
  elements.clear()
  let visited = 0
  const visit = (node: Node, depth: number): ChatPreviewNode => {
    if (++visited > 300 || depth > 12) throw new Error('View exceeds its node or depth limit.')
    if (node.nodeType === 3) return { type: 'text', text: node.textContent ?? '' }
    const element = node as HTMLElement,
      tag = element.localName
    if (!Object.hasOwn(tags, tag))
      throw new Error(`Unsupported element <${tag}>. Use text, layout, buttons, or text inputs.`)
    const unsupported = [...element.attributes].find(
      (attribute) =>
        ![
          'class',
          'data-xnet-columns',
          'data-xnet-row',
          'aria-label',
          'role',
          'type',
          'value',
          'disabled',
          'placeholder',
          'maxlength',
          'data-xnet-document',
          'data-xnet-document-editor'
        ].includes(attribute.name)
    )
    if (unsupported) throw new Error(`Unsupported property "${unsupported.name}" on <${tag}>.`)
    if (element.hasAttribute('data-xnet-document-editor')) {
      if (tag !== 'div' || node.childNodes.length) throw new Error('Invalid document control.')
      return { type: 'document-editor', handle: element.getAttribute('data-xnet-document-editor')! }
    }
    if (element.hasAttribute('data-xnet-document')) {
      if (tag !== 'div' || node.childNodes.length) throw new Error('Invalid document control.')
      return { type: 'document', handle: element.getAttribute('data-xnet-document')! }
    }
    const classes = (element.getAttribute('class') ?? '').split(/\s+/)
    const grid = classes.includes('grid')
      ? classes.find((value) => /^grid-cols-[1-6]$/.test(value))
      : undefined
    const columns = element.hasAttribute('data-xnet-columns')
      ? Number(element.getAttribute('data-xnet-columns'))
      : grid
        ? Number(grid.at(-1))
        : undefined
    const type =
      tags[tag] === 'stack' && columns !== undefined
        ? 'grid'
        : tags[tag] === 'stack' &&
            (element.hasAttribute('data-xnet-row') ||
              (classes.includes('flex') && classes.includes('flex-row')))
          ? 'row'
          : tags[tag]
    let id = ids.get(node)
    if (!id) {
      id = `element-${++serial}`
      ids.set(node, id)
    }
    elements.set(id, element)
    return {
      type,
      ...(columns !== undefined ? { columns } : {}),
      ...(type === 'button' && classes.includes('aspect-square') ? { square: true } : {}),
      ...(type === 'button' || type === 'input'
        ? {
            id,
            disabled: element.hasAttribute('disabled'),
            label:
              element.getAttribute('aria-label') ??
              (element.parentElement?.localName === 'label'
                ? element.parentElement.textContent?.trim().slice(0, 2000)
                : undefined)
          }
        : {}),
      ...(type === 'input'
        ? {
            value: (element as HTMLInputElement).value ?? '',
            placeholder: element.getAttribute('placeholder') ?? '',
            ...(element.hasAttribute('maxlength')
              ? { maxLength: Number(element.getAttribute('maxlength')) }
              : {})
          }
        : {}),
      children: [...node.childNodes].map((child) => visit(child, depth + 1))
    }
  }
  return readPreviewTree({
    type: 'stack',
    children: [...root.childNodes].map((node) => visit(node, 0))
  })
}
function publish() {
  if (scheduled) return
  scheduled = true
  setTimeout(() => {
    scheduled = false
    try {
      send({ type: 'view', revision: ++revision, tree: tree() })
    } catch (error) {
      send({ type: 'error', message: String(error).slice(0, 1000) })
    }
  }, 0)
}
root.connect({
  mutate: publish,
  call: () => {
    throw new Error('Host methods are unavailable.')
  }
})
document.body.appendChild(root)
const pending = new Map<
  string,
  { resolve: (result: unknown) => void; reject: (error: Error) => void }
>()
const request = (value: ExtensionRequest) =>
  new Promise<unknown>((resolve, reject) => {
    if (pending.size >= 20) {
      reject(new ExtensionAccessError('quota', 'Too many pending requests.'))
      return
    }
    pending.set(value.id, { resolve, reject })
    send({ type: 'request', request: value })
  })
class ExtensionErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error) {
    send({ type: 'error', message: error.message.slice(0, 1000) })
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
let live: ReturnType<typeof createLiveExtensionBridge> | undefined
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'ping') {
      send({ type: 'pong' })
      return
    }
    if (data.type === 'result') {
      const item = pending.get(data.id)
      pending.delete(data.id)
      if (data.error) item?.reject(decodeExtensionFailure(data.error))
      else item?.resolve(data.result)
      return
    }
    if (data.type === 'invalidate') {
      live?.invalidate()
      return
    }
    if (data.type === 'update') {
      live?.update(data.dataset as ExtensionDataset)
      return
    }
    if (data.type === 'event') {
      if (data.revision !== revision) return
      const element = elements.get(data.id)
      if (!element || element.hasAttribute('disabled')) return
      if (data.event === 'click' && element.localName === 'button')
        element.dispatchEvent(new Event('click', { bubbles: true }))
      if (
        data.event === 'input' &&
        element.localName === 'input' &&
        typeof data.value === 'string'
      ) {
        const input = element as HTMLInputElement
        input.value = data.value.slice(0, 2000)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
      // Controlled values can change without a remote DOM mutation (for example
      // a filter over an empty page). Read the committed view after the event.
      publish()
      return
    }
    if (data.type !== 'start' || live) throw new Error('Invalid runtime handshake.')
    live = createLiveExtensionBridge(
      data.dataset,
      (value) => request(value) as Promise<ExtensionMutationResult>,
      (value) => request(value) as Promise<ExtensionQueryResult>
    )
    const module: { exports: { default?: unknown } } = { exports: {} }
    new Function('require', 'module', 'exports', data.code)(
      (id: string) => {
        if (!Object.hasOwn(modules, id)) throw new Error(`Module access denied: ${id}`)
        const module = modules[id]
        if (!id.startsWith('@xnetjs/')) return module
        return new Proxy(Object.freeze(module as Record<string, unknown>), {
          get(target, name) {
            if (name === '__esModule') return true
            if (typeof name === 'string' && !Object.hasOwn(target, name))
              throw new Error(`Export access denied: ${id}.${name}`)
            return Reflect.get(target, name)
          }
        })
      },
      module,
      module.exports
    )
    if (typeof module.exports.default !== 'function')
      throw new Error('Export a default React component.')
    const Component = module.exports.default as React.ComponentType<{ channelId: string }>
    createRoot(root).render(
      <ExtensionErrorBoundary>
        <DataBridgeProvider bridge={live.bridge}>
          <Component channelId={data.channelId} />
        </DataBridgeProvider>
      </ExtensionErrorBoundary>
    )
  } catch (error) {
    send({ type: 'error', message: String(error).slice(0, 1000) })
  }
}
self.addEventListener('unhandledrejection', () =>
  send({ type: 'error', message: 'An extension operation failed without being handled.' })
)
