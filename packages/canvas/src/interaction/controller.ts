/**
 * First-class command boundary for direct canvas interactions.
 */

import type { CanvasObjectAnchorPlacement, Point, Rect, ResizeHandle } from '../types'

export type CanvasInteractionPhase = 'start' | 'preview' | 'commit' | 'cancel'

export type CanvasInteractionUndoScope = 'scene' | 'selection' | 'preview'

export type CanvasSelectionInteractionMode = 'replace' | 'add' | 'remove' | 'toggle'

export type CanvasSnapGuideSource = 'grid' | 'object' | 'frame' | 'spacing'

export type CanvasSnapGuide = {
  id: string
  source: CanvasSnapGuideSource
  orientation: 'horizontal' | 'vertical'
  position: number
  label?: string
}

export type CanvasSnapState = {
  enabled: boolean
  gridSize?: number
  disabledByModifier?: boolean
  guides?: CanvasSnapGuide[]
}

export type CanvasInteractionConnectorEndpoint = {
  nodeId: string
  placement?: CanvasObjectAnchorPlacement
  anchorId?: string
}

export type CanvasSelectCommand = {
  kind: 'select'
  nodeIds: string[]
  mode: CanvasSelectionInteractionMode
  focusNodeId?: string
}

export type CanvasMoveCommand = {
  kind: 'move'
  phase: CanvasInteractionPhase
  nodeIds: string[]
  screenDelta: Point
  canvasDelta?: Point
  snap?: CanvasSnapState
  undoGroupId?: string
}

export type CanvasResizeCommand = {
  kind: 'resize'
  phase: CanvasInteractionPhase
  nodeId: string
  handle: ResizeHandle
  screenDelta: Point
  canvasDelta?: Point
  bounds?: Rect
  snap?: CanvasSnapState
  undoGroupId?: string
}

export type CanvasConnectCommand = {
  kind: 'connect'
  phase: CanvasInteractionPhase
  source: CanvasInteractionConnectorEndpoint
  target?: CanvasInteractionConnectorEndpoint
  snap?: CanvasSnapState
  undoGroupId?: string
}

export type CanvasSnapCommand = {
  kind: 'snap'
  phase: Extract<CanvasInteractionPhase, 'preview' | 'commit' | 'cancel'>
  subject: 'move' | 'resize' | 'connect'
  nodeIds: string[]
  snap: CanvasSnapState
}

export type CanvasNudgeCommand = {
  kind: 'nudge'
  nodeIds: string[]
  canvasDelta: Point
  step: 'small' | 'large'
  snap?: CanvasSnapState
  undoGroupId?: string
}

export type CanvasUndoGroupCommand = {
  kind: 'undo-group'
  phase: 'begin' | 'commit' | 'cancel'
  groupId: string
  scope: CanvasInteractionUndoScope
  reason?: string
}

export type CanvasInteractionCommand =
  | CanvasSelectCommand
  | CanvasMoveCommand
  | CanvasResizeCommand
  | CanvasConnectCommand
  | CanvasSnapCommand
  | CanvasNudgeCommand
  | CanvasUndoGroupCommand

export type CanvasInteractionCommandKind = CanvasInteractionCommand['kind']

export type CanvasInteractionResult = {
  handled: boolean
  changed: boolean
  undoGroupId?: string
  reason?: string
}

export type CanvasInteractionHandlerMap = {
  [Kind in CanvasInteractionCommandKind]?: (
    command: Extract<CanvasInteractionCommand, { kind: Kind }>
  ) => CanvasInteractionResult
}

export type CanvasInteractionController = {
  dispatch: (command: CanvasInteractionCommand) => CanvasInteractionResult
  canHandle: (kind: CanvasInteractionCommandKind) => boolean
}

export function createCanvasInteractionResult(
  input: Partial<CanvasInteractionResult> = {}
): CanvasInteractionResult {
  const result: CanvasInteractionResult = {
    handled: input.handled ?? true,
    changed: input.changed ?? false
  }

  if (input.undoGroupId) {
    result.undoGroupId = input.undoGroupId
  }

  if (input.reason) {
    result.reason = input.reason
  }

  return result
}

export function createCanvasInteractionController(
  handlers: CanvasInteractionHandlerMap
): CanvasInteractionController {
  return {
    canHandle: (kind) => typeof handlers[kind] === 'function',
    dispatch: (command) => {
      const handler = handlers[command.kind] as
        | ((nextCommand: CanvasInteractionCommand) => CanvasInteractionResult)
        | undefined

      if (!handler) {
        return createCanvasInteractionResult({
          handled: false,
          reason: `No canvas interaction handler registered for ${command.kind}`
        })
      }

      return handler(command)
    }
  }
}

export function getCanvasInteractionUndoGroupId(
  command: CanvasInteractionCommand
): string | undefined {
  if (command.kind === 'undo-group') {
    return command.groupId
  }

  if ('undoGroupId' in command) {
    return command.undoGroupId
  }

  return undefined
}
