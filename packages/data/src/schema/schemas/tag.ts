/**
 * TagSchema - flat, workspace-wide label (exploration 0169).
 *
 * Content references tags BY ID via a `tags` relation; inline #hashtags
 * are editor pills extracted like mentions (never parsed from text).
 * Renaming a tag therefore renames it everywhere. `name` is normalized
 * via normalizeTagName on create; uniqueness is enforced at the picker
 * (autocomplete-first) plus an eventual merge tool, not by the schema.
 *
 * Tags are deliberately flat — no nesting, no Tana-style supertags
 * (xNet already has real schemas). A tag's detail page is a live query
 * of everything tagged; a discussion channel can attach to a tag via
 * the existing Channel.target relation.
 */

import type { InferNode } from '../types'
import { presets } from '../../auth'
import { defineSchema } from '../define'
import { checkbox, created, createdBy, text } from '../properties'

export const TAG_SCHEMA_IRI = 'xnet://xnet.fyi/Tag@1.0.0'

export const MAX_TAG_NAME_LENGTH = 80

export const TagSchema = defineSchema({
  name: 'Tag',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Normalized lowercase name, no leading '#' (see normalizeTagName) */
    name: text({ required: true, maxLength: MAX_TAG_NAME_LENGTH }),

    /** Pill/badge color token */
    color: text({ maxLength: 30 }),

    /** Optional description shown on the tag page */
    description: text({ maxLength: 500 }),

    /** Archived tags are hidden from pickers but references keep working */
    archived: checkbox({ default: false }),

    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  // Standalone/personal content: owner-only by default (exploration 0192).
  authorization: presets.private()
})

export type Tag = InferNode<(typeof TagSchema)['_properties']>

/**
 * Normalize a raw tag name: strip a leading '#', lowercase, collapse
 * inner whitespace runs to single hyphens, drop characters that would
 * break inline `#tag` rendering, clamp length. Returns '' when nothing
 * usable remains.
 */
export function normalizeTagName(raw: string): string {
  return raw
    .replace(/^#+/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\-_./]/gu, '')
    .replace(/-{2,}/g, '-')
    .slice(0, MAX_TAG_NAME_LENGTH)
}

/** Whether a normalized name is usable as a tag name. */
export function isValidTagName(name: string): boolean {
  return name.length > 0 && name === normalizeTagName(name)
}
