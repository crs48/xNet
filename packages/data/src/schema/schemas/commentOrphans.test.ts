/**
 * Tests for comment orphan detection utilities.
 */
import { describe, it, expect } from 'vitest'
import {
  encodeAnchor,
  type TextAnchor,
  type CellAnchor,
  type RowAnchor,
  type ColumnAnchor,
  type CanvasObjectAnchor,
  type CanvasPositionAnchor
} from './commentAnchors'
import { checkOrphanStatus, filterOrphanedComments, type OrphanResolvers } from './commentOrphans'

// ─── checkOrphanStatus ─────────────────────────────────────────────────────────

describe('checkOrphanStatus', () => {
  describe('text anchors', () => {
    const textAnchor: TextAnchor = {
      startRelative: 'abc123',
      endRelative: 'def456',
      quotedText: 'The quick brown fox'
    }
    const anchorData = encodeAnchor(textAnchor)

    it('should return not orphaned when resolver returns positions', () => {
      const resolvers: OrphanResolvers = {
        resolveTextAnchor: () => ({ from: 10, to: 20 })
      }
      const status = checkOrphanStatus('text', anchorData, resolvers)
      expect(status.orphaned).toBe(false)
    })

    it('should return orphaned when resolver returns null', () => {
      const resolvers: OrphanResolvers = {
        resolveTextAnchor: () => null
      }
      const status = checkOrphanStatus('text', anchorData, resolvers)
      expect(status.orphaned).toBe(true)
      expect(status.reason).toBe('text-deleted')
      expect(status.context).toBe('The quick brown fox')
    })

    it('should return not orphaned when no resolver provided', () => {
      const status = checkOrphanStatus('text', anchorData, {})
      expect(status.orphaned).toBe(false)
    })
  })

  describe('cell anchors', () => {
    const cellAnchor: CellAnchor = { rowId: 'row-123', propertyKey: 'status' }
    const anchorData = encodeAnchor(cellAnchor)

    it('should return not orphaned when row and column exist', () => {
      const resolvers: OrphanResolvers = {
        rowExists: () => true,
        columnExists: () => true
      }
      const status = checkOrphanStatus('cell', anchorData, resolvers)
      expect(status.orphaned).toBe(false)
    })

    it('should return orphaned when row is deleted', () => {
      const resolvers: OrphanResolvers = {
        rowExists: () => false,
        columnExists: () => true
      }
      const status = checkOrphanStatus('cell', anchorData, resolvers)
      expect(status.orphaned).toBe(true)
      expect(status.reason).toBe('row-deleted')
    })

    it('should return orphaned when column is deleted', () => {
      const resolvers: OrphanResolvers = {
        rowExists: () => true,
        columnExists: () => false
      }
      const status = checkOrphanStatus('cell', anchorData, resolvers)
      expect(status.orphaned).toBe(true)
      expect(status.reason).toBe('column-deleted')
      expect(status.context).toBe('Column "status"')
    })

    it('should check row before column (row deletion takes priority)', () => {
      const resolvers: OrphanResolvers = {
        rowExists: () => false,
        columnExists: () => false
      }
      const status = checkOrphanStatus('cell', anchorData, resolvers)
      expect(status.reason).toBe('row-deleted')
    })
  })

  describe('row anchors', () => {
    const rowAnchor: RowAnchor = { rowId: 'row-456' }
    const anchorData = encodeAnchor(rowAnchor)

    it('should return not orphaned when row exists', () => {
      const resolvers: OrphanResolvers = { rowExists: () => true }
      const status = checkOrphanStatus('row', anchorData, resolvers)
      expect(status.orphaned).toBe(false)
    })

    it('should return orphaned when row is deleted', () => {
      const resolvers: OrphanResolvers = { rowExists: () => false }
      const status = checkOrphanStatus('row', anchorData, resolvers)
      expect(status.orphaned).toBe(true)
      expect(status.reason).toBe('row-deleted')
    })
  })

  describe('column anchors', () => {
    const columnAnchor: ColumnAnchor = { propertyKey: 'title' }
    const anchorData = encodeAnchor(columnAnchor)

    it('should return not orphaned when column exists', () => {
      const resolvers: OrphanResolvers = { columnExists: () => true }
      const status = checkOrphanStatus('column', anchorData, resolvers)
      expect(status.orphaned).toBe(false)
    })

    it('should return orphaned when column is deleted', () => {
      const resolvers: OrphanResolvers = { columnExists: () => false }
      const status = checkOrphanStatus('column', anchorData, resolvers)
      expect(status.orphaned).toBe(true)
      expect(status.reason).toBe('column-deleted')
    })
  })

  describe('canvas object anchors', () => {
    const objectAnchor: CanvasObjectAnchor = { objectId: 'obj-789' }
    const anchorData = encodeAnchor(objectAnchor)

    it('should return not orphaned when object exists', () => {
      const resolvers: OrphanResolvers = { objectExists: () => true }
      const status = checkOrphanStatus('canvas-object', anchorData, resolvers)
      expect(status.orphaned).toBe(false)
    })

    it('should return orphaned when object is deleted', () => {
      const resolvers: OrphanResolvers = { objectExists: () => false }
      const status = checkOrphanStatus('canvas-object', anchorData, resolvers)
      expect(status.orphaned).toBe(true)
      expect(status.reason).toBe('object-deleted')
    })
  })

  describe('canvas position anchors', () => {
    const positionAnchor: CanvasPositionAnchor = { x: 100, y: 200 }
    const anchorData = encodeAnchor(positionAnchor)

    it('should never be orphaned (coordinates are absolute)', () => {
      const status = checkOrphanStatus('canvas-position', anchorData, {})
      expect(status.orphaned).toBe(false)
    })
  })

  describe('node anchors', () => {
    it('should never be orphaned (points to target node itself)', () => {
      const status = checkOrphanStatus('node', '{}', {})
      expect(status.orphaned).toBe(false)
    })
  })

  describe('invalid anchor data', () => {
    it('should return orphaned with invalid-anchor reason', () => {
      const status = checkOrphanStatus('cell', 'invalid-json', {})
      expect(status.orphaned).toBe(true)
      expect(status.reason).toBe('invalid-anchor')
    })

    it('should handle malformed anchor data gracefully', () => {
      const status = checkOrphanStatus('row', '{not: "valid"}', { rowExists: () => true })
      // The decode might fail or rowId might be undefined
      expect(status).toBeDefined()
    })
  })

  describe('unknown anchor types', () => {
    it('should return not orphaned for unknown types', () => {
      const status = checkOrphanStatus('unknown-type', '{}', {})
      expect(status.orphaned).toBe(false)
    })
  })
})

// ─── filterOrphanedComments ────────────────────────────────────────────────────

describe('filterOrphanedComments', () => {
  interface MockComment {
    id: string
    properties: {
      anchorType: string
      anchorData: string
    }
  }

  const makeComment = (id: string, anchorType: string, anchorData: object): MockComment => ({
    id,
    properties: {
      anchorType,
      anchorData: encodeAnchor(anchorData)
    }
  })

  it('should separate active from orphaned comments', () => {
    const comments: MockComment[] = [
      makeComment('1', 'row', { rowId: 'exists' }),
      makeComment('2', 'row', { rowId: 'deleted' }),
      makeComment('3', 'row', { rowId: 'exists' }),
      makeComment('4', 'row', { rowId: 'deleted' })
    ]

    const resolvers: OrphanResolvers = {
      rowExists: (id) => id === 'exists'
    }

    const { active, orphaned } = filterOrphanedComments(comments, resolvers)

    expect(active).toHaveLength(2)
    expect(active[0].id).toBe('1')
    expect(active[1].id).toBe('3')

    expect(orphaned).toHaveLength(2)
    expect(orphaned[0].comment.id).toBe('2')
    expect(orphaned[0].status.reason).toBe('row-deleted')
    expect(orphaned[1].comment.id).toBe('4')
  })

  it('should return all active when nothing is orphaned', () => {
    const comments: MockComment[] = [
      makeComment('1', 'canvas-position', { x: 0, y: 0 }),
      makeComment('2', 'node', {})
    ]

    const { active, orphaned } = filterOrphanedComments(comments, {})

    expect(active).toHaveLength(2)
    expect(orphaned).toHaveLength(0)
  })

  it('should return all orphaned when everything is orphaned', () => {
    const comments: MockComment[] = [
      makeComment('1', 'row', { rowId: 'gone' }),
      makeComment('2', 'row', { rowId: 'gone' })
    ]

    const resolvers: OrphanResolvers = {
      rowExists: () => false
    }

    const { active, orphaned } = filterOrphanedComments(comments, resolvers)

    expect(active).toHaveLength(0)
    expect(orphaned).toHaveLength(2)
  })

  it('should handle empty array', () => {
    const { active, orphaned } = filterOrphanedComments([], {})
    expect(active).toHaveLength(0)
    expect(orphaned).toHaveLength(0)
  })

  it('should include status with orphan reason', () => {
    const comments: MockComment[] = [
      makeComment('1', 'cell', { rowId: 'row1', propertyKey: 'status' })
    ]

    const resolvers: OrphanResolvers = {
      rowExists: () => true,
      columnExists: () => false
    }

    const { orphaned } = filterOrphanedComments(comments, resolvers)

    expect(orphaned[0].status.orphaned).toBe(true)
    expect(orphaned[0].status.reason).toBe('column-deleted')
    expect(orphaned[0].status.context).toBe('Column "status"')
  })
})
