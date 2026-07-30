/**
 * Inline-surface activation rules (exploration 0277, E4): a selected
 * page/note/database card upgrades to a live editing surface only when
 * it is the sole selection, rendered at full detail, and the viewport is
 * close enough to read it.
 */

import type { CanvasViewDisplayType } from './useCanvasViewController.js'
import type { CanvasNode, CanvasNodeRenderContext } from '@xnetjs/canvas'
import {
  getCanvasShellDisplayType,
  getCanvasShellSourceId,
  type LinkedDocType,
  type LinkedDocumentItem
} from './canvas-shell.js'

export type PeekableCanvasDisplayType = LinkedDocType | 'note'

export function isPeekableCanvasDisplayType(
  displayType: CanvasViewDisplayType
): displayType is PeekableCanvasDisplayType {
  return displayType === 'page' || displayType === 'database' || displayType === 'note'
}

export function shouldActivateInlinePageSurface(
  node: CanvasNode,
  context: CanvasNodeRenderContext,
  linkedDocument?: LinkedDocumentItem
): boolean {
  const displayType = getCanvasShellDisplayType(node, linkedDocument)
  const sourceId = getCanvasShellSourceId(node)

  if (!sourceId) {
    return false
  }

  if (displayType !== 'page' && displayType !== 'note') {
    return false
  }

  return (
    context.selected &&
    context.selectionSize === 1 &&
    context.lod === 'full' &&
    context.viewportZoom >= 0.9
  )
}

export function shouldActivateDatabasePreviewSurface(
  node: CanvasNode,
  context: CanvasNodeRenderContext,
  linkedDocument?: LinkedDocumentItem
): boolean {
  const displayType = getCanvasShellDisplayType(node, linkedDocument)
  const sourceId = getCanvasShellSourceId(node)

  if (!sourceId || displayType !== 'database') {
    return false
  }

  return (
    context.selected &&
    context.selectionSize === 1 &&
    context.lod === 'full' &&
    context.viewportZoom >= 0.9
  )
}
