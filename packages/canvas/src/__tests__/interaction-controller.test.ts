import { describe, expect, it, vi } from 'vitest'
import {
  createCanvasInteractionController,
  createCanvasInteractionResult,
  getCanvasInteractionUndoGroupId
} from '../interaction/controller'

describe('canvas interaction controller', () => {
  it('should dispatch typed interaction commands to registered handlers', () => {
    const handleSelect = vi.fn(() => createCanvasInteractionResult({ changed: true }))
    const handleMove = vi.fn(() =>
      createCanvasInteractionResult({
        changed: true,
        undoGroupId: 'drag-1'
      })
    )
    const controller = createCanvasInteractionController({
      select: handleSelect,
      move: handleMove
    })

    expect(controller.canHandle('select')).toBe(true)
    expect(controller.canHandle('resize')).toBe(false)

    expect(
      controller.dispatch({
        kind: 'select',
        nodeIds: ['node-1'],
        mode: 'replace'
      })
    ).toEqual({
      handled: true,
      changed: true
    })

    expect(
      controller.dispatch({
        kind: 'move',
        phase: 'commit',
        nodeIds: ['node-1'],
        screenDelta: { x: 24, y: 12 },
        canvasDelta: { x: 12, y: 6 },
        undoGroupId: 'drag-1'
      })
    ).toEqual({
      handled: true,
      changed: true,
      undoGroupId: 'drag-1'
    })

    expect(handleSelect).toHaveBeenCalledWith({
      kind: 'select',
      nodeIds: ['node-1'],
      mode: 'replace'
    })
    expect(handleMove).toHaveBeenCalledWith({
      kind: 'move',
      phase: 'commit',
      nodeIds: ['node-1'],
      screenDelta: { x: 24, y: 12 },
      canvasDelta: { x: 12, y: 6 },
      undoGroupId: 'drag-1'
    })
  })

  it('should return an unhandled result when no handler exists', () => {
    const controller = createCanvasInteractionController({})

    expect(
      controller.dispatch({
        kind: 'nudge',
        nodeIds: ['node-1'],
        canvasDelta: { x: 1, y: 0 },
        step: 'small'
      })
    ).toEqual({
      handled: false,
      changed: false,
      reason: 'No canvas interaction handler registered for nudge'
    })
  })

  it('should expose undo group ids across interaction command shapes', () => {
    expect(
      getCanvasInteractionUndoGroupId({
        kind: 'resize',
        phase: 'commit',
        nodeId: 'node-1',
        handle: 'bottom-right',
        screenDelta: { x: 10, y: 10 },
        undoGroupId: 'resize-1'
      })
    ).toBe('resize-1')

    expect(
      getCanvasInteractionUndoGroupId({
        kind: 'undo-group',
        phase: 'begin',
        groupId: 'keyboard-1',
        scope: 'selection'
      })
    ).toBe('keyboard-1')

    expect(
      getCanvasInteractionUndoGroupId({
        kind: 'snap',
        phase: 'preview',
        subject: 'move',
        nodeIds: ['node-1'],
        snap: {
          enabled: true,
          guides: [
            {
              id: 'guide-1',
              source: 'grid',
              orientation: 'vertical',
              position: 120
            }
          ]
        }
      })
    ).toBeUndefined()
  })
})
