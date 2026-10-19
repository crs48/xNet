import type { ExtensionAuthority } from './extension-authority'
import type { ExtensionGrant } from './extension-data'
import type { DataBridge } from '@xnetjs/data-bridge'
import { PageSchema } from '@xnetjs/data'
import * as Y from 'yjs'
import { ExtensionAccessError } from './extension-protocol'

export interface ExtensionDocumentProjection {
  nodeId: string
  handle: string
  text: string
  revision: number
  editable: false
}

/** Plain text only. Embedded resources, attributes, URLs and deleted Yjs history never cross. */
export function projectExtensionDocument(doc: Y.Doc): string {
  const fragment = ['content-v4', 'content', 'default']
    .filter((key) => doc.share.has(key))
    .map((key) => doc.getXmlFragment(key))
    .find((value) => value.length)
  if (!fragment) return ''
  const lines: string[] = []
  let visited = 0
  let bytes = 0
  const append = (text: string) => {
    if (text.length > 64_000)
      throw new ExtensionAccessError('quota', 'This document exceeds the 64 KiB text limit.')
    bytes += new TextEncoder().encode(text).length
    if (bytes > 64_000)
      throw new ExtensionAccessError('quota', 'This document exceeds the 64 KiB text limit.')
    lines.push(text)
  }
  const walk = (node: Y.XmlFragment | Y.XmlElement | Y.XmlText, depth: number) => {
    if (++visited > 2000 || depth > 32)
      throw new ExtensionAccessError('quota', 'This document exceeds the structure limit.')
    if (node instanceof Y.XmlText) {
      if (node.length > 64_000)
        throw new ExtensionAccessError('quota', 'This document exceeds the 64 KiB text limit.')
      for (const part of node.toDelta() as { insert?: unknown }[])
        if (typeof part.insert === 'string') append(part.insert)
      return
    }
    if (
      node instanceof Y.XmlElement &&
      [
        'pageEmbed',
        'databaseEmbed',
        'taskViewEmbed',
        'image',
        'video',
        'file',
        'embed',
        'richLink'
      ].includes(node.nodeName)
    ) {
      append('[Embedded resource]')
      return
    }
    if (node.length + visited > 2000)
      throw new ExtensionAccessError('quota', 'This document exceeds the structure limit.')
    for (const child of node.toArray())
      if (child instanceof Y.XmlElement || child instanceof Y.XmlText) walk(child, depth + 1)
    if (
      node instanceof Y.XmlElement &&
      ['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote'].includes(node.nodeName)
    )
      append('\n')
  }
  walk(fragment, 0)
  return lines.join('').trimEnd()
}

export async function subscribeExtensionDocuments(
  bridge: DataBridge,
  grant: ExtensionGrant,
  authority: ExtensionAuthority,
  receive: (documents: ExtensionDocumentProjection[]) => void,
  fail: (error: unknown) => void,
  signal: AbortSignal
): Promise<() => void> {
  const ids = grant.documents?.read ?? []
  const cleanups: (() => void)[] = []
  let stopped = false
  let generation = 0
  const entries = new Map<string, { doc: Y.Doc; handle: string; revision: number }>()
  const stop = () => {
    stopped = true
    cleanups.splice(0).forEach((fn) => fn())
    entries.clear()
  }
  signal.addEventListener('abort', stop, { once: true })
  cleanups.push(() => signal.removeEventListener('abort', stop))
  const validate = async (id: string) => {
    if (!ids.includes(id))
      throw new ExtensionAccessError('denied', 'Document access has not been approved.')
    const node = await bridge.get?.(id)
    if (
      !node ||
      node.deleted ||
      node.createdBy !== grant.owner ||
      node.schemaId !== PageSchema._schemaId
    )
      throw new ExtensionAccessError('denied', 'The selected document is no longer available.')
  }
  const publish = async () => {
    const serial = ++generation
    try {
      await authority.read()
      await Promise.all(ids.map(validate))
      await authority.read()
      if (stopped || serial !== generation || entries.size !== ids.length) return
      receive(
        [...entries].map(([nodeId, entry]) => ({
          nodeId,
          handle: entry.handle,
          revision: entry.revision,
          text: projectExtensionDocument(entry.doc),
          editable: false
        }))
      )
    } catch (error) {
      if (!stopped) {
        stop()
        fail(error)
      }
    }
  }
  try {
    if (signal.aborted) {
      stop()
      return stop
    }
    if (ids.length && (!bridge.acquireDoc || !bridge.releaseDoc || !bridge.get))
      throw new ExtensionAccessError('unsupported', 'Document access is unavailable on this host.')
    for (const id of ids) {
      await authority.read()
      await validate(id)
      if (stopped) return stop
      const acquired = await bridge.acquireDoc!(id)
      if (stopped) {
        bridge.releaseDoc!(id)
        return stop
      }
      const entry = { doc: acquired.doc, handle: crypto.randomUUID(), revision: 0 }
      entries.set(id, entry)
      const changed = () => {
        entry.revision++
        void publish()
      }
      entry.doc.on('update', changed)
      cleanups.push(() => {
        entry.doc.off('update', changed)
        bridge.releaseDoc!(id)
      })
    }
    if (bridge.subscribeToChanges)
      cleanups.push(
        bridge.subscribeToChanges(() => {
          void publish()
        })
      )
    await publish()
    return stop
  } catch (error) {
    stop()
    throw error
  }
}
