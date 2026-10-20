import type { ExtensionAuthority } from './extension-authority'
import type { ExtensionGrant } from './extension-data'
import type { DataBridge } from '@xnetjs/data-bridge'
import { PageSchema } from '@xnetjs/data'
import { documentOverlayKey, encodeDocumentOverlay, mergeDocumentOverlay } from '@xnetjs/data/store'
import * as Y from 'yjs'
import { privateExtensionDestination } from './extension-containers'
import { ExtensionAccessError } from './extension-protocol'

export function editableDocumentText(doc: Y.Doc): { fragment: string; text: string } | null {
  const key =
    ['content-v4', 'content', 'default'].find(
      (key) => doc.share.has(key) && doc.getXmlFragment(key).length
    ) ?? 'content-v4'
  const fragment = doc.getXmlFragment(key)
  if (fragment.length > 500) return null
  const lines: string[] = []
  for (const node of fragment.toArray()) {
    if (
      !(node instanceof Y.XmlElement) ||
      node.nodeName !== 'paragraph' ||
      Object.keys(node.getAttributes()).length ||
      node.length > 1
    )
      return null
    const child = node.get(0)
    if (child && (!(child instanceof Y.XmlText) || child.length > 64000)) return null
    const delta =
      child instanceof Y.XmlText
        ? (child.toDelta() as { insert?: unknown; attributes?: unknown }[])
        : []
    if (delta.some((part) => typeof part.insert !== 'string' || part.attributes)) return null
    lines.push(delta.map((part) => part.insert as string).join(''))
  }
  const text = lines.join('\n')
  return new TextEncoder().encode(text).length <= 64000 ? { fragment: key, text } : null
}

/** Host UI only: a prepared clone is committed before applying it to the live document. */
export async function saveExtensionDocument(
  bridge: DataBridge,
  grant: ExtensionGrant,
  authority: ExtensionAuthority,
  entry: { nodeId: string; doc: Y.Doc; revision: number },
  expectedRevision: number,
  text: string,
  signal: AbortSignal,
  current: () => boolean
): Promise<void> {
  const deadline = Date.now() + 5000
  const check = () => {
    if (signal.aborted || !current())
      throw new ExtensionAccessError('revoked', 'Document access stopped.')
    if (Date.now() >= deadline)
      throw new ExtensionAccessError(
        'timeout',
        'Document validation timed out. Reload and try again.'
      )
    if (entry.revision !== expectedRevision)
      throw new ExtensionAccessError('conflict', 'This document changed. Reload it before saving.')
  }
  check()
  if (
    !grant.documents?.write?.includes(entry.nodeId) ||
    !grant.documents.read.includes(entry.nodeId)
  )
    throw new ExtensionAccessError('denied', 'Document editing has not been approved.')
  if (
    typeof text !== 'string' ||
    new TextEncoder().encode(text).length > 64000 ||
    text.split('\n').length > 500
  )
    throw new ExtensionAccessError('quota', 'Use at most 64 KiB and five hundred paragraphs.')
  if (!bridge.get || !bridge.transaction || !bridge.getLocalState)
    throw new ExtensionAccessError('unsupported', 'Durable document editing is unavailable.')
  const before = await bridge.get(entry.nodeId)
  if (!before || before.deleted || before.schemaId !== PageSchema._schemaId)
    throw new ExtensionAccessError('denied', 'The selected page is unavailable.')
  const scope = await privateExtensionDestination(bridge, grant, before, signal)
  const state = await authority.read()
  if (JSON.stringify(state.approval.grant) !== JSON.stringify(grant))
    throw new ExtensionAccessError('revoked', 'Document permissions changed.')
  if (state.approval.commands >= 1000)
    throw new ExtensionAccessError('quota', 'Review permissions before making more edits.')
  const key = documentOverlayKey(entry.nodeId),
    raw = await bridge.getLocalState(key)
  const clone = new Y.Doc({ gc: false })
  try {
    const liveState = Y.encodeStateAsUpdate(entry.doc)
    // Bound retained history before decoding it into a second document.
    encodeDocumentOverlay(liveState)
    const base = mergeDocumentOverlay(liveState, raw)!
    encodeDocumentOverlay(base)
    Y.applyUpdate(clone, base)
    const editing = editableDocumentText(clone)
    if (!editing)
      throw new ExtensionAccessError(
        'unsupported',
        'This editor supports plain paragraphs. Rich and embedded content remains read-only.'
      )
    if (editing.text === text) return
    const vector = Y.encodeStateVector(clone)
    const fragment = clone.getXmlFragment(editing.fragment)
    // Preserve unchanged paragraphs and their CRDT identity; do not flatten other document roots.
    const lines = text.split('\n')
    clone.transact(() => {
      for (let index = 0; index < lines.length; index++) {
        let paragraph = fragment.get(index) as Y.XmlElement | undefined
        if (!paragraph) {
          paragraph = new Y.XmlElement('paragraph')
          fragment.insert(index, [paragraph])
        }
        let content = paragraph.get(0) as Y.XmlText | undefined
        if (!content) {
          content = new Y.XmlText()
          paragraph.insert(0, [content])
        }
        if (content.toString() === lines[index]) continue
        content.delete(0, content.length)
        content.insert(0, lines[index])
      }
      if (fragment.length > lines.length)
        fragment.delete(lines.length, fragment.length - lines.length)
    })
    const update = Y.encodeStateAsUpdate(clone, vector)
    const overlay = encodeDocumentOverlay(Y.encodeStateAsUpdate(clone))
    check()
    const receipt = crypto.randomUUID()
    await bridge.transaction([], {
      nodes: [
        { id: before.id, expected: before },
        ...[...scope.guards].map(([id, expected]) => ({ id, expected }))
      ],
      deadline: Math.min(deadline, scope.deadline()),
      localState: [
        { key, expected: raw, value: overlay },
        {
          key: authority.key,
          expected: state.raw,
          value: JSON.stringify({ ...state.approval, commands: state.approval.commands + 1 })
        }
      ],
      receipt: {
        key: `${authority.key}:${authority.epoch}:document:${receipt}`,
        context: JSON.stringify({
          kind: 'document.edit',
          nodeId: before.id,
          owner: grant.owner,
          artifact: grant.hash,
          epoch: authority.epoch,
          receipt
        })
      }
    })
    // Accepted updates remain durable even if this view closed during commit.
    if (!signal.aborted && current()) Y.applyUpdate(entry.doc, update, 'extension-commit')
  } finally {
    clone.destroy()
  }
}
