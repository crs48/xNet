import type { ChatPreviewNode } from './agent-extension'
import type { ExtensionDataset } from './extension-data'
import type { DefaultTreeAdapterMap } from 'parse5'
import { ChannelSchema, ChatMessageSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import { DataBridgeProvider, useQuery } from '@xnetjs/react/queries'
import { Badge } from '@xnetjs/ui'
import { parseFragment } from 'parse5'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { readPreviewTree } from './agent-extension'
import { createExtensionDataBridge } from './extension-data'

const modules: Record<string, unknown> = {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  '@xnetjs/react': { useQuery },
  '@xnetjs/react/queries': { useQuery },
  '@xnetjs/data': { ChannelSchema, ChatMessageSchema, PageSchema, TaskSchema },
  '@xnetjs/ui': { Badge }
}
const tags: Record<string, ChatPreviewNode['type']> = {
  div: 'stack',
  section: 'stack',
  main: 'stack',
  ul: 'stack',
  ol: 'stack',
  article: 'card',
  li: 'card',
  p: 'text',
  h1: 'text',
  h2: 'text',
  h3: 'text',
  h4: 'text',
  h5: 'text',
  h6: 'text',
  strong: 'text',
  b: 'text',
  em: 'text',
  small: 'text',
  span: 'badge',
  br: 'text'
}

/** Parse inert markup into the same bounded tree as legacy views; never insert HTML. */
export function markupToTree(markup: string): ChatPreviewNode {
  if (markup.length > 64000) throw new Error('View exceeds the output limit.')
  function visit(node: DefaultTreeAdapterMap['childNode']): ChatPreviewNode[] {
    if (node.nodeName === '#text' && 'value' in node) return [{ type: 'text', text: node.value }]
    if (node.nodeName === '#comment') return []
    if (
      !('tagName' in node) ||
      !Object.hasOwn(tags, node.tagName) ||
      node.attrs.some((attr) => !['class', 'aria-label', 'role'].includes(attr.name))
    )
      throw new Error(
        'Use text, section, article, list, and Badge primitives. Interactive or external content is not supported yet.'
      )
    return [{ type: tags[node.tagName], children: node.childNodes.flatMap(visit) }]
  }
  return readPreviewTree({
    type: 'stack',
    children: parseFragment(markup).childNodes.flatMap(visit)
  })
}

export function renderExtension(
  code: string,
  dataset: ExtensionDataset,
  channelId: string
): ChatPreviewNode {
  const bridge = createExtensionDataBridge(dataset)
  const module: { exports: { default?: unknown } } = { exports: {} }
  const requireModule = (id: string) => {
    if (!Object.hasOwn(modules, id)) throw new Error(`Module access denied: ${id}`)
    return modules[id]
  }
  // This module is bundled only into the opaque, terminable worker, never the host renderer.
  new Function('require', 'module', 'exports', code)(requireModule, module, module.exports)
  const component = module.exports.default
  if (typeof component !== 'function') throw new Error('Export a default React component.')
  const renderComponent = component
  let legacy: ChatPreviewNode | undefined
  function Extension() {
    const view = renderComponent({
      channelId,
      messages: dataset.nodes
        .filter((node) => node.schemaId === ChatMessageSchema._schemaId)
        .map((node) => ({ id: node.id, content: String(node.properties.content ?? '') }))
    }) as unknown
    if (
      React.isValidElement(view) ||
      view === null ||
      typeof view === 'string' ||
      typeof view === 'number'
    )
      return view
    legacy = readPreviewTree(view)
    return null
  }
  const markup = renderToStaticMarkup(
    <DataBridgeProvider bridge={bridge}>
      <Extension />
    </DataBridgeProvider>
  )
  return legacy ?? markupToTree(markup)
}

if (typeof self !== 'undefined')
  self.onmessage = ({
    data
  }: MessageEvent<{ code: string; dataset: ExtensionDataset; channelId: string }>) => {
    try {
      self.postMessage({ ok: true, tree: renderExtension(data.code, data.dataset, data.channelId) })
    } catch (error) {
      self.postMessage({ ok: false, error: String(error).slice(0, 1000) })
    }
  }
