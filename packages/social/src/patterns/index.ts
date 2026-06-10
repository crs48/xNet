/**
 * Social workspace pattern detection.
 */

import type { SavedViewDescriptor } from '@xnetjs/data'
import { defineSavedViewDescriptor, validateSavedViewDescriptor } from '@xnetjs/data'
import { createSocialNodeId } from '../import/ids'

export type SocialPatternKind =
  | 'repeated-creators'
  | 'bridge-actors'
  | 'cross-source-overlap'
  | 'attention-bursts'
  | 'unrevisited-saves'
  | 'privacy-hotspots'

export type SocialPatternSeverity = 'info' | 'notice' | 'warning'

export type SocialPatternRow = Record<string, unknown>

export type SocialPatternEvidence = {
  label: string
  value: string
  count: number
}

export type SocialPatternSuggestion = {
  id: string
  kind: SocialPatternKind
  title: string
  description: string
  severity: SocialPatternSeverity
  viewHint: 'Content' | 'Interactions' | 'Import Runs'
  evidenceCount: number
  evidence: readonly SocialPatternEvidence[]
  platforms: readonly string[]
  privacyClasses: readonly string[]
  sourceImportRunIds: readonly string[]
}

export type SocialPatternInput = {
  content?: readonly SocialPatternRow[] | null
  interactions?: readonly SocialPatternRow[] | null
  importRuns?: readonly SocialPatternRow[] | null
  maxSuggestions?: number | null
}

export type SocialPatternDefinition = {
  kind: SocialPatternKind
  title: string
  description: string
  detect: (input: NormalizedSocialPatternInput) => SocialPatternSuggestion[]
}

export type SocialPatternSavedViewDraft = {
  deterministicId: string
  title: string
  description: string
  descriptor: SavedViewDescriptor
  descriptorJson: string
  scope: NonNullable<SavedViewDescriptor['scope']>
  savedViewProperties: {
    title: string
    description: string
    descriptor: string
    scope: NonNullable<SavedViewDescriptor['scope']>
  }
}

export type SocialPatternSavedViewDraftInput = {
  pattern: SocialPatternSuggestion
  baseDescriptor: SavedViewDescriptor
  workspaceId?: string | null
  scope?: SavedViewDescriptor['scope'] | null
}

type NormalizedSocialPatternInput = {
  content: readonly SocialPatternRow[]
  interactions: readonly SocialPatternRow[]
  importRuns: readonly SocialPatternRow[]
}

type CountBucket = {
  key: string
  label: string
  count: number
  rows: readonly SocialPatternRow[]
}

const DEFAULT_MAX_SUGGESTIONS = 8
const DEFAULT_PATTERN_WORKSPACE_ID = 'social-data-workspace'
const MAX_SAVED_VIEW_DESCRIPTION_LENGTH = 4000
const PRIVATE_PRIVACY_CLASSES = new Set([
  'private',
  'third-party-private',
  'account-security',
  'billing',
  'ads'
])
const SAVE_INTERACTION_KINDS = new Set(['save', 'saved', 'favorite', 'bookmark', 'like'])

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'pattern'
  )
}

function rowsFor(
  input: readonly SocialPatternRow[] | null | undefined
): readonly SocialPatternRow[] {
  return Array.isArray(input) ? input : []
}

function uniqueStrings(values: readonly (string | null | undefined)[]): readonly string[] {
  return [...new Set(values.flatMap((value) => (value ? [value] : [])))].sort()
}

function platformFor(row: SocialPatternRow): string | null {
  return readString(row.platform)
}

function privacyClassFor(row: SocialPatternRow): string | null {
  return readString(row.privacyClass)
}

function sourceImportRunIdsFor(
  rows: readonly SocialPatternRow[],
  importRuns: readonly SocialPatternRow[]
): readonly string[] {
  const explicitIds = uniqueStrings(
    rows.map(
      (row) =>
        readString(row.importRun) ??
        readString(row.sourceImportRun) ??
        readString(row.sourceArchive) ??
        null
    )
  )
  if (explicitIds.length > 0) return explicitIds

  return uniqueStrings(importRuns.map((row) => readString(row.id)))
}

function patternId(kind: SocialPatternKind, evidence: readonly SocialPatternEvidence[]): string {
  const evidenceKey = evidence.map((item) => `${item.value}:${item.count}`).join('|')
  return `social-pattern:${kind}:${slugify(evidenceKey)}`
}

function suggestion(input: {
  kind: SocialPatternKind
  title: string
  description: string
  severity: SocialPatternSeverity
  viewHint: SocialPatternSuggestion['viewHint']
  evidence: readonly SocialPatternEvidence[]
  rows: readonly SocialPatternRow[]
  importRuns: readonly SocialPatternRow[]
}): SocialPatternSuggestion {
  return {
    id: patternId(input.kind, input.evidence),
    kind: input.kind,
    title: input.title,
    description: input.description,
    severity: input.severity,
    viewHint: input.viewHint,
    evidenceCount: input.evidence.reduce((total, item) => total + item.count, 0),
    evidence: input.evidence,
    platforms: uniqueStrings(input.rows.map(platformFor)),
    privacyClasses: uniqueStrings(input.rows.map(privacyClassFor)),
    sourceImportRunIds: sourceImportRunIdsFor(input.rows, input.importRuns)
  }
}

function truncateDescription(value: string): string {
  return value.length > MAX_SAVED_VIEW_DESCRIPTION_LENGTH
    ? value.slice(0, MAX_SAVED_VIEW_DESCRIPTION_LENGTH - 1)
    : value
}

function savedPatternDescription(pattern: SocialPatternSuggestion): string {
  const evidence = pattern.evidence
    .slice(0, 5)
    .map((item) => `${item.label}: ${item.value} (${item.count})`)
    .join('; ')
  const platforms =
    pattern.platforms.length > 0 ? `Platforms: ${pattern.platforms.join(', ')}.` : null
  const privacy =
    pattern.privacyClasses.length > 0 ? `Privacy: ${pattern.privacyClasses.join(', ')}.` : null
  const importRuns =
    pattern.sourceImportRunIds.length > 0
      ? `Source import runs: ${pattern.sourceImportRunIds.length}.`
      : null

  return truncateDescription(
    [
      pattern.description,
      `Evidence: ${evidence || `${pattern.evidenceCount} records`}.`,
      platforms,
      privacy,
      importRuns
    ]
      .filter(Boolean)
      .join(' ')
  )
}

function topBuckets(
  rows: readonly SocialPatternRow[],
  keyFor: (row: SocialPatternRow) => string | null,
  labelFor: (row: SocialPatternRow, key: string) => string = (_row, key) => key,
  minimumCount = 2
): readonly CountBucket[] {
  const grouped = rows.reduce<Map<string, SocialPatternRow[]>>((map, row) => {
    const key = keyFor(row)
    if (!key) return map

    const current = map.get(key) ?? []
    map.set(key, [...current, row])
    return map
  }, new Map())

  return Array.from(grouped.entries())
    .map(([key, bucketRows]) => ({
      key,
      label: labelFor(bucketRows[0] ?? {}, key),
      count: bucketRows.length,
      rows: bucketRows
    }))
    .filter((bucket) => bucket.count >= minimumCount)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}

function creatorKey(row: SocialPatternRow): string | null {
  return (
    readString(row.authorActor) ??
    readString(row.actorHandle) ??
    readString(row.targetAuthorActor) ??
    readString(row.targetAuthorHandle)
  )
}

function creatorLabel(row: SocialPatternRow, key: string): string {
  return readString(row.actorHandle) ?? readString(row.targetAuthorHandle) ?? key
}

function dateBucketKey(row: SocialPatternRow): string | null {
  const value =
    readString(row.publishedAt) ?? readString(row.observedAt) ?? readString(row.importedAt)
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return date.toISOString().slice(0, 10)
}

function titleOrUrlKey(row: SocialPatternRow): string | null {
  const value =
    readString(row.canonicalUrl) ??
    readString(row.platformUrl) ??
    readString(row.title) ??
    readString(row.targetTitle)
  return value ? value.toLowerCase() : null
}

function evidenceForBuckets(
  buckets: readonly CountBucket[],
  label: string,
  limit = 3
): readonly SocialPatternEvidence[] {
  return buckets.slice(0, limit).map((bucket) => ({
    label,
    value: bucket.label,
    count: bucket.count
  }))
}

function repeatedCreators(input: NormalizedSocialPatternInput): SocialPatternSuggestion[] {
  const rows = [...input.content, ...input.interactions]
  const buckets = topBuckets(rows, creatorKey, creatorLabel, 3)
  if (buckets.length === 0) return []

  const selectedRows = buckets.slice(0, 3).flatMap((bucket) => bucket.rows)
  return [
    suggestion({
      kind: 'repeated-creators',
      title: 'Repeated creators',
      description: 'Multiple imported records point back to the same creators or accounts.',
      severity: 'notice',
      viewHint: 'Content',
      evidence: evidenceForBuckets(buckets, 'Creator'),
      rows: selectedRows,
      importRuns: input.importRuns
    })
  ]
}

function bridgeActors(input: NormalizedSocialPatternInput): SocialPatternSuggestion[] {
  const rows = [...input.content, ...input.interactions].filter((row) => creatorKey(row))
  const buckets = topBuckets(
    rows,
    (row) => {
      const key = creatorKey(row)
      if (!key) return null

      const platforms = uniqueStrings(
        rows.filter((candidate) => creatorKey(candidate) === key).map(platformFor)
      )
      return platforms.length > 1 ? key : null
    },
    creatorLabel,
    2
  )
  if (buckets.length === 0) return []

  return [
    suggestion({
      kind: 'bridge-actors',
      title: 'Bridge actors',
      description: 'Some creators or accounts appear across more than one imported platform.',
      severity: 'info',
      viewHint: 'Content',
      evidence: evidenceForBuckets(buckets, 'Actor'),
      rows: buckets.slice(0, 3).flatMap((bucket) => bucket.rows),
      importRuns: input.importRuns
    })
  ]
}

function crossSourceOverlap(input: NormalizedSocialPatternInput): SocialPatternSuggestion[] {
  const rows = [...input.content, ...input.interactions]
  const buckets = topBuckets(
    rows,
    (row) => {
      const key = titleOrUrlKey(row)
      if (!key) return null

      const platforms = uniqueStrings(
        rows.filter((candidate) => titleOrUrlKey(candidate) === key).map(platformFor)
      )
      return platforms.length > 1 ? key : null
    },
    (row, key) => readString(row.title) ?? readString(row.targetTitle) ?? key,
    2
  )
  if (buckets.length === 0) return []

  return [
    suggestion({
      kind: 'cross-source-overlap',
      title: 'Cross-source overlap',
      description: 'The same links or titles appear in records from multiple platforms.',
      severity: 'info',
      viewHint: 'Content',
      evidence: evidenceForBuckets(buckets, 'Record'),
      rows: buckets.slice(0, 3).flatMap((bucket) => bucket.rows),
      importRuns: input.importRuns
    })
  ]
}

function attentionBursts(input: NormalizedSocialPatternInput): SocialPatternSuggestion[] {
  const rows = [...input.content, ...input.interactions]
  const buckets = topBuckets(rows, dateBucketKey, (_row, key) => key, 5)
  if (buckets.length === 0) return []

  return [
    suggestion({
      kind: 'attention-bursts',
      title: 'Attention bursts',
      description: 'Several imported actions cluster on the same day.',
      severity: 'notice',
      viewHint: 'Interactions',
      evidence: evidenceForBuckets(buckets, 'Day'),
      rows: buckets.slice(0, 3).flatMap((bucket) => bucket.rows),
      importRuns: input.importRuns
    })
  ]
}

function unrevisitedSaves(input: NormalizedSocialPatternInput): SocialPatternSuggestion[] {
  const rows = input.interactions.filter((row) =>
    SAVE_INTERACTION_KINDS.has((readString(row.interactionKind) ?? '').toLowerCase())
  )
  if (rows.length < 5) return []

  return [
    suggestion({
      kind: 'unrevisited-saves',
      title: 'Unrevisited saves',
      description: 'Saved or liked items are present as a backlog that can become a review lens.',
      severity: 'info',
      viewHint: 'Interactions',
      evidence: [
        {
          label: 'Saved-like interactions',
          value: 'Backlog',
          count: rows.length
        }
      ],
      rows,
      importRuns: input.importRuns
    })
  ]
}

function privacyHotspots(input: NormalizedSocialPatternInput): SocialPatternSuggestion[] {
  const rows = [...input.content, ...input.interactions].filter((row) => {
    const privacyClass = privacyClassFor(row)
    const visibility = readString(row.visibility)

    return (
      (privacyClass ? PRIVATE_PRIVACY_CLASSES.has(privacyClass) : false) || visibility === 'private'
    )
  })
  if (rows.length === 0) return []

  const buckets = topBuckets(
    rows,
    (row) => privacyClassFor(row) ?? readString(row.visibility),
    (_row, key) => key,
    1
  )
  return [
    suggestion({
      kind: 'privacy-hotspots',
      title: 'Privacy hotspots',
      description: 'Imported records include private or higher-risk privacy envelopes.',
      severity: 'warning',
      viewHint: 'Content',
      evidence: evidenceForBuckets(buckets, 'Privacy'),
      rows,
      importRuns: input.importRuns
    })
  ]
}

export function createSocialPatternDefinitions(): readonly SocialPatternDefinition[] {
  return [
    {
      kind: 'repeated-creators',
      title: 'Repeated creators',
      description: 'Find creators that appear repeatedly in imported content or interactions.',
      detect: repeatedCreators
    },
    {
      kind: 'bridge-actors',
      title: 'Bridge actors',
      description: 'Find actors that appear across multiple platforms.',
      detect: bridgeActors
    },
    {
      kind: 'cross-source-overlap',
      title: 'Cross-source overlap',
      description: 'Find URLs or titles that recur across platforms.',
      detect: crossSourceOverlap
    },
    {
      kind: 'attention-bursts',
      title: 'Attention bursts',
      description: 'Find days with clustered imported activity.',
      detect: attentionBursts
    },
    {
      kind: 'unrevisited-saves',
      title: 'Unrevisited saves',
      description: 'Find saved-like interactions that can become review backlogs.',
      detect: unrevisitedSaves
    },
    {
      kind: 'privacy-hotspots',
      title: 'Privacy hotspots',
      description: 'Find imported rows with sensitive privacy envelopes.',
      detect: privacyHotspots
    }
  ]
}

export function detectSocialPatterns(
  input: SocialPatternInput
): readonly SocialPatternSuggestion[] {
  const normalizedInput = {
    content: rowsFor(input.content),
    interactions: rowsFor(input.interactions),
    importRuns: rowsFor(input.importRuns)
  }
  const maxSuggestions =
    typeof input.maxSuggestions === 'number' && Number.isFinite(input.maxSuggestions)
      ? Math.max(1, Math.floor(input.maxSuggestions))
      : DEFAULT_MAX_SUGGESTIONS

  return createSocialPatternDefinitions()
    .flatMap((definition) => definition.detect(normalizedInput))
    .sort(
      (left, right) =>
        severityRank(right.severity) - severityRank(left.severity) ||
        right.evidenceCount - left.evidenceCount ||
        left.title.localeCompare(right.title)
    )
    .slice(0, maxSuggestions)
}

function severityRank(severity: SocialPatternSeverity): number {
  if (severity === 'warning') return 3
  if (severity === 'notice') return 2
  return 1
}

export function createSocialPatternSavedViewDraft({
  pattern,
  baseDescriptor,
  workspaceId,
  scope
}: SocialPatternSavedViewDraftInput): SocialPatternSavedViewDraft | null {
  const baseValidation = validateSavedViewDescriptor(baseDescriptor)
  if (!baseValidation.valid) return null

  const resolvedScope = scope ?? baseDescriptor.scope ?? 'workspace'
  const title = `Pattern: ${pattern.title}`
  const description = savedPatternDescription(pattern)
  const descriptor = defineSavedViewDescriptor({
    title,
    description,
    scope: resolvedScope,
    query: baseDescriptor.query
  })
  const validation = validateSavedViewDescriptor(descriptor)
  if (!validation.valid) return null

  const descriptorJson = JSON.stringify(descriptor)

  return {
    deterministicId: createSocialNodeId('workspace-pattern-view', [
      workspaceId ?? DEFAULT_PATTERN_WORKSPACE_ID,
      pattern.id,
      pattern.viewHint
    ]),
    title,
    description,
    descriptor,
    descriptorJson,
    scope: resolvedScope,
    savedViewProperties: {
      title,
      description,
      descriptor: descriptorJson,
      scope: resolvedScope
    }
  }
}
