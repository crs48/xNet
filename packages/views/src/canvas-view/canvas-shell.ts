import type { CanvasNode, CanvasObjectKind } from '@xnetjs/canvas'
import { DatabaseSchema, PageSchema } from '@xnetjs/data'

export type LinkedDocType = 'page' | 'database' | 'canvas'

export type LinkedDocumentItem = {
  id: string
  title: string
  type: LinkedDocType
  canvasKind?: Extract<CanvasObjectKind, 'page' | 'database' | 'note'>
}

export type CanvasViewportSnapshot = {
  x: number
  y: number
  zoom: number
}

export type CanvasShellPreviewModel = {
  title: string
  displayType: Extract<LinkedDocType, 'page'> | 'note'
  badge: 'Page' | 'Note'
  previewLines: string[]
}

const SHELL_NOTE_ROLE = 'canvas-note'
const PREVIEW_LINE_COUNT = 3
const PREVIEW_LINE_LENGTH = 68
const PREVIEW_TEXT_KEYS = ['summary', 'excerpt', 'description', 'body'] as const

const CANVAS_SHELL_NOTE_SIZE = {
  width: 320,
  height: 180
}

const LINKED_DOCUMENT_SIZES: Record<
  Exclude<LinkedDocType, 'canvas'>,
  { width: number; height: number }
> = {
  page: {
    width: 360,
    height: 220
  },
  database: {
    width: 440,
    height: 260
  }
}

export function createCanvasShellNoteProperties(): Record<string, unknown> {
  return {
    title: 'Untitled Note',
    shellRole: SHELL_NOTE_ROLE
  }
}

export function isCanvasShellNote(node: CanvasNode): boolean {
  return node.type === 'note' && node.properties.shellRole === SHELL_NOTE_ROLE
}

export function getCanvasShellSourceType(
  node: CanvasNode,
  linkedDocument?: LinkedDocumentItem
): Exclude<LinkedDocType, 'canvas'> | null {
  if (linkedDocument?.type === 'page' || linkedDocument?.type === 'database') {
    return linkedDocument.type
  }

  if (node.type === 'database') {
    return 'database'
  }

  if (node.type === 'page' || node.type === 'note') {
    return 'page'
  }

  if (node.sourceSchemaId === DatabaseSchema._schemaId) {
    return 'database'
  }

  if (node.sourceSchemaId === PageSchema._schemaId) {
    return 'page'
  }

  const linkedType = node.properties.linkedType
  return linkedType === 'page' || linkedType === 'database' ? linkedType : null
}

export function getCanvasShellDisplayType(
  node: CanvasNode,
  linkedDocument?: LinkedDocumentItem
): LinkedDocType | 'note' {
  if (isCanvasShellNote(node)) {
    return 'note'
  }

  const sourceType = getCanvasShellSourceType(node, linkedDocument)
  if (sourceType) {
    return sourceType
  }

  return 'canvas'
}

export function getCanvasShellSourceId(node: CanvasNode): string | undefined {
  return node.sourceNodeId ?? node.linkedNodeId
}

export function shouldRenderCanvasShellCard(
  node: CanvasNode,
  linkedDocument?: LinkedDocumentItem
): boolean {
  const displayType = getCanvasShellDisplayType(node, linkedDocument)
  return displayType === 'page' || displayType === 'database' || displayType === 'note'
}

function getStringProperty(properties: Record<string, unknown>, key: string): string | null {
  const value = properties[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function splitPreviewText(text: string): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []

  for (const word of words) {
    const previous = lines[lines.length - 1]

    if (!previous) {
      lines.push(word)
      continue
    }

    if (`${previous} ${word}`.length > PREVIEW_LINE_LENGTH) {
      if (lines.length >= PREVIEW_LINE_COUNT) {
        break
      }
      lines.push(word)
      continue
    }

    lines[lines.length - 1] = `${previous} ${word}`
  }

  return lines.slice(0, PREVIEW_LINE_COUNT)
}

export function getCanvasShellPreviewModel(
  node: CanvasNode,
  linkedDocument?: LinkedDocumentItem
): CanvasShellPreviewModel | null {
  const displayType = getCanvasShellDisplayType(node, linkedDocument)

  if (displayType !== 'page' && displayType !== 'note') {
    return null
  }

  const title =
    (typeof node.alias === 'string' && node.alias.trim().length > 0 ? node.alias.trim() : null) ??
    (typeof linkedDocument?.title === 'string' && linkedDocument.title.trim().length > 0
      ? linkedDocument.title.trim()
      : null) ??
    getStringProperty(node.properties, 'title') ??
    (displayType === 'note' ? 'Untitled Note' : 'Untitled Page')

  const previewText =
    PREVIEW_TEXT_KEYS.map((key) => getStringProperty(node.properties, key)).find(
      (value): value is string => value !== null
    ) ?? ''

  return {
    title,
    displayType,
    badge: displayType === 'note' ? 'Note' : 'Page',
    previewLines: previewText.length > 0 ? splitPreviewText(previewText) : []
  }
}

export function getCanvasShellNotePlacement(viewport: CanvasViewportSnapshot): {
  x: number
  y: number
  width: number
  height: number
} {
  return {
    x: viewport.x - CANVAS_SHELL_NOTE_SIZE.width / 2,
    y: viewport.y - CANVAS_SHELL_NOTE_SIZE.height / 2,
    ...CANVAS_SHELL_NOTE_SIZE
  }
}

export function getLinkedDocumentPlacement(
  viewport: CanvasViewportSnapshot,
  type: Exclude<LinkedDocType, 'canvas'>
): {
  x: number
  y: number
  width: number
  height: number
} {
  const size = LINKED_DOCUMENT_SIZES[type]

  return {
    x: viewport.x - size.width / 2,
    y: viewport.y - size.height / 2,
    ...size
  }
}
