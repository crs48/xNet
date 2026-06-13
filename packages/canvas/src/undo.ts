/**
 * Canvas undo/redo (exploration 0179)
 *
 * The canvas scene lives in a Y.Doc (objects + connectors + metadata maps),
 * mutated through `ydoc.transact(...)`. A Y.UndoManager scoped to those maps
 * gives the canvas a document-local undo stack that:
 *
 * - tracks only local edits (remote peers' changes carry a provider origin
 *   and are excluded by default), so undo never reverts a collaborator, and
 * - coalesces rapid edits within `captureTimeout`, so a drag — which emits a
 *   stream of position updates — collapses into a single undo step.
 *
 * The app routes Cmd+Z to this stack via a focus-scoped 'surface:canvas'
 * command (see CanvasView); everywhere else Cmd+Z falls through to the
 * app-wide node-store undo.
 */

import * as Y from 'yjs'
import { ensureCanvasDocMaps } from './scene/doc-layout'

/** How long consecutive canvas edits merge into one undo step (ms). */
export const CANVAS_UNDO_CAPTURE_TIMEOUT_MS = 400

/**
 * Create a Y.UndoManager for a canvas document, scoped to the scene maps.
 * Caller owns the returned manager and must call `destroy()` when the doc
 * is released.
 */
export function createCanvasUndoManager(doc: Y.Doc): Y.UndoManager {
  const maps = ensureCanvasDocMaps(doc)

  return new Y.UndoManager([maps.objects, maps.connectors, maps.metadata], {
    captureTimeout: CANVAS_UNDO_CAPTURE_TIMEOUT_MS
  })
}
