import type { Node as ProseMirrorNode, Mark } from '@tiptap/pm/model'

export interface MarkRange {
  from: number
  to: number
  mark: Mark
}

/**
 * Find the continuous range of a mark around a position.
 *
 * Given a position inside marked text, finds where the mark starts and ends.
 * Handles cases where the same mark type spans multiple text nodes.
 */
export function findMarkRange(
  doc: ProseMirrorNode,
  pos: number,
  markType: string
): MarkRange | null {
  const $pos = doc.resolve(pos)

  // Get the mark at this position
  const marks = $pos.marks()
  const targetMark = marks.find((m) => m.type.name === markType)

  if (!targetMark) return null

  // Scan the parent block to find the extent of this mark
  const blockStart = $pos.start()
  const blockEnd = $pos.end()

  let markStart = -1
  let markEnd = -1
  let foundPos = false

  doc.nodesBetween(blockStart, blockEnd, (node, nodePos) => {
    if (!node.isText) return true

    const nodeEnd = nodePos + node.nodeSize
    const hasMark = node.marks.some((m) => m.type.name === markType)
    const containsPos = pos >= nodePos && pos <= nodeEnd

    if (hasMark) {
      if (markStart === -1 || (foundPos && nodePos > markEnd)) {
        if (foundPos) return false // Stop if we've moved past our range
        markStart = nodePos
      }
      markEnd = nodeEnd

      if (containsPos) {
        foundPos = true
      }
    } else if (foundPos) {
      return false
    } else {
      markStart = -1
      markEnd = -1
    }

    return true
  })

  if (markStart === -1 || markEnd === -1 || !foundPos) {
    return null
  }

  return { from: markStart, to: markEnd, mark: targetMark }
}
