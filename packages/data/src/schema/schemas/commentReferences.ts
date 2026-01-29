/**
 * Comment reference extraction utilities.
 *
 * Extracts @mentions, #comment references, and [[node]] links from comment content.
 * These are parsed at render time, not stored.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

/** A user mention (@username or @did:key:...) */
export interface Mention {
  type: 'user'
  /** Raw text (e.g., '@alice' or '@did:key:z6Mk...') */
  raw: string
  /** DID if the mention is a DID */
  did?: string
  /** Display name if not a DID */
  displayName?: string
  /** Position in content string */
  index: number
}

/** A comment reference (#commentId) */
export interface CommentRef {
  type: 'comment'
  /** Raw text (e.g., '#abc123...') */
  raw: string
  /** The comment ID */
  commentId: string
  /** Position in content string */
  index: number
}

/** A node reference ([[nodeId]]) */
export interface NodeRef {
  type: 'node'
  /** Raw text (e.g., '[[page-xyz]]') */
  raw: string
  /** The node ID */
  nodeId: string
  /** Position in content string */
  index: number
}

/** Union of all reference types */
export type Reference = Mention | CommentRef | NodeRef

// ─── Regex Patterns ────────────────────────────────────────────────────────────

/**
 * Match @mentions:
 * - @did:key:z... (DID format) - must be checked first
 * - @username (alphanumeric with underscores)
 */
const MENTION_REGEX = /@(did:key:z[a-zA-Z0-9]+|[a-zA-Z_][\w]*)/g

/**
 * Match #comment references:
 * - nanoid format (exactly 21 alphanumeric chars with _ and -)
 * - Must not be followed by more alphanumeric chars
 */
const COMMENT_REF_REGEX = /#([a-zA-Z0-9_-]{21})(?![a-zA-Z0-9_-])/g

/**
 * Match [[node]] references:
 * - nanoid format inside double brackets
 */
const NODE_REF_REGEX = /\[\[([a-zA-Z0-9_-]{21})\]\]/g

// ─── Extraction Functions ──────────────────────────────────────────────────────

/**
 * Extract all references from comment content.
 *
 * @param content - The comment content string
 * @returns Array of references sorted by position
 *
 * @example
 * ```ts
 * const refs = extractReferences('@alice check [[page-abc]] and #comment-xyz')
 * // [
 * //   { type: 'user', raw: '@alice', displayName: 'alice', index: 0 },
 * //   { type: 'node', raw: '[[page-abc]]', nodeId: 'page-abc', index: 13 },
 * //   { type: 'comment', raw: '#comment-xyz', commentId: 'comment-xyz', index: 30 }
 * // ]
 * ```
 */
export function extractReferences(content: string): Reference[] {
  const refs: Reference[] = []

  // Reset regex lastIndex
  MENTION_REGEX.lastIndex = 0
  COMMENT_REF_REGEX.lastIndex = 0
  NODE_REF_REGEX.lastIndex = 0

  // Extract @mentions
  let match: RegExpExecArray | null
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    const value = match[1]
    refs.push({
      type: 'user',
      raw: match[0],
      did: value.startsWith('did:') ? value : undefined,
      displayName: value.startsWith('did:') ? undefined : value,
      index: match.index
    })
  }

  // Extract #comment references
  while ((match = COMMENT_REF_REGEX.exec(content)) !== null) {
    refs.push({
      type: 'comment',
      raw: match[0],
      commentId: match[1],
      index: match.index
    })
  }

  // Extract [[node]] references
  while ((match = NODE_REF_REGEX.exec(content)) !== null) {
    refs.push({
      type: 'node',
      raw: match[0],
      nodeId: match[1],
      index: match.index
    })
  }

  // Sort by position
  return refs.sort((a, b) => a.index - b.index)
}

/**
 * Extract only user mentions from content.
 *
 * @param content - The comment content string
 * @returns Array of mentions
 */
export function extractMentions(content: string): Mention[] {
  return extractReferences(content).filter((r): r is Mention => r.type === 'user')
}

/**
 * Get all mentioned user identifiers (DIDs or display names).
 *
 * @param content - The comment content string
 * @returns Array of user identifiers
 */
export function getMentionedUsers(content: string): string[] {
  return extractMentions(content)
    .map((m) => m.did ?? m.displayName)
    .filter((id): id is string => id !== undefined)
}

/**
 * Check if a specific DID is mentioned in content.
 *
 * @param content - The comment content string
 * @param did - The DID to check for
 * @returns True if mentioned
 */
export function isMentioned(content: string, did: string): boolean {
  return content.includes(`@${did}`)
}

/**
 * Check if a specific username is mentioned in content.
 *
 * @param content - The comment content string
 * @param username - The username to check for
 * @returns True if mentioned
 */
export function isUsernameMentioned(content: string, username: string): boolean {
  const mentions = extractMentions(content)
  return mentions.some((m) => m.displayName === username)
}

/**
 * Extract only node references from content.
 *
 * @param content - The comment content string
 * @returns Array of node references
 */
export function extractNodeRefs(content: string): NodeRef[] {
  return extractReferences(content).filter((r): r is NodeRef => r.type === 'node')
}

/**
 * Extract only comment references from content.
 *
 * @param content - The comment content string
 * @returns Array of comment references
 */
export function extractCommentRefs(content: string): CommentRef[] {
  return extractReferences(content).filter((r): r is CommentRef => r.type === 'comment')
}

// ─── Rendering Helpers ─────────────────────────────────────────────────────────

/**
 * Replace a substring at a specific position.
 *
 * @param str - Original string
 * @param index - Start position
 * @param length - Length to replace
 * @param replacement - Replacement string
 * @returns Modified string
 */
export function replaceAt(str: string, index: number, length: number, replacement: string): string {
  return str.slice(0, index) + replacement + str.slice(index + length)
}

/**
 * Convert references to HTML links.
 * Process in reverse order to preserve indices.
 *
 * @param content - The comment content string
 * @param options - Link generation options
 * @returns Content with references converted to links
 *
 * @example
 * ```ts
 * const html = convertRefsToLinks('@alice check [[page-abc]]', {
 *   userLink: (m) => `/user/${m.displayName}`,
 *   nodeLink: (n) => `/node/${n.nodeId}`
 * })
 * // '<a href="/user/alice" class="mention">@alice</a> check <a href="/node/page-abc" class="node-ref">[[page-abc]]</a>'
 * ```
 */
export function convertRefsToLinks(
  content: string,
  options: {
    /** Generate user link href */
    userLink?: (mention: Mention) => string
    /** Generate node link href */
    nodeLink?: (nodeRef: NodeRef) => string
    /** Generate comment link href */
    commentLink?: (commentRef: CommentRef) => string
    /** CSS class for mentions */
    mentionClass?: string
    /** CSS class for node refs */
    nodeRefClass?: string
    /** CSS class for comment refs */
    commentRefClass?: string
  } = {}
): string {
  const {
    userLink = (m) => `/user/${m.did ?? m.displayName}`,
    nodeLink = (n) => `/node/${n.nodeId}`,
    commentLink = (c) => `#comment-${c.commentId}`,
    mentionClass = 'mention',
    nodeRefClass = 'node-ref',
    commentRefClass = 'comment-ref'
  } = options

  const refs = extractReferences(content)
  let result = content

  // Process in reverse order to preserve indices
  for (const ref of refs.reverse()) {
    let replacement: string

    switch (ref.type) {
      case 'user': {
        const displayText = ref.displayName ?? ref.did?.slice(-8) ?? '?'
        replacement = `<a href="${userLink(ref)}" class="${mentionClass}">@${displayText}</a>`
        break
      }
      case 'node': {
        const displayText = ref.nodeId.slice(0, 8)
        replacement = `<a href="${nodeLink(ref)}" class="${nodeRefClass}">[[${displayText}]]</a>`
        break
      }
      case 'comment': {
        const displayText = ref.commentId.slice(0, 8)
        replacement = `<a href="${commentLink(ref)}" class="${commentRefClass}">#${displayText}</a>`
        break
      }
    }

    result = replaceAt(result, ref.index, ref.raw.length, replacement)
  }

  return result
}
