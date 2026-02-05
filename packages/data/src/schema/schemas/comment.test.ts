import type { DID, SchemaIRI } from '../node'
import { describe, it, expect } from 'vitest'
import { CommentSchema } from './comment'

describe('CommentSchema', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID
  const targetNodeId = 'page-abc123'

  describe('schema definition', () => {
    it('has correct schema IRI', () => {
      expect(CommentSchema.schema['@id']).toBe('xnet://xnet.fyi/Comment')
      expect(CommentSchema.schema['@type']).toBe('xnet://xnet.fyi/Schema')
      expect(CommentSchema.schema.name).toBe('Comment')
    })

    it('has no document type (comments are plain text)', () => {
      expect(CommentSchema.schema.document).toBeUndefined()
    })

    it('has all required properties defined', () => {
      const propIds = CommentSchema.schema.properties.map((p) => p['@id'])

      expect(propIds).toContain('xnet://xnet.fyi/Comment#target')
      expect(propIds).toContain('xnet://xnet.fyi/Comment#anchorType')
      expect(propIds).toContain('xnet://xnet.fyi/Comment#anchorData')
      expect(propIds).toContain('xnet://xnet.fyi/Comment#content')
      expect(propIds).toContain('xnet://xnet.fyi/Comment#inReplyTo')
      expect(propIds).toContain('xnet://xnet.fyi/Comment#resolved')
    })
  })

  describe('create', () => {
    it('creates a root comment with minimal fields', () => {
      const comment = CommentSchema.create(
        {
          target: targetNodeId,
          anchorType: 'node',
          anchorData: '{}',
          content: 'This is a comment'
        },
        { createdBy: testDID }
      )

      expect(comment.id).toBeDefined()
      expect(comment.schemaId).toBe('xnet://xnet.fyi/Comment')
      expect(comment.target).toBe(targetNodeId)
      expect(comment.anchorType).toBe('node')
      expect(comment.anchorData).toBe('{}')
      expect(comment.content).toBe('This is a comment')
      expect(comment.inReplyTo).toBeUndefined()
      expect(comment.resolved).toBe(false)
      expect(comment.createdAt).toBeGreaterThan(0)
      expect(comment.createdBy).toBe(testDID)
    })

    it('creates a reply comment with inReplyTo', () => {
      const rootComment = CommentSchema.create(
        {
          target: targetNodeId,
          anchorType: 'node',
          anchorData: '{}',
          content: 'Root comment'
        },
        { createdBy: testDID }
      )

      const reply = CommentSchema.create(
        {
          target: targetNodeId,
          anchorType: 'node',
          anchorData: '{}',
          content: 'This is a reply',
          inReplyTo: rootComment.id
        },
        { createdBy: testDID }
      )

      expect(reply.inReplyTo).toBe(rootComment.id)
      expect(reply.target).toBe(targetNodeId)
    })

    it('creates a text anchor comment', () => {
      const textAnchor = JSON.stringify({
        startRelative: 'base64encodedstart',
        endRelative: 'base64encodedend',
        quotedText: 'selected text'
      })

      const comment = CommentSchema.create(
        {
          target: targetNodeId,
          targetSchema: 'xnet://xnet.fyi/Page',
          anchorType: 'text',
          anchorData: textAnchor,
          content: 'Comment on this text'
        },
        { createdBy: testDID }
      )

      expect(comment.anchorType).toBe('text')
      expect(comment.targetSchema).toBe('xnet://xnet.fyi/Page')
      expect(JSON.parse(comment.anchorData!)).toEqual({
        startRelative: 'base64encodedstart',
        endRelative: 'base64encodedend',
        quotedText: 'selected text'
      })
    })

    it('creates a cell anchor comment', () => {
      const cellAnchor = JSON.stringify({
        rowId: 'row-123',
        propertyKey: 'status'
      })

      const comment = CommentSchema.create(
        {
          target: 'database-xyz',
          targetSchema: 'xnet://xnet.fyi/Database',
          anchorType: 'cell',
          anchorData: cellAnchor,
          content: 'Update this cell'
        },
        { createdBy: testDID }
      )

      expect(comment.anchorType).toBe('cell')
      expect(JSON.parse(comment.anchorData!)).toEqual({
        rowId: 'row-123',
        propertyKey: 'status'
      })
    })

    it('creates a canvas position comment', () => {
      const posAnchor = JSON.stringify({ x: 100, y: 200 })

      const comment = CommentSchema.create(
        {
          target: 'canvas-abc',
          anchorType: 'canvas-position',
          anchorData: posAnchor,
          content: 'Pin comment here'
        },
        { createdBy: testDID }
      )

      expect(comment.anchorType).toBe('canvas-position')
      expect(JSON.parse(comment.anchorData!)).toEqual({ x: 100, y: 200 })
    })

    it('creates a canvas object comment', () => {
      const objAnchor = JSON.stringify({
        objectId: 'shape-123',
        offsetX: 10,
        offsetY: 20
      })

      const comment = CommentSchema.create(
        {
          target: 'canvas-abc',
          anchorType: 'canvas-object',
          anchorData: objAnchor,
          content: 'Comment on this shape'
        },
        { createdBy: testDID }
      )

      expect(comment.anchorType).toBe('canvas-object')
      expect(JSON.parse(comment.anchorData!)).toEqual({
        objectId: 'shape-123',
        offsetX: 10,
        offsetY: 20
      })
    })

    it('applies default values', () => {
      const comment = CommentSchema.create(
        {
          target: targetNodeId,
          anchorData: '{}',
          content: 'Test'
        },
        { createdBy: testDID }
      )

      // Default anchorType is 'node'
      expect(comment.anchorType).toBe('node')
      // Default resolved is false
      expect(comment.resolved).toBe(false)
      // Default edited is false
      expect(comment.edited).toBe(false)
    })
  })

  describe('validate', () => {
    it('validates a correct comment', () => {
      const comment = CommentSchema.create(
        {
          target: targetNodeId,
          anchorType: 'node',
          anchorData: '{}',
          content: 'Valid comment'
        },
        { createdBy: testDID }
      )

      const result = CommentSchema.validate(comment)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('rejects missing target', () => {
      const invalid = {
        id: 'test',
        schemaId: 'xnet://xnet.fyi/Comment',
        createdAt: Date.now(),
        createdBy: testDID,
        anchorType: 'node',
        anchorData: '{}',
        content: 'Missing target'
        // target is missing
      }

      const result = CommentSchema.validate(invalid)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.path === 'target')).toBe(true)
    })

    it('rejects missing content', () => {
      const invalid = {
        id: 'test',
        schemaId: 'xnet://xnet.fyi/Comment',
        createdAt: Date.now(),
        createdBy: testDID,
        target: targetNodeId,
        anchorType: 'node',
        anchorData: '{}'
        // content is missing
      }

      const result = CommentSchema.validate(invalid)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.path === 'content')).toBe(true)
    })

    it('rejects missing anchorData', () => {
      const invalid = {
        id: 'test',
        schemaId: 'xnet://xnet.fyi/Comment',
        createdAt: Date.now(),
        createdBy: testDID,
        target: targetNodeId,
        anchorType: 'node',
        content: 'Test'
        // anchorData is missing
      }

      const result = CommentSchema.validate(invalid)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.path === 'anchorData')).toBe(true)
    })

    it('rejects invalid anchorType', () => {
      const invalid = {
        id: 'test',
        schemaId: 'xnet://xnet.fyi/Comment',
        createdAt: Date.now(),
        createdBy: testDID,
        target: targetNodeId,
        anchorType: 'invalid-type',
        anchorData: '{}',
        content: 'Test'
      }

      const result = CommentSchema.validate(invalid)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.path === 'anchorType')).toBe(true)
    })

    it('validates all valid anchorType options', () => {
      const validTypes = [
        'text',
        'cell',
        'row',
        'column',
        'canvas-position',
        'canvas-object',
        'node'
      ]

      for (const anchorType of validTypes) {
        const comment = CommentSchema.create(
          {
            target: targetNodeId,
            anchorType: anchorType as 'node',
            anchorData: '{}',
            content: 'Test'
          },
          { createdBy: testDID }
        )

        const result = CommentSchema.validate(comment)
        expect(result.valid).toBe(true)
      }
    })
  })

  describe('is', () => {
    it('returns true for comment nodes', () => {
      const comment = CommentSchema.create(
        {
          target: targetNodeId,
          anchorType: 'node',
          anchorData: '{}',
          content: 'Test'
        },
        { createdBy: testDID }
      )

      expect(CommentSchema.is(comment)).toBe(true)
    })

    it('returns false for non-comment nodes', () => {
      const other = {
        id: 'test',
        schemaId: 'xnet://xnet.fyi/Page' as SchemaIRI,
        createdAt: Date.now(),
        createdBy: testDID
      }

      expect(CommentSchema.is(other)).toBe(false)
    })
  })

  describe('thread state', () => {
    it('can be resolved', () => {
      const comment = CommentSchema.create(
        {
          target: targetNodeId,
          anchorType: 'node',
          anchorData: '{}',
          content: 'Resolve me',
          resolved: true,
          resolvedBy: testDID,
          resolvedAt: Date.now()
        },
        { createdBy: testDID }
      )

      expect(comment.resolved).toBe(true)
      expect(comment.resolvedBy).toBe(testDID)
      expect(comment.resolvedAt).toBeGreaterThan(0)
    })

    it('can track edits', () => {
      const comment = CommentSchema.create(
        {
          target: targetNodeId,
          anchorType: 'node',
          anchorData: '{}',
          content: 'Edited content',
          edited: true,
          editedAt: Date.now()
        },
        { createdBy: testDID }
      )

      expect(comment.edited).toBe(true)
      expect(comment.editedAt).toBeGreaterThan(0)
    })
  })

  describe('pseudo reply-to', () => {
    it('can reference another user and comment', () => {
      const otherDID = 'did:key:z6MkotherUserDID123' as DID
      const comment = CommentSchema.create(
        {
          target: targetNodeId,
          anchorType: 'node',
          anchorData: '{}',
          content: '@alice I agree',
          inReplyTo: 'root-comment-id',
          replyToUser: otherDID,
          replyToCommentId: 'specific-comment-id'
        },
        { createdBy: testDID }
      )

      expect(comment.replyToUser).toBe(otherDID)
      expect(comment.replyToCommentId).toBe('specific-comment-id')
    })
  })
})
