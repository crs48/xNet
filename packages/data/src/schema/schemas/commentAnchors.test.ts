import { describe, it, expect } from 'vitest'
import {
  encodeAnchor,
  decodeAnchor,
  isTextAnchor,
  isCellAnchor,
  isRowAnchor,
  isColumnAnchor,
  isCanvasPositionAnchor,
  isCanvasObjectAnchor,
  isNodeAnchor,
  type TextAnchor,
  type CellAnchor,
  type RowAnchor,
  type ColumnAnchor,
  type CanvasPositionAnchor,
  type CanvasObjectAnchor,
  type NodeAnchor,
  type AnchorData
} from './commentAnchors'

describe('Comment Anchors', () => {
  // ─── Sample Anchors ─────────────────────────────────────────────────────────

  const textAnchor: TextAnchor = {
    startRelative: 'QWxpY2U=', // Base64 encoded
    endRelative: 'Qm9i',
    quotedText: 'selected text'
  }

  const cellAnchor: CellAnchor = {
    rowId: 'row-abc123',
    propertyKey: 'status'
  }

  const rowAnchor: RowAnchor = {
    rowId: 'row-def456'
  }

  const columnAnchor: ColumnAnchor = {
    propertyKey: 'priority'
  }

  const canvasPositionAnchor: CanvasPositionAnchor = {
    x: 100.5,
    y: 200.75
  }

  const canvasObjectAnchor: CanvasObjectAnchor = {
    objectId: 'shape-xyz',
    offsetX: 10,
    offsetY: 20
  }

  const nodeAnchor: NodeAnchor = {}

  // ─── Encode/Decode ──────────────────────────────────────────────────────────

  describe('encodeAnchor', () => {
    it('encodes text anchor to JSON string', () => {
      const encoded = encodeAnchor(textAnchor)
      expect(encoded).toBe(JSON.stringify(textAnchor))
      expect(JSON.parse(encoded)).toEqual(textAnchor)
    })

    it('encodes cell anchor to JSON string', () => {
      const encoded = encodeAnchor(cellAnchor)
      expect(JSON.parse(encoded)).toEqual(cellAnchor)
    })

    it('encodes canvas position anchor to JSON string', () => {
      const encoded = encodeAnchor(canvasPositionAnchor)
      expect(JSON.parse(encoded)).toEqual(canvasPositionAnchor)
    })

    it('encodes empty node anchor to empty object', () => {
      const encoded = encodeAnchor(nodeAnchor)
      expect(encoded).toBe('{}')
    })
  })

  describe('decodeAnchor', () => {
    it('decodes text anchor from JSON string', () => {
      const encoded = JSON.stringify(textAnchor)
      const decoded = decodeAnchor<TextAnchor>(encoded)
      expect(decoded).toEqual(textAnchor)
    })

    it('decodes cell anchor from JSON string', () => {
      const encoded = JSON.stringify(cellAnchor)
      const decoded = decodeAnchor<CellAnchor>(encoded)
      expect(decoded).toEqual(cellAnchor)
    })

    it('decodes canvas object anchor with optional fields', () => {
      const withOffset = JSON.stringify(canvasObjectAnchor)
      const decoded = decodeAnchor<CanvasObjectAnchor>(withOffset)
      expect(decoded.objectId).toBe('shape-xyz')
      expect(decoded.offsetX).toBe(10)
      expect(decoded.offsetY).toBe(20)
    })

    it('decodes canvas object anchor without optional fields', () => {
      const minimal: CanvasObjectAnchor = { objectId: 'shape-123' }
      const encoded = JSON.stringify(minimal)
      const decoded = decodeAnchor<CanvasObjectAnchor>(encoded)
      expect(decoded.objectId).toBe('shape-123')
      expect(decoded.offsetX).toBeUndefined()
      expect(decoded.offsetY).toBeUndefined()
    })
  })

  describe('roundtrip encode/decode', () => {
    it('preserves text anchor through roundtrip', () => {
      const decoded = decodeAnchor<TextAnchor>(encodeAnchor(textAnchor))
      expect(decoded).toEqual(textAnchor)
    })

    it('preserves cell anchor through roundtrip', () => {
      const decoded = decodeAnchor<CellAnchor>(encodeAnchor(cellAnchor))
      expect(decoded).toEqual(cellAnchor)
    })

    it('preserves row anchor through roundtrip', () => {
      const decoded = decodeAnchor<RowAnchor>(encodeAnchor(rowAnchor))
      expect(decoded).toEqual(rowAnchor)
    })

    it('preserves column anchor through roundtrip', () => {
      const decoded = decodeAnchor<ColumnAnchor>(encodeAnchor(columnAnchor))
      expect(decoded).toEqual(columnAnchor)
    })

    it('preserves canvas position anchor through roundtrip', () => {
      const decoded = decodeAnchor<CanvasPositionAnchor>(encodeAnchor(canvasPositionAnchor))
      expect(decoded).toEqual(canvasPositionAnchor)
    })

    it('preserves canvas object anchor through roundtrip', () => {
      const decoded = decodeAnchor<CanvasObjectAnchor>(encodeAnchor(canvasObjectAnchor))
      expect(decoded).toEqual(canvasObjectAnchor)
    })

    it('preserves node anchor through roundtrip', () => {
      const decoded = decodeAnchor<NodeAnchor>(encodeAnchor(nodeAnchor))
      expect(decoded).toEqual(nodeAnchor)
    })
  })

  // ─── Type Guards ────────────────────────────────────────────────────────────

  describe('isTextAnchor', () => {
    it('returns true for text anchors', () => {
      expect(isTextAnchor(textAnchor)).toBe(true)
    })

    it('returns false for non-text anchors', () => {
      expect(isTextAnchor(cellAnchor)).toBe(false)
      expect(isTextAnchor(rowAnchor)).toBe(false)
      expect(isTextAnchor(canvasPositionAnchor)).toBe(false)
      expect(isTextAnchor(nodeAnchor)).toBe(false)
    })
  })

  describe('isCellAnchor', () => {
    it('returns true for cell anchors', () => {
      expect(isCellAnchor(cellAnchor)).toBe(true)
    })

    it('returns false for non-cell anchors', () => {
      expect(isCellAnchor(textAnchor)).toBe(false)
      expect(isCellAnchor(rowAnchor)).toBe(false)
      expect(isCellAnchor(columnAnchor)).toBe(false)
      expect(isCellAnchor(nodeAnchor)).toBe(false)
    })
  })

  describe('isRowAnchor', () => {
    it('returns true for row anchors', () => {
      expect(isRowAnchor(rowAnchor)).toBe(true)
    })

    it('returns false for non-row anchors', () => {
      expect(isRowAnchor(textAnchor)).toBe(false)
      expect(isRowAnchor(cellAnchor)).toBe(false) // has propertyKey
      expect(isRowAnchor(columnAnchor)).toBe(false)
      expect(isRowAnchor(nodeAnchor)).toBe(false)
    })
  })

  describe('isColumnAnchor', () => {
    it('returns true for column anchors', () => {
      expect(isColumnAnchor(columnAnchor)).toBe(true)
    })

    it('returns false for non-column anchors', () => {
      expect(isColumnAnchor(textAnchor)).toBe(false)
      expect(isColumnAnchor(cellAnchor)).toBe(false) // has rowId
      expect(isColumnAnchor(rowAnchor)).toBe(false)
      expect(isColumnAnchor(nodeAnchor)).toBe(false)
    })
  })

  describe('isCanvasPositionAnchor', () => {
    it('returns true for canvas position anchors', () => {
      expect(isCanvasPositionAnchor(canvasPositionAnchor)).toBe(true)
    })

    it('returns false for non-canvas-position anchors', () => {
      expect(isCanvasPositionAnchor(textAnchor)).toBe(false)
      expect(isCanvasPositionAnchor(cellAnchor)).toBe(false)
      expect(isCanvasPositionAnchor(canvasObjectAnchor)).toBe(false) // has objectId
      expect(isCanvasPositionAnchor(nodeAnchor)).toBe(false)
    })
  })

  describe('isCanvasObjectAnchor', () => {
    it('returns true for canvas object anchors', () => {
      expect(isCanvasObjectAnchor(canvasObjectAnchor)).toBe(true)
    })

    it('returns true for canvas object anchor without offsets', () => {
      const minimal: CanvasObjectAnchor = { objectId: 'obj-123' }
      expect(isCanvasObjectAnchor(minimal)).toBe(true)
    })

    it('returns false for non-canvas-object anchors', () => {
      expect(isCanvasObjectAnchor(textAnchor)).toBe(false)
      expect(isCanvasObjectAnchor(cellAnchor)).toBe(false)
      expect(isCanvasObjectAnchor(canvasPositionAnchor)).toBe(false)
      expect(isCanvasObjectAnchor(nodeAnchor)).toBe(false)
    })
  })

  describe('isNodeAnchor', () => {
    it('returns true for empty object (node anchor)', () => {
      expect(isNodeAnchor(nodeAnchor)).toBe(true)
      expect(isNodeAnchor({})).toBe(true)
    })

    it('returns false for non-empty objects', () => {
      expect(isNodeAnchor(textAnchor)).toBe(false)
      expect(isNodeAnchor(cellAnchor)).toBe(false)
      expect(isNodeAnchor(canvasPositionAnchor)).toBe(false)
    })
  })

  // ─── Type Guard Discrimination ──────────────────────────────────────────────

  describe('type discrimination', () => {
    it('can identify anchor type from decoded data', () => {
      const anchors: AnchorData[] = [
        textAnchor,
        cellAnchor,
        rowAnchor,
        columnAnchor,
        canvasPositionAnchor,
        canvasObjectAnchor,
        nodeAnchor
      ]

      const identifyType = (anchor: AnchorData): string => {
        if (isTextAnchor(anchor)) return 'text'
        if (isCellAnchor(anchor)) return 'cell'
        if (isRowAnchor(anchor)) return 'row'
        if (isColumnAnchor(anchor)) return 'column'
        if (isCanvasObjectAnchor(anchor)) return 'canvas-object'
        if (isCanvasPositionAnchor(anchor)) return 'canvas-position'
        if (isNodeAnchor(anchor)) return 'node'
        return 'unknown'
      }

      expect(identifyType(anchors[0])).toBe('text')
      expect(identifyType(anchors[1])).toBe('cell')
      expect(identifyType(anchors[2])).toBe('row')
      expect(identifyType(anchors[3])).toBe('column')
      expect(identifyType(anchors[4])).toBe('canvas-position')
      expect(identifyType(anchors[5])).toBe('canvas-object')
      expect(identifyType(anchors[6])).toBe('node')
    })

    it('works with decoded JSON data', () => {
      const encodedText = encodeAnchor(textAnchor)
      const decoded = decodeAnchor<AnchorData>(encodedText)

      expect(isTextAnchor(decoded)).toBe(true)
      if (isTextAnchor(decoded)) {
        expect(decoded.quotedText).toBe('selected text')
      }
    })
  })

  // ─── Edge Cases ─────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles text anchor with empty quoted text', () => {
      const emptyQuote: TextAnchor = {
        startRelative: 'abc',
        endRelative: 'def',
        quotedText: ''
      }
      expect(isTextAnchor(emptyQuote)).toBe(true)
      const decoded = decodeAnchor<TextAnchor>(encodeAnchor(emptyQuote))
      expect(decoded.quotedText).toBe('')
    })

    it('handles canvas position with zero coordinates', () => {
      const zeroPos: CanvasPositionAnchor = { x: 0, y: 0 }
      expect(isCanvasPositionAnchor(zeroPos)).toBe(true)
      const decoded = decodeAnchor<CanvasPositionAnchor>(encodeAnchor(zeroPos))
      expect(decoded.x).toBe(0)
      expect(decoded.y).toBe(0)
    })

    it('handles canvas position with negative coordinates', () => {
      const negPos: CanvasPositionAnchor = { x: -50, y: -100 }
      expect(isCanvasPositionAnchor(negPos)).toBe(true)
      const decoded = decodeAnchor<CanvasPositionAnchor>(encodeAnchor(negPos))
      expect(decoded.x).toBe(-50)
      expect(decoded.y).toBe(-100)
    })

    it('handles canvas object with zero offset', () => {
      const zeroOffset: CanvasObjectAnchor = {
        objectId: 'obj-123',
        offsetX: 0,
        offsetY: 0
      }
      expect(isCanvasObjectAnchor(zeroOffset)).toBe(true)
      const decoded = decodeAnchor<CanvasObjectAnchor>(encodeAnchor(zeroOffset))
      expect(decoded.offsetX).toBe(0)
      expect(decoded.offsetY).toBe(0)
    })
  })
})
