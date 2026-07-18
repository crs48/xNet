/**
 * ViewOptionsBar — per-view configuration strip (exploration 0339).
 *
 * Renders the active view registration's `configFields` as compact
 * selects (field pickers filtered by type, or fixed options) and writes
 * changes through `onPatchConfig`. Generic over the registry, so plugin
 * views get a config UI for free.
 */

import { Select, cn } from '@xnetjs/ui'
import React from 'react'
import type { GridField } from '../grid/model.js'
import type { ViewConfigField } from '../registry.js'
import type { DatabaseViewConfig } from './contract.js'

const NONE = '__none__'

export interface ViewOptionsBarProps {
  configFields: ViewConfigField[]
  fields: GridField[]
  config: DatabaseViewConfig
  onPatchConfig: (patch: Partial<DatabaseViewConfig>) => void
  className?: string
}

export function ViewOptionsBar({
  configFields,
  fields,
  config,
  onPatchConfig,
  className
}: ViewOptionsBarProps): React.JSX.Element | null {
  if (configFields.length === 0) return null
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3 py-1.5',
        className
      )}
      data-testid="view-options-bar"
    >
      {configFields.map((field) => {
        const value = config[field.key]
        const current = typeof value === 'string' ? value : NONE
        const options =
          field.type === 'field-select'
            ? [
                { value: NONE, label: field.required ? 'Choose…' : 'None' },
                ...fields
                  .filter((f) => !field.fieldTypes || field.fieldTypes.includes(f.type))
                  .map((f) => ({ value: f.id, label: f.name }))
              ]
            : [{ value: NONE, label: 'Default' }, ...(field.options ?? [])]
        const missing = field.required && current === NONE
        return (
          <label key={field.key} className="flex items-center gap-1.5">
            <span className={cn('text-[11px]', missing ? 'text-amber-600' : 'text-ink-3')}>
              {field.label}
            </span>
            <Select
              className="min-w-28"
              options={options}
              value={current}
              onValueChange={(next) => {
                onPatchConfig({
                  [field.key]: next === NONE ? null : next
                } as Partial<DatabaseViewConfig>)
              }}
            />
          </label>
        )
      })}
    </div>
  )
}
