import type { LibraryStore } from './store'
import type { DataService } from '../data-process/data-service'
import { PageSchema } from '@xnetjs/data'
import { resourceIdentityForUrl } from '@xnetjs/social/import/core'
import { SocialContentSchema } from '@xnetjs/social/schemas'
import * as Y from 'yjs'

export type CaptureInput = {
  requestId: string
  url: string
  title: string
  note: string
  excerpt: string
}
export type CaptureResult = { resourceId: string; pageId: string; reusedResource: boolean }
export type CaptureIntent = {
  version: 1
  input: CaptureInput
  authorDID: string
  result: CaptureResult
  resource: ReturnType<typeof resourceIdentityForUrl>
  document: number[]
  completed: boolean
  createdAt: number
}

export function validateCapture(input: CaptureInput): CaptureInput {
  if (!input || typeof input.requestId !== 'string' || !/^[\da-f-]{36}$/i.test(input.requestId))
    throw new Error('Capture request is missing its retry identity.')
  for (const field of ['url', 'title', 'note', 'excerpt'] as const)
    if (typeof input[field] !== 'string') throw new Error(`Capture ${field} must be text.`)
  if (
    input.title.length > 500 ||
    input.note.length > 100000 ||
    input.excerpt.length > 20000 ||
    input.url.length > 500
  )
    throw new Error(
      'This capture exceeds the supported field size. Your input has not been discarded.'
    )
  resourceIdentityForUrl(input.url)
  return { ...input, url: input.url.trim(), title: input.title.trim() }
}

export function captureDocument(input: CaptureInput): number[] {
  const doc = new Y.Doc()
  const group = new Y.XmlElement('blockGroup')
  const lines = [
    input.url,
    ...(input.note ? input.note.split('\n') : []),
    ...(input.excerpt ? ['Excerpt', ...input.excerpt.split('\n')] : [])
  ]
  group.insert(
    0,
    lines.map((line, index) => {
      const block = new Y.XmlElement('blockContainer')
      block.setAttribute('id', `capture-${input.requestId}-${index}`)
      const paragraph = new Y.XmlElement('paragraph')
      const text = new Y.XmlText()
      if (index === 0)
        text.applyDelta([{ insert: line, attributes: { link: { href: input.url } } }])
      else text.insert(0, line)
      paragraph.insert(0, [text])
      block.insert(0, [paragraph])
      return block
    })
  )
  doc.getXmlFragment('content-v4').insert(0, [group])
  const bytes = Array.from(Y.encodeStateAsUpdate(doc))
  doc.destroy()
  return bytes
}

export function readPageText(bytes: number[]): string {
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, new Uint8Array(bytes))
    const read = (node: unknown): string => {
      if (node instanceof Y.XmlText)
        return (node.toDelta() as { insert?: unknown }[])
          .map((part) => (typeof part.insert === 'string' ? part.insert : ''))
          .join('')
      if (
        node instanceof Y.XmlElement &&
        ['wikilink', 'mention', 'hashtag'].includes(node.nodeName)
      ) {
        const attrs = node.getAttributes()
        return String(attrs.title ?? attrs.label ?? attrs.name ?? '')
      }
      if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment)
        return node.toArray().map(read).join('\n')
      throw new Error('The source note contains an unsupported document node.')
    }
    return read(doc.getXmlFragment('content-v4'))
  } finally {
    doc.destroy()
  }
}

export async function saveCapture(options: {
  input: CaptureInput
  store: LibraryStore
  data: Pick<
    DataService,
    'getNode' | 'getDocumentContent' | 'setDocumentContent' | 'importDeterministicNodes'
  >
  identity: { authorDID: string; signingKey: number[] }
}): Promise<CaptureResult> {
  const input = validateCapture(options.input)
  const { store, data, identity } = options
  let intent = store.captureIntent(input.requestId)
  if (
    intent &&
    (intent.authorDID !== identity.authorDID ||
      JSON.stringify(intent.input) !== JSON.stringify(input))
  )
    throw new Error('This retry belongs to a different capture or workspace identity.')
  if (!intent) {
    const resource = resourceIdentityForUrl(input.url)
    const cached = store.byUrl(resource.url)
    const existing = await data.getNode(cached?.id ?? resource.id)
    if (existing?.deleted)
      throw new Error('This source was removed. Restore it before adding another note.')
    intent = {
      version: 1,
      input,
      authorDID: identity.authorDID,
      resource,
      result: {
        resourceId: existing?.id ?? resource.id,
        pageId: `capture:${input.requestId}`,
        reusedResource: !!existing
      },
      document: captureDocument(input),
      completed: false,
      createdAt: Date.now()
    }
    store.saveCaptureIntent(intent)
  }
  const { resourceId, pageId } = intent.result
  if (intent.completed) {
    const savedPage = await data.getNode(pageId)
    if (!savedPage || savedPage.deleted)
      throw new Error('The saved note was removed; start a new capture to save another.')
    return intent.result
  }
  const resource = await data.getNode(resourceId)
  const page = await data.getNode(pageId)
  if (resource?.deleted || page?.deleted)
    throw new Error(
      'A record from this interrupted capture was removed. Its recovery text was kept.'
    )
  const drafts = [
    ...(!resource
      ? [
          {
            id: resourceId,
            schemaId: SocialContentSchema._schemaId,
            properties: {
              platform: intent.resource.platform,
              platformContentId: intent.resource.nativeId,
              contentKind: intent.resource.kind,
              canonicalUrl: intent.resource.url,
              title: input.title || intent.resource.url,
              privacyClass: 'private',
              visibility: 'private'
            }
          }
        ]
      : []),
    ...(!page
      ? [
          {
            id: pageId,
            schemaId: PageSchema._schemaId,
            properties: {
              title: input.title || input.url,
              visibility: 'private',
              sourceResources: [resourceId]
            }
          }
        ]
      : [])
  ]
  if (drafts.length) await data.importDeterministicNodes({ ...identity, drafts })
  // A retry never replaces text the user has already opened and edited.
  if (!(await data.getDocumentContent(pageId)))
    await data.setDocumentContent(pageId, intent.document)
  const properties = resource?.properties
  const value = (key: string) =>
    typeof properties?.[key] === 'string' ? (properties[key] as string) : ''
  store.seed({
    id: resourceId,
    platform: value('platform') || intent.resource.platform,
    platformContentId: value('platformContentId') || intent.resource.nativeId,
    url: value('canonicalUrl') || intent.resource.url,
    title: value('title') || input.title || input.url,
    sourceText: value('searchText'),
    actor: value('actorHandle'),
    privacy: value('privacyClass') || 'private',
    addedAt: resource?.createdAt ?? intent.createdAt
  })
  const savedDocument = await data.getDocumentContent(pageId)
  if (!savedDocument)
    throw new Error('The captured Page has no saved text. The recovery record was retained.')
  const saved = store.get(resourceId)!
  const next = {
    ...saved,
    notes: [
      ...(saved.notes ?? []).filter((note) => note.id !== pageId),
      {
        id: pageId,
        title: input.title || input.url,
        text: readPageText(savedDocument),
        url: input.url,
        author: identity.authorDID,
        pageId
      }
    ]
  }
  store.put(next)
  store.index(next)
  store.saveCaptureIntent({ ...intent, completed: true })
  return intent.result
}
