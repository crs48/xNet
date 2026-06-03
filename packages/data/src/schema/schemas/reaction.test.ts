import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import { ReactionSchema } from './reaction'
import { builtInSchemas } from './index'

describe('ReactionSchema', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

  it('creates and validates a like reaction', () => {
    const reaction = ReactionSchema.create(
      {
        target: 'page-1',
        targetSchema: 'xnet://xnet.fyi/Page',
        reactionType: 'like',
        reactor: testDID
      },
      { createdBy: testDID }
    )

    expect(reaction.schemaId).toBe('xnet://xnet.fyi/Reaction@1.0.0')
    expect(reaction.target).toBe('page-1')
    expect(reaction.reactionType).toBe('like')
    expect(reaction.reactor).toBe(testDID)
    expect(ReactionSchema.validate(reaction)).toEqual({ valid: true, errors: [] })
  })

  it('creates reposts with optional annotation', () => {
    const reaction = ReactionSchema.create(
      {
        target: 'page-1',
        reactionType: 'repost',
        reactor: testDID,
        annotation: 'Worth reading.'
      },
      { createdBy: testDID }
    )

    expect(reaction.reactionType).toBe('repost')
    expect(reaction.annotation).toBe('Worth reading.')
    expect(ReactionSchema.validate(reaction)).toEqual({ valid: true, errors: [] })
  })

  it('rejects unknown reaction types', () => {
    const invalid = {
      ...ReactionSchema.create(
        {
          target: 'page-1',
          reactionType: 'like',
          reactor: testDID
        },
        { createdBy: testDID }
      ),
      reactionType: 'boost'
    }

    const result = ReactionSchema.validate(invalid)

    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.path)).toContain('reactionType')
  })

  it('registers built-in schema aliases', async () => {
    const versioned = await builtInSchemas['xnet://xnet.fyi/Reaction@1.0.0']()
    const legacy = await builtInSchemas['xnet://xnet.fyi/Reaction']()

    expect(versioned.schema['@id']).toBe('xnet://xnet.fyi/Reaction@1.0.0')
    expect(legacy.schema['@id']).toBe('xnet://xnet.fyi/Reaction@1.0.0')
  })
})
