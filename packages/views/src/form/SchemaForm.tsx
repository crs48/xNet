/**
 * SchemaForm — a schema-driven stacked edit form (exploration 0190).
 *
 * Renders one row per form field using the same `getPropertyHandler` editors
 * the grid and peek panel use, so there is a single source of truth for how
 * each property *type* is edited. Domain surfaces (Deal, Contact, Metric, …)
 * compose this instead of hand-coding form inputs; they customise *which*
 * fields appear and how they group via `SchemaToFormOptions`, never how a
 * field type renders.
 */

import type { CellValue, FileRef, Schema } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import React, { useCallback } from 'react'
import { getPropertyHandler } from '../properties/index.js'
import {
  schemaToFormFields,
  type FormField,
  type SchemaToFormOptions
} from './schema-to-form-fields.js'

export interface SchemaFormProps {
  schema: Schema
  /** Current node property values, keyed by property name. */
  value: Record<string, CellValue>
  /** Persist a committed field edit. */
  onChange: (key: string, next: CellValue) => void
  options?: SchemaToFormOptions
  readOnly?: boolean
  onCreateOption?: (fieldId: string, name: string) => Promise<string | null>
  onUploadFile?: (file: File) => Promise<FileRef | null>
  onResolveFileUrl?: (ref: FileRef) => Promise<string>
  className?: string
}

function SchemaFormRow({
  field,
  value,
  onChange,
  readOnly,
  onCreateOption,
  onUploadFile,
  onResolveFileUrl
}: {
  field: FormField
  value: CellValue
  onChange: (next: CellValue) => void
  readOnly?: boolean
  onCreateOption?: SchemaFormProps['onCreateOption']
  onUploadFile?: SchemaFormProps['onUploadFile']
  onResolveFileUrl?: SchemaFormProps['onResolveFileUrl']
}): React.JSX.Element {
  const handler = getPropertyHandler(field.type)
  const cellValue = value ?? null
  const locked = readOnly || field.readonly

  const config = {
    allowCreate: true,
    ...field.config,
    options: field.options,
    ...(onCreateOption ? { onCreateOption: (name: string) => onCreateOption(field.id, name) } : {}),
    ...(onUploadFile ? { onUploadFile } : {}),
    ...(onResolveFileUrl ? { onResolveFileUrl } : {})
  }

  const commit = useCallback(
    (next: CellValue) => {
      onChange(next)
    },
    [onChange]
  )

  // Mobile-first (exploration 0196): label stacks above the field with a
  // 44px touch target below sm; the original side-by-side 28px layout
  // returns at sm+ so desktop is unchanged.
  return (
    <div className="group flex flex-col gap-1 px-1 py-1.5 sm:flex-row sm:items-start sm:gap-3">
      <div className="text-xs text-gray-500 dark:text-gray-400 sm:w-32 sm:shrink-0 sm:truncate sm:pt-1">
        {field.name}
      </div>
      <div className="min-h-[44px] flex-1 rounded px-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 sm:min-h-[28px]">
        {locked ? (
          <div className="pt-0.5 text-sm">{handler.render(cellValue, config)}</div>
        ) : (
          <handler.Editor
            value={cellValue as never}
            config={config}
            onChange={(next) => commit(next as CellValue)}
            onCommit={(next) => commit((next ?? cellValue) as CellValue)}
          />
        )}
      </div>
    </div>
  )
}

export function SchemaForm({
  schema,
  value,
  onChange,
  options,
  readOnly,
  onCreateOption,
  onUploadFile,
  onResolveFileUrl,
  className
}: SchemaFormProps): React.JSX.Element {
  const fields = schemaToFormFields(schema, options)

  // Stable group order: first appearance wins. Ungrouped fields render under
  // an empty heading at the top.
  const groupOrder: string[] = []
  const byGroup = new Map<string, FormField[]>()
  for (const field of fields) {
    const key = field.group ?? ''
    if (!byGroup.has(key)) {
      byGroup.set(key, [])
      groupOrder.push(key)
    }
    byGroup.get(key)!.push(field)
  }

  return (
    <div className={cn('schema-form flex flex-col', className)}>
      {groupOrder.map((group) => (
        <div key={group || '_default'} className="schema-form__group">
          {group && (
            <div className="px-1 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {group}
            </div>
          )}
          {byGroup.get(group)!.map((field) => (
            <SchemaFormRow
              key={field.id}
              field={field}
              value={value[field.id] ?? null}
              onChange={(next) => onChange(field.id, next)}
              readOnly={readOnly}
              onCreateOption={onCreateOption}
              onUploadFile={onUploadFile}
              onResolveFileUrl={onResolveFileUrl}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
