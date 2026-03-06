import type { CanvasNode } from '@xnetjs/canvas'

export type LinkedDocType = 'page' | 'database' | 'canvas'

export type LinkedDocumentItem = {
  id: string
  title: string
  type: LinkedDocType
}

const SHELL_NOTE_ROLE = 'canvas-note'

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
