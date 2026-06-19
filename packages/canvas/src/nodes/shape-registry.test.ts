import { describe, expect, it } from 'vitest'
import { BUILTIN_SHAPES } from './shape-paths'
import {
  ensureBuiltinShapes,
  hasShape,
  resolveShapePath,
  shapeRegistry,
  shapeTypes,
  type ShapeDefinition
} from './shape-registry'

describe('shapeRegistry', () => {
  it('registers all built-in shapes', () => {
    ensureBuiltinShapes()
    for (const { type } of BUILTIN_SHAPES) {
      expect(hasShape(type)).toBe(true)
    }
    expect(shapeTypes().length).toBeGreaterThanOrEqual(BUILTIN_SHAPES.length)
  })

  it('repopulates built-ins after a clear (no permanent loss)', () => {
    shapeRegistry.clear()
    expect(hasShape('rectangle')).toBe(true)
  })

  it('resolves a built-in shape path', () => {
    const path = resolveShapePath('rectangle', 100, 50)
    expect(path).toBe('M 0 0 H 100 V 50 H 0 Z')
  })

  it('falls back to a rectangle for an unknown shape', () => {
    const path = resolveShapePath('does-not-exist', 100, 50)
    expect(path).toBe('M 0 0 H 100 V 50 H 0 Z')
  })

  it('lets a plugin register a new shape with no core change', () => {
    const pentagon: ShapeDefinition = {
      type: 'pentagon',
      label: 'Pentagon',
      buildPath: (w, h) => `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`
    }
    const disposable = shapeRegistry.register(pentagon)
    try {
      expect(hasShape('pentagon')).toBe(true)
      expect(shapeTypes().map((s) => s.type)).toContain('pentagon')
      expect(resolveShapePath('pentagon', 10, 10)).toBe('M 5 0 L 10 10 L 0 10 Z')
    } finally {
      disposable.dispose()
    }
    expect(hasShape('pentagon')).toBe(false)
  })
})
