/**
 * FilterBuilder - UI component for building filter conditions
 *
 * Allows users to create complex filter groups with AND/OR logic.
 */

import type { Filter, FilterGroup, FilterOperator } from '../types.js'
import type {
  PropertyDefinition,
  FilterOperator as DataFilterOperator,
  ColumnType
} from '@xnetjs/data'
import { OPERATORS_BY_TYPE, getOperatorLabel, operatorRequiresValue } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import { Plus, Trash2, X } from 'lucide-react'
import React, { useCallback, useState, type JSX } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FilterBuilderProps {
  /** Available properties to filter on */
  properties: PropertyDefinition[]
  /** Current filter group */
  value: FilterGroup | null
  /** Callback when filter changes */
  onChange: (filter: FilterGroup | null) => void
  /** Additional CSS class */
  className?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Filter builder component for creating filter conditions.
 */
export function FilterBuilder({
  properties,
  value,
  onChange,
  className
}: FilterBuilderProps): JSX.Element {
  const [group, setGroup] = useState<FilterGroup>(
    value ?? {
      type: 'and',
      filters: []
    }
  )

  // Add a new filter condition
  const addFilter = useCallback(() => {
    const firstProp = properties[0]
    if (!firstProp) return

    const propKey = firstProp['@id'].split('#').pop() || firstProp.name
    const operators = getOperatorsForProperty(firstProp.type)

    const newFilter: Filter = {
      id: crypto.randomUUID(),
      propertyId: propKey,
      operator: operators[0] ?? 'equals',
      value: null
    }

    const updated: FilterGroup = {
      ...group,
      filters: [...group.filters, newFilter]
    }

    setGroup(updated)
    onChange(updated.filters.length > 0 ? updated : null)
  }, [properties, group, onChange])

  // Update a filter condition
  const updateFilter = useCallback(
    (filterId: string, updates: Partial<Filter>) => {
      const updated: FilterGroup = {
        ...group,
        filters: group.filters.map((f) => (f.id === filterId ? { ...f, ...updates } : f))
      }

      setGroup(updated)
      onChange(updated.filters.length > 0 ? updated : null)
    },
    [group, onChange]
  )

  // Remove a filter condition
  const removeFilter = useCallback(
    (filterId: string) => {
      const updated: FilterGroup = {
        ...group,
        filters: group.filters.filter((f) => f.id !== filterId)
      }

      setGroup(updated)
      onChange(updated.filters.length > 0 ? updated : null)
    },
    [group, onChange]
  )

  // Toggle AND/OR
  const toggleOperator = useCallback(() => {
    const updated: FilterGroup = {
      ...group,
      type: group.type === 'and' ? 'or' : 'and'
    }

    setGroup(updated)
    onChange(updated.filters.length > 0 ? updated : null)
  }, [group, onChange])

  // Clear all filters
  const clearAll = useCallback(() => {
    const updated: FilterGroup = { type: 'and', filters: [] }
    setGroup(updated)
    onChange(null)
  }, [onChange])

  return (
    <div className={cn('p-4 space-y-3', className)}>
      {/* Filter conditions */}
      {group.filters.map((filter, index) => {
        const property = properties.find((p) => {
          const propKey = p['@id'].split('#').pop() || p.name
          return propKey === filter.propertyId
        })

        return (
          <div key={filter.id} className="flex items-center gap-2">
            {/* AND/OR toggle (shown between conditions) */}
            {index > 0 && (
              <button
                type="button"
                className="px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 uppercase"
                onClick={toggleOperator}
              >
                {group.type}
              </button>
            )}

            {/* Property selector */}
            <select
              className="px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
              value={filter.propertyId}
              onChange={(e) => {
                const newProp = properties.find((p) => {
                  const propKey = p['@id'].split('#').pop() || p.name
                  return propKey === e.target.value
                })
                if (newProp) {
                  const operators = getOperatorsForProperty(newProp.type)
                  updateFilter(filter.id, {
                    propertyId: e.target.value,
                    operator: operators[0] ?? 'equals',
                    value: null
                  })
                }
              }}
            >
              {properties.map((prop) => {
                const propKey = prop['@id'].split('#').pop() || prop.name
                return (
                  <option key={propKey} value={propKey}>
                    {prop.name}
                  </option>
                )
              })}
            </select>

            {/* Operator selector */}
            <select
              className="px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
              value={filter.operator}
              onChange={(e) =>
                updateFilter(filter.id, {
                  operator: e.target.value as FilterOperator,
                  value: null
                })
              }
            >
              {property &&
                getOperatorsForProperty(property.type).map((op) => (
                  <option key={op} value={op}>
                    {getOperatorLabel(op as DataFilterOperator)}
                  </option>
                ))}
            </select>

            {/* Value input */}
            {operatorRequiresValue(filter.operator as DataFilterOperator) && (
              <FilterValueInput
                property={property}
                operator={filter.operator}
                value={filter.value}
                onChange={(value) => updateFilter(filter.id, { value })}
              />
            )}

            {/* Remove button */}
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
              onClick={() => removeFilter(filter.id)}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )
      })}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
          onClick={addFilter}
        >
          <Plus className="w-4 h-4" />
          Add filter
        </button>

        {group.filters.length > 0 && (
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            onClick={clearAll}
          >
            <X className="w-4 h-4" />
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Filter Value Input ───────────────────────────────────────────────────────

interface FilterValueInputProps {
  property: PropertyDefinition | undefined
  operator: FilterOperator
  value: unknown
  onChange: (value: unknown) => void
}

function FilterValueInput({
  property,
  operator,
  value,
  onChange
}: FilterValueInputProps): JSX.Element | null {
  if (!property) return null

  const type = property.type

  // Text input for text-like types
  if (type === 'text' || type === 'url' || type === 'email' || type === 'phone') {
    return (
      <input
        type="text"
        className="px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 min-w-[150px]"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter value..."
      />
    )
  }

  // Number input
  if (type === 'number') {
    if (operator === 'between') {
      const [min, max] = (value as [number, number]) ?? [0, 0]
      return (
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 w-20"
            value={min ?? ''}
            onChange={(e) => onChange([parseFloat(e.target.value) || 0, max])}
          />
          <span className="text-gray-500">to</span>
          <input
            type="number"
            className="px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 w-20"
            value={max ?? ''}
            onChange={(e) => onChange([min, parseFloat(e.target.value) || 0])}
          />
        </div>
      )
    }
    return (
      <input
        type="number"
        className="px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 w-24"
        value={(value as number) ?? ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    )
  }

  // Checkbox
  if (type === 'checkbox') {
    return (
      <select
        className="px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
        value={String(value ?? true)}
        onChange={(e) => onChange(e.target.value === 'true')}
      >
        <option value="true">Checked</option>
        <option value="false">Unchecked</option>
      </select>
    )
  }

  // Date input
  if (type === 'date' || type === 'dateRange') {
    if (operator === 'between') {
      const [start, end] = (value as [string, string]) ?? ['', '']
      return (
        <div className="flex items-center gap-1">
          <input
            type="date"
            className="px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
            value={start ?? ''}
            onChange={(e) => onChange([e.target.value, end])}
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            className="px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
            value={end ?? ''}
            onChange={(e) => onChange([start, e.target.value])}
          />
        </div>
      )
    }
    return (
      <input
        type="date"
        className="px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  // Select
  if (type === 'select') {
    const options = (property.config as { options?: Array<{ id: string; name: string }> })?.options
    return (
      <select
        className="px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select...</option>
        {options?.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
    )
  }

  // Default text input
  return (
    <input
      type="text"
      className="px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 min-w-[150px]"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Enter value..."
    />
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get valid operators for a property type.
 */
function getOperatorsForProperty(type: string): FilterOperator[] {
  // Map property types to column types for OPERATORS_BY_TYPE lookup
  const columnType = type as ColumnType
  const operators = OPERATORS_BY_TYPE[columnType]
  return (operators ?? ['equals', 'notEquals', 'isEmpty', 'isNotEmpty']) as FilterOperator[]
}
