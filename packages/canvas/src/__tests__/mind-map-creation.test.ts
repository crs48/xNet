import { describe, expect, it } from 'vitest'
import {
  CANVAS_MIND_MAP_CREATION_TOOL,
  createCanvasMindMapBranchProperties,
  createCanvasMindMapRootProperties,
  getCanvasMindMapKeyboardIntent
} from '../mind-map/creation'

describe('canvas mind map creation', () => {
  it('describes the mind-map creation tool and expected keyboard workflow', () => {
    expect(CANVAS_MIND_MAP_CREATION_TOOL).toMatchObject({
      id: 'mind-map',
      label: 'Mind map',
      objectKind: 'shape',
      shapeType: 'rounded-rectangle',
      rootRect: {
        width: 280,
        height: 120
      },
      branchRect: {
        width: 220,
        height: 88
      }
    })
    expect(CANVAS_MIND_MAP_CREATION_TOOL.shortcuts).toEqual([
      'M',
      'Tab',
      'Enter',
      'Shift+Tab',
      'ArrowUp',
      'ArrowDown'
    ])
  })

  it('creates root and branch properties for shape-backed mind-map nodes', () => {
    const root = createCanvasMindMapRootProperties({
      title: 'Launch plan',
      mapId: 'mindmap-launch'
    })
    const child = createCanvasMindMapBranchProperties({
      title: 'Risks',
      mapId: root.mindMap.mapId,
      parentId: 'root-node',
      depth: 1,
      index: 2,
      direction: 'down'
    })

    expect(root).toEqual({
      title: 'Launch plan',
      label: 'Launch plan',
      shapeType: 'rounded-rectangle',
      mindMap: {
        mapId: 'mindmap-launch',
        role: 'root',
        parentId: null,
        depth: 0,
        index: 0,
        direction: 'right',
        collapsed: false
      }
    })
    expect(child).toEqual({
      title: 'Risks',
      label: 'Risks',
      shapeType: 'rounded-rectangle',
      mindMap: {
        mapId: 'mindmap-launch',
        role: 'branch',
        parentId: 'root-node',
        depth: 1,
        index: 2,
        direction: 'down',
        collapsed: false
      }
    })
  })

  it('maps keyboard events into mind-map creation and navigation intents', () => {
    expect(
      getCanvasMindMapKeyboardIntent({
        key: 'm',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false
      })
    ).toBe('create-root')
    expect(
      getCanvasMindMapKeyboardIntent({
        key: 'Tab',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false
      })
    ).toBe('create-child')
    expect(
      getCanvasMindMapKeyboardIntent({
        key: 'Enter',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false
      })
    ).toBe('create-sibling')
    expect(
      getCanvasMindMapKeyboardIntent({
        key: 'Tab',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: true
      })
    ).toBe('focus-parent')
    expect(
      getCanvasMindMapKeyboardIntent({
        key: 'm',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false
      })
    ).toBeNull()
  })
})
