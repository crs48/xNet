/**
 * FieldConfigEditor — type-specific configuration for a field, rendered
 * inside the shell's field menu:
 * - relation: pick the target database
 * - rollup:   pick the relation field, target field, and aggregation
 * - formula:  expression editor ({{fieldId}} refs)
 *
 * Uses useQuery for cross-database lookups (same precedent as the
 * relation editor), so it lives here rather than per-shell.
 */

import type { FieldConfig, RollupAggregation } from '@xnetjs/data'
import type { GridFieldModel } from '@xnetjs/react'
import { DatabaseFieldSchema, DatabaseSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import React from 'react'

const AGGREGATIONS: RollupAggregation[] = [
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'unique',
  'empty',
  'notEmpty',
  'percentEmpty',
  'percentNotEmpty',
  'concat'
]

/** Accepted-type presets for file fields; empty value means "anything". */
const ACCEPT_PRESETS: Array<{ key: string; label: string; value: string[] }> = [
  { key: 'any', label: 'Any file type', value: [] },
  { key: 'images', label: 'Images only', value: ['image/*'] },
  { key: 'media', label: 'Images & video', value: ['image/*', 'video/*'] },
  { key: 'documents', label: 'Documents', value: ['application/pdf', 'text/*'] }
]

export interface FieldConfigEditorProps {
  /** The field being configured */
  field: GridFieldModel
  /** All fields of this database (for relation-field pickers) */
  fields: GridFieldModel[]
  /** Persist a config change */
  onSave: (config: FieldConfig) => void
}

const selectClass =
  'w-full mb-2 px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-700 bg-transparent'

export function FieldConfigEditor({
  field,
  fields,
  onSave
}: FieldConfigEditorProps): React.JSX.Element | null {
  const config = field.config as Record<string, unknown>

  // ─── relation: target database picker ─────────────────────────────────────
  const isRelation = field.type === 'relation'
  const { data: databases } = useQuery(DatabaseSchema, {
    enabled: isRelation
  })

  // ─── rollup: relation field → target field → aggregation ─────────────────
  const isRollup = field.type === 'rollup'
  const relationFields = fields.filter((f) => f.type === 'relation')
  const relationColumn = (config.relationColumn as string) ?? ''
  const relationField = relationFields.find((f) => f.id === relationColumn)
  const targetDatabaseId =
    ((relationField?.config as Record<string, unknown>)?.targetDatabase as string) ?? ''
  const { data: targetFieldNodes } = useQuery(DatabaseFieldSchema, {
    where: { database: targetDatabaseId },
    orderBy: { sortKey: 'asc' },
    enabled: isRollup && targetDatabaseId !== ''
  })

  if (isRelation) {
    return (
      <select
        aria-label="Relation target database"
        className={selectClass}
        value={(config.targetDatabase as string) ?? ''}
        onChange={(e) => onSave({ ...config, targetDatabase: e.target.value } as FieldConfig)}
      >
        <option value="">Select target database…</option>
        {(databases ?? [])
          .filter((db): db is NonNullable<typeof db> => db !== null)
          .map((db) => (
            <option key={db.id} value={db.id}>
              {(db.title as string) || 'Untitled Database'}
            </option>
          ))}
      </select>
    )
  }

  if (isRollup) {
    return (
      <div>
        <select
          aria-label="Rollup relation field"
          className={selectClass}
          value={relationColumn}
          onChange={(e) => onSave({ ...config, relationColumn: e.target.value } as FieldConfig)}
        >
          <option value="">Relation field…</option>
          {relationFields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Rollup target field"
          className={selectClass}
          value={(config.targetColumn as string) ?? ''}
          disabled={!targetDatabaseId}
          onChange={(e) => onSave({ ...config, targetColumn: e.target.value } as FieldConfig)}
        >
          <option value="">
            {targetDatabaseId ? 'Target field…' : 'Pick a relation field first'}
          </option>
          {((targetFieldNodes ?? []) as Array<{ id: string; name?: unknown } | null>)
            .filter((f): f is { id: string; name?: unknown } => f !== null)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {String(f.name ?? f.id)}
              </option>
            ))}
        </select>
        <select
          aria-label="Rollup aggregation"
          className={selectClass}
          value={(config.aggregation as string) ?? 'count'}
          onChange={(e) =>
            onSave({ ...config, aggregation: e.target.value as RollupAggregation } as FieldConfig)
          }
        >
          {AGGREGATIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // ─── file: multi-attachment toggle + accepted types (exploration 0385) ────
  if (field.type === 'file') {
    const accept = (config.accept as string[] | undefined) ?? []
    const acceptPreset =
      ACCEPT_PRESETS.find((p) => p.value.join(',') === accept.join(','))?.key ??
      (accept.length ? 'custom' : 'any')

    return (
      <div>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(config.allowMultiple)}
            onChange={(e) => onSave({ ...config, allowMultiple: e.target.checked } as FieldConfig)}
          />
          Allow multiple files
        </label>
        <select
          aria-label="Accepted file types"
          className={selectClass}
          value={acceptPreset}
          onChange={(e) => {
            const preset = ACCEPT_PRESETS.find((p) => p.key === e.target.value)
            const next = { ...config }
            if (!preset || preset.value.length === 0) delete next.accept
            else next.accept = preset.value
            onSave(next as FieldConfig)
          }}
        >
          {ACCEPT_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
          {acceptPreset === 'custom' && (
            <option value="custom">Custom ({accept.join(', ')})</option>
          )}
        </select>
      </div>
    )
  }

  if (field.type === 'formula') {
    return (
      <textarea
        aria-label="Formula expression"
        placeholder="e.g. {{price}} * {{qty}}"
        defaultValue={(config.expression as string) ?? ''}
        rows={2}
        className="w-full mb-2 px-2 py-1 font-mono text-xs rounded border border-gray-200 dark:border-gray-700 bg-transparent outline-none focus:border-blue-400 resize-none"
        onKeyDown={(e) => e.stopPropagation()}
        onBlur={(e) =>
          onSave({
            ...config,
            expression: e.target.value.trim(),
            resultType: (config.resultType as string) ?? 'number'
          } as FieldConfig)
        }
      />
    )
  }

  return null
}
