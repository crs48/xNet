/**
 * Tests for Level of Detail (LOD) system
 */

import { describe, it, expect } from 'vitest'
import { calculateLOD, type LODLevel } from '../nodes/CanvasNodeComponent'

describe('calculateLOD', () => {
  it('should return placeholder for zoom < 0.1', () => {
    expect(calculateLOD(0.05)).toBe('placeholder')
    expect(calculateLOD(0.09)).toBe('placeholder')
    expect(calculateLOD(0.01)).toBe('placeholder')
  })

  it('should return minimal for zoom 0.1-0.3', () => {
    expect(calculateLOD(0.1)).toBe('minimal')
    expect(calculateLOD(0.2)).toBe('minimal')
    expect(calculateLOD(0.29)).toBe('minimal')
  })

  it('should return compact for zoom 0.3-0.6', () => {
    expect(calculateLOD(0.3)).toBe('compact')
    expect(calculateLOD(0.45)).toBe('compact')
    expect(calculateLOD(0.59)).toBe('compact')
  })

  it('should return full for zoom >= 0.6', () => {
    expect(calculateLOD(0.6)).toBe('full')
    expect(calculateLOD(1)).toBe('full')
    expect(calculateLOD(2)).toBe('full')
    expect(calculateLOD(4)).toBe('full')
  })

  it('should handle edge cases', () => {
    expect(calculateLOD(0)).toBe('placeholder')
    expect(calculateLOD(0.099999)).toBe('placeholder')
    expect(calculateLOD(0.1)).toBe('minimal')
    expect(calculateLOD(0.299999)).toBe('minimal')
    expect(calculateLOD(0.3)).toBe('compact')
    expect(calculateLOD(0.599999)).toBe('compact')
    expect(calculateLOD(0.6)).toBe('full')
  })
})

describe('LOD levels', () => {
  const levels: LODLevel[] = ['placeholder', 'minimal', 'compact', 'full']

  it('should have exactly 4 LOD levels', () => {
    expect(levels).toHaveLength(4)
  })

  it('should have correct order from least to most detail', () => {
    // Verify the order matches zoom thresholds
    expect(calculateLOD(0.05)).toBe('placeholder')
    expect(calculateLOD(0.15)).toBe('minimal')
    expect(calculateLOD(0.4)).toBe('compact')
    expect(calculateLOD(1)).toBe('full')
  })
})
