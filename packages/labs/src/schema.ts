/**
 * Lab schema (exploration 0180).
 *
 * A Lab is a first-class node — like a Page or Canvas — that holds code, the
 * language + runtime tier it runs on, and its last captured output. Stored as
 * a `defineSchema` Node so it syncs over P2P like everything else.
 */

import type { LabLanguage, LabRuntimeTier } from './runtime/types'
import { defineSchema, json, relation, select, text } from '@xnetjs/data'

export const LAB_LANGUAGE_OPTIONS = [
  { id: 'javascript', name: 'JavaScript', color: 'yellow' },
  { id: 'typescript', name: 'TypeScript', color: 'blue' },
  { id: 'python', name: 'Python', color: 'green' },
  { id: 'rust', name: 'Rust', color: 'orange' },
  { id: 'c', name: 'C', color: 'gray' }
] as const

export const LAB_RUNTIME_OPTIONS = [
  { id: 'sandbox', name: 'Sandbox', color: 'gray' },
  { id: 'app', name: 'App', color: 'purple' },
  { id: 'server', name: 'Server', color: 'red' }
] as const

export const LabSchema = defineSchema({
  name: 'Lab',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Human-readable name */
    title: text({ required: true, maxLength: 500 }),
    /** What the Lab does */
    description: text({}),
    /** Source language */
    language: select({ options: LAB_LANGUAGE_OPTIONS, default: 'javascript' }),
    /** Which ladder rung it runs on */
    runtime: select({ options: LAB_RUNTIME_OPTIONS, default: 'sandbox' }),
    /** The source code */
    code: text({ required: true }),
    /** Last run's captured output ({ value, logs }) — display only */
    lastOutput: json({}),
    /** Last run's error message (empty when the last run succeeded) */
    lastError: text({}),

    // ─── Explorer / organization (mirrors Page; exploration 0169/0179) ───
    /** Emoji or icon */
    icon: text({}),
    /** Canonical home; empty = Unfiled */
    folder: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),
    /** Order among folder siblings — fractional index */
    sortKey: text({ maxLength: 500 }),
    /** Workspace-wide labels, referenced by id */
    tags: relation({ target: 'xnet://xnet.fyi/Tag@1.0.0' as const, multiple: true }),
    /** Canonical SECURITY home; empty = personal/private */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),
    /** Per-node visibility; `inherit` defers to the Space */
    visibility: select({
      options: [
        { id: 'inherit', name: 'Inherit', color: 'gray' },
        { id: 'private', name: 'Private', color: 'gray' },
        { id: 'unlisted', name: 'Unlisted', color: 'yellow' },
        { id: 'public', name: 'Public', color: 'green' }
      ] as const,
      default: 'inherit'
    })
  }
})

/** Type-safe shape of a Lab node's properties. */
export interface LabNode {
  id: string
  title: string
  description?: string
  language: LabLanguage
  runtime: LabRuntimeTier
  code: string
  lastOutput?: { value?: unknown; logs?: Array<{ level: string; message: string }> }
  lastError?: string
}

/** Schema IRI for Lab nodes (matches the versioned IRI `defineSchema` builds). */
export const LAB_SCHEMA_IRI = 'xnet://xnet.fyi/Lab@1.0.0'

const VALID_LANGUAGES = new Set<LabLanguage>(['javascript', 'typescript', 'python', 'rust', 'c'])
const VALID_RUNTIMES = new Set<LabRuntimeTier>(['sandbox', 'app', 'server'])

export function isLabLanguage(value: unknown): value is LabLanguage {
  return typeof value === 'string' && VALID_LANGUAGES.has(value as LabLanguage)
}

export function isLabRuntimeTier(value: unknown): value is LabRuntimeTier {
  return typeof value === 'string' && VALID_RUNTIMES.has(value as LabRuntimeTier)
}
