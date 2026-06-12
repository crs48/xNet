/**
 * Unified drag payload (exploration 0166).
 *
 * Every draggable entity — explorer row, tab, database row, task,
 * canvas card, editor block — carries the same MIME so any surface can
 * accept any node. Drops create *references*, never copies (Muse's
 * excerpting model): row → canvas makes a source-backed card, page →
 * page makes a reference chip, anything → tab bar opens a tab,
 * anything → editor edge opens a split.
 */

export const XNET_NODE_MIME = 'application/x-xnet-node'

export type NodeTransferSource =
  | 'explorer'
  | 'tab'
  | 'grid-row'
  | 'canvas-card'
  | 'task'
  | 'block'
  | 'shelf'
  | 'palette'

export interface NodeTransfer {
  nodeId: string
  nodeType: string
  /** Display title for drop affordances and shelf entries */
  title?: string
  /** Schema id, when the source knows it (canvas drops need it) */
  schemaId?: string
  sourceContext: NodeTransferSource
}

export function setNodeTransfer(e: DragEvent | React.DragEvent, transfer: NodeTransfer): void {
  const dataTransfer = e.dataTransfer
  if (!dataTransfer) return
  dataTransfer.setData(XNET_NODE_MIME, JSON.stringify(transfer))
  // Degrade gracefully outside the app.
  dataTransfer.setData('text/plain', `xnet://${transfer.nodeType}/${transfer.nodeId}`)
}

export function getNodeTransfer(e: DragEvent | React.DragEvent): NodeTransfer | null {
  const raw = e.dataTransfer?.getData(XNET_NODE_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as NodeTransfer
    if (typeof parsed.nodeId !== 'string' || typeof parsed.nodeType !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

/** Usable during dragover, where payloads are not yet readable. */
export function hasNodeTransfer(e: DragEvent | React.DragEvent): boolean {
  const types = e.dataTransfer?.types
  return Boolean(types && Array.from(types).includes(XNET_NODE_MIME))
}
