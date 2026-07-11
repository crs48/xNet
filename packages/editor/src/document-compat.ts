/**
 * Compatibility helpers for ProseMirror/Tiptap JSON editor documents.
 */
import type { JSONContent } from '@tiptap/core'

// v3: emoji + inlineMath/blockMath nodes (0297 — MIT extension adoption)
export const EDITOR_DOCUMENT_SCHEMA_VERSION = 3

export type EditorDocumentMigrationKind =
  | 'root-normalized'
  | 'node-renamed'
  | 'node-fallback'
  | 'mark-dropped'
  | 'attrs-normalized'

export type EditorDocumentMigration = {
  kind: EditorDocumentMigrationKind
  from: string
  to: string
  path: string
  reason: string
}

export type EditorDocumentCompatibilityResult = {
  doc: JSONContent
  migrations: EditorDocumentMigration[]
}

type JsonRecord = Record<string, unknown>
type EditorJsonMark = {
  type: string
  attrs?: Record<string, unknown>
}
type NodeContext = 'block' | 'inline'

const EMPTY_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }]
}

const CURRENT_NODE_TYPES = new Set([
  'blockMath',
  'blockquote',
  'bulletList',
  'callout',
  'codeBlock',
  'databaseEmbed',
  'databaseReference',
  'doc',
  'embed',
  'emoji',
  'file',
  'hardBreak',
  'heading',
  'horizontalRule',
  'image',
  'inlineMath',
  'listItem',
  'mermaid',
  'orderedList',
  'pageEmbed',
  'paragraph',
  'richLink',
  'smartReference',
  'taskDueDate',
  'taskItem',
  'taskList',
  'taskMention',
  'taskViewEmbed',
  'text',
  'toggle'
])

const CURRENT_MARK_TYPES = new Set([
  'bold',
  'code',
  'comment',
  'italic',
  'link',
  'strike',
  'wikilink'
])

const BLOCK_CONTENT_NODE_TYPES = new Set([
  'blockquote',
  'bulletList',
  'callout',
  'doc',
  'listItem',
  'orderedList',
  'taskItem',
  'taskList',
  'toggle'
])

const INLINE_CONTENT_NODE_TYPES = new Set(['heading', 'paragraph'])

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? { ...value } : undefined
}

function stringValue(value: unknown): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? trimmed : null
}

function stringAttr(record: JsonRecord | undefined, keys: string[]): string | null {
  if (!record) return null

  for (const key of keys) {
    const value = stringValue(record[key])
    if (value) return value
  }

  return null
}

function numberAttr(record: JsonRecord | undefined, keys: string[], fallback: number): number {
  if (!record) return fallback

  for (const key of keys) {
    const value = record[key]
    const numeric = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numeric)) return numeric
  }

  return fallback
}

function booleanAttr(record: JsonRecord | undefined, keys: string[], fallback: boolean): boolean {
  if (!record) return fallback

  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'boolean') return value
  }

  return fallback
}

function recordAttr(record: JsonRecord | undefined, keys: string[]): Record<string, unknown> {
  if (!record) return {}

  for (const key of keys) {
    const value = record[key]
    if (isRecord(value)) return { ...value }
  }

  return {}
}

function toAttrs(node: JsonRecord): Record<string, unknown> | undefined {
  return optionalRecord(node.attrs)
}

function combinedAttrs(node: JsonRecord): Record<string, unknown> {
  return {
    ...node,
    ...(isRecord(node.attrs) ? node.attrs : {})
  }
}

function appendMigration(
  migrations: EditorDocumentMigration[],
  migration: EditorDocumentMigration
): void {
  migrations.push(migration)
}

function normalizeMarks(
  value: unknown,
  path: string,
  migrations: EditorDocumentMigration[]
): EditorJsonMark[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((mark, index) => {
    if (!isRecord(mark)) return []

    const type = stringValue(mark.type)
    if (!type) return []

    if (!CURRENT_MARK_TYPES.has(type)) {
      appendMigration(migrations, {
        kind: 'mark-dropped',
        from: type,
        to: 'none',
        path: `${path}.marks[${index}]`,
        reason: 'Dropped an unsupported inline mark so the document can load in the current schema.'
      })
      return []
    }

    const attrs = toAttrs(mark)
    return [
      {
        type,
        ...(attrs ? { attrs } : {})
      }
    ]
  })
}

function normalizeContent(
  value: unknown,
  path: string,
  context: NodeContext,
  migrations: EditorDocumentMigration[]
): JSONContent[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((child, index) =>
    normalizeNode(child, `${path}.content[${index}]`, context, migrations)
  )
}

function contentContextFor(type: string): NodeContext | null {
  if (BLOCK_CONTENT_NODE_TYPES.has(type)) return 'block'
  if (INLINE_CONTENT_NODE_TYPES.has(type)) return 'inline'
  return null
}

function fallbackText(node: JsonRecord): string | null {
  const attrs = toAttrs(node)
  return (
    stringValue(node.text) ??
    stringAttr(attrs, ['text', 'title', 'name', 'label', 'url']) ??
    stringAttr(node, ['text', 'title', 'name', 'label', 'url'])
  )
}

function fallbackNode(
  type: string,
  node: JsonRecord,
  path: string,
  context: NodeContext,
  migrations: EditorDocumentMigration[]
): JSONContent[] {
  const text = fallbackText(node)
  const safeText = text ?? `[Unsupported block: ${type}]`

  appendMigration(migrations, {
    kind: 'node-fallback',
    from: type,
    to: context === 'inline' ? 'text' : 'paragraph',
    path,
    reason: 'Replaced an unsupported node with safe editable text.'
  })

  if (context === 'inline') {
    return [{ type: 'text', text: safeText }]
  }

  return [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: safeText }]
    }
  ]
}

function normalizeDatabaseViewNode(
  type: string,
  node: JsonRecord,
  path: string,
  migrations: EditorDocumentMigration[]
): JSONContent[] {
  const attrs = combinedAttrs(node)
  const databaseId = stringAttr(attrs, ['databaseId', 'databaseID', 'database', 'targetId', 'id'])

  appendMigration(migrations, {
    kind: 'node-renamed',
    from: type,
    to: 'databaseEmbed',
    path,
    reason: 'Converted a legacy database view block to the current database embed node.'
  })

  return [
    {
      type: 'databaseEmbed',
      attrs: {
        databaseId,
        viewType: stringAttr(attrs, ['viewType', 'view', 'mode']) ?? 'table',
        viewConfig: recordAttr(attrs, ['viewConfig', 'config', 'filters']),
        showTitle: booleanAttr(attrs, ['showTitle'], true),
        maxHeight: numberAttr(attrs, ['maxHeight'], 400)
      }
    }
  ]
}

function normalizePageEmbedNode(
  type: string,
  node: JsonRecord,
  path: string,
  migrations: EditorDocumentMigration[]
): JSONContent[] {
  const attrs = combinedAttrs(node)
  const pageId = stringAttr(attrs, ['pageId', 'pageID', 'targetId', 'href', 'id'])

  appendMigration(migrations, {
    kind: 'node-renamed',
    from: type,
    to: 'pageEmbed',
    path,
    reason: 'Converted a legacy page reference block to the current page embed node.'
  })

  return [
    {
      type: 'pageEmbed',
      attrs: {
        pageId,
        title: stringAttr(attrs, ['title', 'label', 'name']) ?? pageId,
        subtitle: stringAttr(attrs, ['subtitle', 'description']),
        icon: stringAttr(attrs, ['icon']) ?? 'PG',
        preview: stringAttr(attrs, ['preview', 'excerpt'])
      }
    }
  ]
}

function normalizeExternalEmbedNode(
  type: string,
  node: JsonRecord,
  path: string,
  migrations: EditorDocumentMigration[]
): JSONContent[] {
  const attrs = combinedAttrs(node)
  const url = stringAttr(attrs, ['url', 'href', 'src'])

  appendMigration(migrations, {
    kind: 'node-renamed',
    from: type,
    to: 'embed',
    path,
    reason: 'Converted a legacy external media node to the current embed node.'
  })

  return [
    {
      type: 'embed',
      attrs: {
        url,
        provider: stringAttr(attrs, ['provider']),
        embedId: stringAttr(attrs, ['embedId', 'id']),
        embedUrl: stringAttr(attrs, ['embedUrl', 'src']),
        title: stringAttr(attrs, ['title', 'name']),
        width: numberAttr(attrs, ['width'], 400),
        alignment: stringAttr(attrs, ['alignment']) ?? 'left'
      }
    }
  ]
}

function normalizeDatabaseReferenceNode(
  type: string,
  node: JsonRecord,
  path: string,
  migrations: EditorDocumentMigration[]
): JSONContent[] {
  const attrs = combinedAttrs(node)
  const databaseId = stringAttr(attrs, ['databaseId', 'databaseID', 'database', 'targetId', 'id'])

  appendMigration(migrations, {
    kind: 'node-renamed',
    from: type,
    to: 'databaseReference',
    path,
    reason: 'Converted a legacy database inline reference to the current database reference node.'
  })

  return [
    {
      type: 'databaseReference',
      attrs: {
        databaseId,
        title: stringAttr(attrs, ['title', 'label', 'name']) ?? databaseId,
        icon: stringAttr(attrs, ['icon']) ?? 'DB'
      }
    }
  ]
}

function normalizeCurrentNode(
  type: string,
  node: JsonRecord,
  path: string,
  migrations: EditorDocumentMigration[]
): JSONContent[] {
  if (type === 'text') {
    const text = typeof node.text === 'string' ? node.text : ''
    return [
      {
        type: 'text',
        text,
        ...(node.marks ? { marks: normalizeMarks(node.marks, path, migrations) } : {})
      }
    ]
  }

  const attrs = toAttrs(node)
  const contentContext = contentContextFor(type)
  const content =
    contentContext === null ? [] : normalizeContent(node.content, path, contentContext, migrations)

  return [
    {
      type,
      ...(attrs ? { attrs } : {}),
      ...(content.length > 0 ? { content } : {})
    }
  ]
}

function normalizeNode(
  value: unknown,
  path: string,
  context: NodeContext,
  migrations: EditorDocumentMigration[]
): JSONContent[] {
  if (!isRecord(value)) {
    appendMigration(migrations, {
      kind: 'node-fallback',
      from: typeof value,
      to: context === 'inline' ? 'text' : 'paragraph',
      path,
      reason: 'Replaced malformed JSON content with an editable placeholder.'
    })

    return context === 'inline'
      ? [{ type: 'text', text: '' }]
      : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }]
  }

  const type = stringValue(value.type)
  if (!type) {
    return fallbackNode('unknown', value, path, context, migrations)
  }

  switch (type) {
    case 'database':
    case 'databaseView':
    case 'database_view':
      return normalizeDatabaseViewNode(type, value, path, migrations)
    case 'pageCard':
    case 'pageLink':
    case 'pageReference':
      return normalizePageEmbedNode(type, value, path, migrations)
    case 'externalEmbed':
    case 'iframeEmbed':
    case 'mediaEmbed':
      return normalizeExternalEmbedNode(type, value, path, migrations)
    case 'databaseLink':
    case 'databaseRef':
      return normalizeDatabaseReferenceNode(type, value, path, migrations)
    default:
      if (CURRENT_NODE_TYPES.has(type)) {
        return normalizeCurrentNode(type, value, path, migrations)
      }
      return fallbackNode(type, value, path, context, migrations)
  }
}

export function normalizeEditorDocumentJson(input: unknown): EditorDocumentCompatibilityResult {
  const migrations: EditorDocumentMigration[] = []

  if (!isRecord(input)) {
    appendMigration(migrations, {
      kind: 'root-normalized',
      from: typeof input,
      to: 'doc',
      path: '$',
      reason: 'Created an empty editor document because the stored root value was not an object.'
    })
    return { doc: EMPTY_DOC, migrations }
  }

  if (input.type === 'doc') {
    const content = normalizeContent(input.content, '$', 'block', migrations)
    return {
      doc: {
        type: 'doc',
        content: content.length > 0 ? content : EMPTY_DOC.content
      },
      migrations
    }
  }

  appendMigration(migrations, {
    kind: 'root-normalized',
    from: stringValue(input.type) ?? 'unknown',
    to: 'doc',
    path: '$',
    reason: 'Wrapped legacy root content in a current editor document.'
  })

  if (Array.isArray(input.content)) {
    const content = normalizeContent(input.content, '$', 'block', migrations)
    return {
      doc: {
        type: 'doc',
        content: content.length > 0 ? content : EMPTY_DOC.content
      },
      migrations
    }
  }

  const content = normalizeNode(input, '$.content[0]', 'block', migrations)
  return {
    doc: {
      type: 'doc',
      content: content.length > 0 ? content : EMPTY_DOC.content
    },
    migrations
  }
}
