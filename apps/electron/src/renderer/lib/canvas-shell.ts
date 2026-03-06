import type { CanvasNode } from '@xnetjs/canvas'

export type LinkedDocType = 'page' | 'database' | 'canvas'

export type LinkedDocumentItem = {
  id: string
  title: string
  type: LinkedDocType
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
  return node.type === 'card' && node.properties.shellRole === SHELL_NOTE_ROLE
}

export function shouldRenderCanvasShellCard(
  node: CanvasNode,
  linkedDocument?: LinkedDocumentItem
): boolean {
  return Boolean(linkedDocument) || isCanvasShellNote(node)
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
