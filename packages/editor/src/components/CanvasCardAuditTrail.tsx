/**
 * CanvasCardAuditTrail - Compact audit surface for plugin and domain cards.
 */

import type { JSX } from 'react'
import React from 'react'
import { cn } from '../utils'

export type CanvasCardAuditOperation =
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'plugin-render'
  | 'permission-change'
  | 'sync'
  | 'comment'

export type CanvasCardAuditSource = 'history' | 'plugin' | 'domain' | 'sync'

export type CanvasCardAuditEntry = {
  id: string
  operation: CanvasCardAuditOperation
  occurredAt: number | string | Date
  summary?: string | null
  actorLabel?: string | null
  actorId?: string | null
  fields?: readonly string[] | null
  source?: CanvasCardAuditSource | null
  pluginId?: string | null
  contributionId?: string | null
  batchId?: string | null
}

export type CanvasNormalizedCardAuditEntry = CanvasCardAuditEntry & {
  occurredAtMs: number
  operationLabel: string
  actorDisplay: string
  fieldSummary: string | null
}

export type CanvasCardAuditSummary = {
  totalEntries: number
  latestEntry: CanvasNormalizedCardAuditEntry | null
  operationCounts: Readonly<Partial<Record<CanvasCardAuditOperation, number>>>
  actorLabels: readonly string[]
  topFields: readonly { field: string; count: number }[]
}

export type CanvasCardAuditTrailProps = {
  entries: readonly CanvasCardAuditEntry[]
  themeMode: 'light' | 'dark'
  title?: string
  maxEntries?: number
  showWhenEmpty?: boolean
}

const DEFAULT_MAX_AUDIT_ENTRIES = 4
const DEFAULT_ACTOR_LABEL = 'Unknown actor'

const OPERATION_LABELS: Record<CanvasCardAuditOperation, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  restore: 'Restored',
  'plugin-render': 'Rendered',
  'permission-change': 'Permissions',
  sync: 'Synced',
  comment: 'Commented'
}

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getOccurredAtMs(value: number | string | Date): number {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : 0
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeFields(fields: readonly string[] | null | undefined): readonly string[] {
  if (!fields) {
    return []
  }

  return Array.from(
    new Set(fields.map((field) => field.trim()).filter((field) => field.length > 0))
  ).sort((left, right) => left.localeCompare(right))
}

function createFieldSummary(fields: readonly string[]): string | null {
  if (fields.length === 0) {
    return null
  }

  if (fields.length <= 2) {
    return fields.join(', ')
  }

  return `${fields.slice(0, 2).join(', ')} +${fields.length - 2}`
}

function incrementCount<T extends string>(counts: Partial<Record<T, number>>, key: T): void {
  counts[key] = (counts[key] ?? 0) + 1
}

export function getCanvasCardAuditOperationLabel(operation: CanvasCardAuditOperation): string {
  return OPERATION_LABELS[operation]
}

export function formatCanvasCardAuditTimestamp(value: number | string | Date): string {
  const timestamp = getOccurredAtMs(value)
  if (timestamp === 0) {
    return 'Unknown time'
  }

  return new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

export function normalizeCanvasCardAuditEntries(
  entries: readonly CanvasCardAuditEntry[]
): readonly CanvasNormalizedCardAuditEntry[] {
  return entries
    .map((entry) => {
      const fields = normalizeFields(entry.fields)
      return {
        ...entry,
        fields,
        occurredAtMs: getOccurredAtMs(entry.occurredAt),
        operationLabel: getCanvasCardAuditOperationLabel(entry.operation),
        actorDisplay:
          normalizeString(entry.actorLabel) ??
          normalizeString(entry.actorId) ??
          DEFAULT_ACTOR_LABEL,
        fieldSummary: createFieldSummary(fields)
      }
    })
    .sort(
      (left, right) =>
        right.occurredAtMs - left.occurredAtMs ||
        left.operation.localeCompare(right.operation) ||
        left.id.localeCompare(right.id)
    )
}

export function createCanvasCardAuditSummary(
  entries: readonly CanvasCardAuditEntry[]
): CanvasCardAuditSummary {
  const normalized = normalizeCanvasCardAuditEntries(entries)
  const operationCounts: Partial<Record<CanvasCardAuditOperation, number>> = {}
  const fieldCounts = new Map<string, number>()
  const actorLabels = new Set<string>()

  for (const entry of normalized) {
    incrementCount(operationCounts, entry.operation)
    actorLabels.add(entry.actorDisplay)

    for (const field of entry.fields ?? []) {
      fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1)
    }
  }

  return {
    totalEntries: normalized.length,
    latestEntry: normalized[0] ?? null,
    operationCounts,
    actorLabels: Array.from(actorLabels).sort((left, right) => left.localeCompare(right)),
    topFields: Array.from(fieldCounts.entries())
      .map(([field, count]) => ({ field, count }))
      .sort((left, right) => right.count - left.count || left.field.localeCompare(right.field))
      .slice(0, 4)
  }
}

export function CanvasCardAuditTrail({
  entries,
  themeMode,
  title = 'Audit trail',
  maxEntries = DEFAULT_MAX_AUDIT_ENTRIES,
  showWhenEmpty = false
}: CanvasCardAuditTrailProps): JSX.Element | null {
  const normalized = normalizeCanvasCardAuditEntries(entries)
  const visibleEntries = normalized.slice(0, Math.max(1, maxEntries))
  const summary = createCanvasCardAuditSummary(entries)

  if (normalized.length === 0 && !showWhenEmpty) {
    return null
  }

  return (
    <section
      className={cn(
        'rounded-lg border px-2.5 py-2 text-[11px]',
        themeMode === 'dark'
          ? 'border-white/10 bg-white/5 text-white/75'
          : 'border-border/60 bg-muted/25 text-muted-foreground'
      )}
      data-canvas-card-audit-trail="true"
      data-canvas-card-audit-count={summary.totalEntries}
      data-canvas-card-audit-latest-operation={summary.latestEntry?.operation}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-[0.16em]">{title}</span>
        <span data-canvas-card-audit-summary="true">{summary.totalEntries} changes</span>
      </div>

      {visibleEntries.length > 0 ? (
        <ol className="space-y-1.5">
          {visibleEntries.map((entry) => (
            <li
              key={entry.id}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-2"
              data-canvas-card-audit-entry="true"
              data-canvas-card-audit-entry-id={entry.id}
              data-canvas-card-audit-operation={entry.operation}
              data-canvas-card-audit-source={entry.source ?? undefined}
              data-canvas-card-audit-plugin-id={entry.pluginId ?? undefined}
              data-canvas-card-audit-contribution-id={entry.contributionId ?? undefined}
              data-canvas-card-audit-batch-id={entry.batchId ?? undefined}
            >
              <span
                aria-hidden="true"
                className="mt-1 h-1.5 w-1.5 rounded-full bg-current opacity-60"
              />
              <span className="min-w-0">
                <span className="font-medium text-foreground dark:text-white/90">
                  {entry.summary ?? entry.operationLabel}
                </span>
                <span className="block truncate">
                  {entry.actorDisplay} - {formatCanvasCardAuditTimestamp(entry.occurredAtMs)}
                  {entry.fieldSummary ? ` - ${entry.fieldSummary}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p data-canvas-card-audit-empty="true">No audit activity yet.</p>
      )}
    </section>
  )
}
