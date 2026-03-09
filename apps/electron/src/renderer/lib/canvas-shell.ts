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

const SHELL_NOTE_ROLE = 'canvas-note'

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
