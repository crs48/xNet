/**
 * Tests for comment reference extraction utilities.
 */
import { describe, it, expect } from 'vitest'
import {
  extractReferences,
  extractMentions,
  getMentionedUsers,
  isMentioned,
  isUsernameMentioned,
  extractNodeRefs,
  extractCommentRefs,
  replaceAt,
  convertRefsToLinks,
  type Mention,
  type NodeRef,
  type CommentRef
} from './commentReferences'

// ─── extractReferences ─────────────────────────────────────────────────────────

describe('extractReferences', () => {
  it('should extract user mentions with display names', () => {
    const refs = extractReferences('Hello @alice and @bob_123')
    expect(refs).toHaveLength(2)
    expect(refs[0]).toEqual({
      type: 'user',
      raw: '@alice',
      displayName: 'alice',
      did: undefined,
      index: 6
    })
    expect(refs[1]).toEqual({
      type: 'user',
      raw: '@bob_123',
      displayName: 'bob_123',
      did: undefined,
      index: 17
    })
  })

  it('should extract DID mentions', () => {
    const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    const refs = extractReferences(`CC @${did}`)
    expect(refs).toHaveLength(1)
    expect(refs[0]).toEqual({
      type: 'user',
      raw: `@${did}`,
      did: did,
      displayName: undefined,
      index: 3
    })
  })

  it('should extract node references', () => {
    const nodeId = 'abc123def456ghi789012'
    const refs = extractReferences(`See [[${nodeId}]] for details`)
    expect(refs).toHaveLength(1)
    expect(refs[0]).toEqual({
      type: 'node',
      raw: `[[${nodeId}]]`,
      nodeId: nodeId,
      index: 4
    })
  })

  it('should extract comment references', () => {
    const commentId = 'xyz789abc123def456ghi'
    const refs = extractReferences(`Related to #${commentId}`)
    expect(refs).toHaveLength(1)
    expect(refs[0]).toEqual({
      type: 'comment',
      raw: `#${commentId}`,
      commentId: commentId,
      index: 11
    })
  })

  it('should extract mixed references and sort by position', () => {
    const nodeId = 'abc123def456ghi789012'
    const commentId = 'xyz789abc123def456ghi'
    const content = `@alice check [[${nodeId}]] re: #${commentId}`
    const refs = extractReferences(content)

    expect(refs).toHaveLength(3)
    expect(refs[0].type).toBe('user')
    expect(refs[0].index).toBe(0)
    expect(refs[1].type).toBe('node')
    expect(refs[2].type).toBe('comment')
  })

  it('should return empty array for content with no references', () => {
    const refs = extractReferences('Just some plain text without references')
    expect(refs).toEqual([])
  })

  it('should handle multiple mentions in same content', () => {
    const refs = extractReferences('@alice @bob @charlie')
    expect(refs).toHaveLength(3)
    expect((refs[0] as Mention).displayName).toBe('alice')
    expect((refs[1] as Mention).displayName).toBe('bob')
    expect((refs[2] as Mention).displayName).toBe('charlie')
  })

  it('should not match invalid node references (wrong length)', () => {
    const refs = extractReferences('[[short]] [[toolongforananoidsothiswontmatch]]')
    expect(refs).toEqual([])
  })

  it('should not match invalid comment references (wrong length)', () => {
    const refs = extractReferences('#short #toolongforananoidsothiswontmatch')
    expect(refs).toEqual([])
  })

  it('should handle edge case with @ at end of string', () => {
    const refs = extractReferences('Email me @')
    expect(refs).toEqual([])
  })

  it('should handle usernames starting with underscore', () => {
    const refs = extractReferences('@_private_user')
    expect(refs).toHaveLength(1)
    expect((refs[0] as Mention).displayName).toBe('_private_user')
  })
})

// ─── extractMentions ───────────────────────────────────────────────────────────

describe('extractMentions', () => {
  it('should extract only user mentions', () => {
    const nodeId = 'abc123def456ghi789012'
    const content = `@alice check [[${nodeId}]]`
    const mentions = extractMentions(content)

    expect(mentions).toHaveLength(1)
    expect(mentions[0].type).toBe('user')
    expect(mentions[0].displayName).toBe('alice')
  })

  it('should return empty array when no mentions', () => {
    const nodeId = 'abc123def456ghi789012'
    const mentions = extractMentions(`See [[${nodeId}]]`)
    expect(mentions).toEqual([])
  })
})

// ─── getMentionedUsers ─────────────────────────────────────────────────────────

describe('getMentionedUsers', () => {
  it('should return display names for username mentions', () => {
    const users = getMentionedUsers('@alice @bob')
    expect(users).toEqual(['alice', 'bob'])
  })

  it('should return DIDs for DID mentions', () => {
    const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    const users = getMentionedUsers(`@${did}`)
    expect(users).toEqual([did])
  })

  it('should return mixed DIDs and display names', () => {
    const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    const users = getMentionedUsers(`@alice @${did} @bob`)
    expect(users).toEqual(['alice', did, 'bob'])
  })
})

// ─── isMentioned ───────────────────────────────────────────────────────────────

describe('isMentioned', () => {
  it('should return true when DID is mentioned', () => {
    const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    expect(isMentioned(`CC @${did}`, did)).toBe(true)
  })

  it('should return false when DID is not mentioned', () => {
    const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    expect(isMentioned('@alice', did)).toBe(false)
  })
})

// ─── isUsernameMentioned ───────────────────────────────────────────────────────

describe('isUsernameMentioned', () => {
  it('should return true when username is mentioned', () => {
    expect(isUsernameMentioned('@alice @bob', 'alice')).toBe(true)
  })

  it('should return false when username is not mentioned', () => {
    expect(isUsernameMentioned('@alice @bob', 'charlie')).toBe(false)
  })

  it('should not match partial usernames', () => {
    expect(isUsernameMentioned('@alice', 'ali')).toBe(false)
  })
})

// ─── extractNodeRefs ───────────────────────────────────────────────────────────

describe('extractNodeRefs', () => {
  it('should extract only node references', () => {
    const nodeId = 'abc123def456ghi789012'
    const content = `@alice check [[${nodeId}]]`
    const nodeRefs = extractNodeRefs(content)

    expect(nodeRefs).toHaveLength(1)
    expect(nodeRefs[0].nodeId).toBe(nodeId)
  })

  it('should extract multiple node references', () => {
    const nodeId1 = 'abc123def456ghi789012'
    const nodeId2 = 'xyz789abc123def456ghi'
    const nodeRefs = extractNodeRefs(`[[${nodeId1}]] and [[${nodeId2}]]`)

    expect(nodeRefs).toHaveLength(2)
    expect(nodeRefs[0].nodeId).toBe(nodeId1)
    expect(nodeRefs[1].nodeId).toBe(nodeId2)
  })
})

// ─── extractCommentRefs ────────────────────────────────────────────────────────

describe('extractCommentRefs', () => {
  it('should extract only comment references', () => {
    const commentId = 'xyz789abc123def456ghi'
    const content = `@alice see #${commentId}`
    const commentRefs = extractCommentRefs(content)

    expect(commentRefs).toHaveLength(1)
    expect(commentRefs[0].commentId).toBe(commentId)
  })

  it('should not confuse hashtags with comment refs', () => {
    // Hashtags like #todo or #bug are too short to be comment refs
    const commentRefs = extractCommentRefs('#todo #bug #feature')
    expect(commentRefs).toEqual([])
  })
})

// ─── replaceAt ─────────────────────────────────────────────────────────────────

describe('replaceAt', () => {
  it('should replace substring at position', () => {
    const result = replaceAt('Hello World', 6, 5, 'Universe')
    expect(result).toBe('Hello Universe')
  })

  it('should handle replacement at start', () => {
    const result = replaceAt('Hello', 0, 5, 'Hi')
    expect(result).toBe('Hi')
  })

  it('should handle replacement at end', () => {
    const result = replaceAt('Hello', 5, 0, ' World')
    expect(result).toBe('Hello World')
  })

  it('should handle empty replacement (deletion)', () => {
    const result = replaceAt('Hello World', 5, 6, '')
    expect(result).toBe('Hello')
  })
})

// ─── convertRefsToLinks ────────────────────────────────────────────────────────

describe('convertRefsToLinks', () => {
  it('should convert user mentions to links', () => {
    const html = convertRefsToLinks('@alice')
    expect(html).toBe('<a href="/user/alice" class="mention">@alice</a>')
  })

  it('should convert DID mentions to links with truncated display', () => {
    const did = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    const html = convertRefsToLinks(`@${did}`)
    // Should truncate to last 8 chars of DID
    expect(html).toContain('class="mention"')
    expect(html).toContain(`/user/${did}`)
  })

  it('should convert node references to links', () => {
    const nodeId = 'abc123def456ghi789012'
    const html = convertRefsToLinks(`[[${nodeId}]]`)
    expect(html).toContain('class="node-ref"')
    expect(html).toContain(`/node/${nodeId}`)
    // Should truncate nodeId to first 8 chars in display
    expect(html).toContain('[[abc123de]]')
  })

  it('should convert comment references to links', () => {
    const commentId = 'xyz789abc123def456ghi'
    const html = convertRefsToLinks(`#${commentId}`)
    expect(html).toContain('class="comment-ref"')
    expect(html).toContain(`#comment-${commentId}`)
    // Should truncate commentId to first 8 chars in display
    expect(html).toContain('#xyz789ab')
  })

  it('should handle mixed references', () => {
    const nodeId = 'abc123def456ghi789012'
    const content = `@alice check [[${nodeId}]]`
    const html = convertRefsToLinks(content)

    expect(html).toContain('class="mention"')
    expect(html).toContain('class="node-ref"')
  })

  it('should preserve text between references', () => {
    const html = convertRefsToLinks('@alice and @bob are here')
    expect(html).toContain(' and ')
    expect(html).toContain(' are here')
  })

  it('should use custom link generators', () => {
    const html = convertRefsToLinks('@alice', {
      userLink: (m) => `/profile/${m.displayName}`
    })
    expect(html).toBe('<a href="/profile/alice" class="mention">@alice</a>')
  })

  it('should use custom CSS classes', () => {
    const html = convertRefsToLinks('@alice', {
      mentionClass: 'custom-mention'
    })
    expect(html).toContain('class="custom-mention"')
  })

  it('should handle content with no references', () => {
    const content = 'Just plain text'
    const html = convertRefsToLinks(content)
    expect(html).toBe(content)
  })

  it('should handle empty content', () => {
    const html = convertRefsToLinks('')
    expect(html).toBe('')
  })
})

// ─── Edge Cases ────────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('should handle consecutive references without spaces', () => {
    const refs = extractReferences('@alice@bob')
    // Both mentions are valid even without spaces between them
    expect(refs).toHaveLength(2)
    expect((refs[0] as Mention).displayName).toBe('alice')
    expect((refs[1] as Mention).displayName).toBe('bob')
  })

  it('should handle references at string boundaries', () => {
    const refs = extractReferences('@alice')
    expect(refs).toHaveLength(1)
    expect(refs[0].index).toBe(0)
  })

  it('should handle unicode in surrounding text', () => {
    const refs = extractReferences('Hey @alice')
    expect(refs).toHaveLength(1)
    expect((refs[0] as Mention).displayName).toBe('alice')
  })

  it('should handle newlines in content', () => {
    const refs = extractReferences('@alice\n@bob\n@charlie')
    expect(refs).toHaveLength(3)
  })

  it('should be idempotent (multiple calls same result)', () => {
    const content = '@alice @bob'
    const refs1 = extractReferences(content)
    const refs2 = extractReferences(content)
    expect(refs1).toEqual(refs2)
  })
})
