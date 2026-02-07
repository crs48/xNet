/**
 * AddColumnModal - Modal for adding new database columns with type selection and configuration
 *
 * Supports all column types with appropriate configuration UI:
 * - Text, Number, Checkbox, Date, DateRange (simple types)
 * - Select, MultiSelect (with options editor)
 * - Person, Relation (with target picker)
 * - URL, Email, Phone, File (simple types)
 * - Auto types (created, updated, createdBy, updatedBy)
 */

import type { ColumnType, SelectColor } from '@xnet/data'
import { cn } from '@xnet/ui'
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { SelectOptionsEditor } from './SelectOptionsEditor'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SelectOption {
  id: string
  name: string
  color?: SelectColor
}

export interface ColumnConfig {
  options?: SelectOption[]
  allowCreate?: boolean
  targetDatabase?: string
  allowMultiple?: boolean
  format?: 'number' | 'percent' | 'currency'
  currency?: string
  precision?: number
  includeTime?: boolean
  maxLength?: number
}

export interface NewColumnDefinition {
  name: string
  type: ColumnType
  config: ColumnConfig
  width?: number
}

export interface AddColumnModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Callback when modal should close */
  onClose: () => void
  /** Callback when a new column is created */
  onAdd: (column: NewColumnDefinition) => void
  /** Available databases for relation target (optional) */
  availableDatabases?: Array<{ id: string; name: string }>
}

// ─── Column Type Definitions ──────────────────────────────────────────────────

interface ColumnTypeOption {
  value: ColumnType
  label: string
  icon: string
  description: string
  category: 'basic' | 'selection' | 'reference' | 'temporal' | 'auto' | 'computed'
  hasConfig?: boolean
}

const COLUMN_TYPES: ColumnTypeOption[] = [
  // Basic types
  {
    value: 'text',
    label: 'Text',
    icon: 'Aa',
    description: 'Plain text content',
    category: 'basic'
  },
  {
    value: 'number',
    label: 'Number',
    icon: '#',
    description: 'Numeric values',
    category: 'basic',
    hasConfig: true
  },
  {
    value: 'checkbox',
    label: 'Checkbox',
    icon: '☑',
    description: 'True/false toggle',
    category: 'basic'
  },
  { value: 'url', label: 'URL', icon: '🔗', description: 'Web links', category: 'basic' },
  { value: 'email', label: 'Email', icon: '@', description: 'Email addresses', category: 'basic' },
  { value: 'phone', label: 'Phone', icon: '☎', description: 'Phone numbers', category: 'basic' },
  { value: 'file', label: 'File', icon: '📎', description: 'File attachments', category: 'basic' },

  // Selection types
  {
    value: 'select',
    label: 'Select',
    icon: '▼',
    description: 'Single choice from options',
    category: 'selection',
    hasConfig: true
  },
  {
    value: 'multiSelect',
    label: 'Multi-Select',
    icon: '☰',
    description: 'Multiple choices from options',
    category: 'selection',
    hasConfig: true
  },

  // Temporal types
  {
    value: 'date',
    label: 'Date',
    icon: '📅',
    description: 'Single date',
    category: 'temporal',
    hasConfig: true
  },
  {
    value: 'dateRange',
    label: 'Date Range',
    icon: '📆',
    description: 'Start and end dates',
    category: 'temporal'
  },

  // Reference types
  {
    value: 'person',
    label: 'Person',
    icon: '👤',
    description: 'Team member',
    category: 'reference'
  },
  {
    value: 'relation',
    label: 'Relation',
    icon: '↔',
    description: 'Link to another database',
    category: 'reference',
    hasConfig: true
  },

  // Auto types
  {
    value: 'created',
    label: 'Created Time',
    icon: '🕐',
    description: 'Auto-set creation time',
    category: 'auto'
  },
  {
    value: 'updated',
    label: 'Updated Time',
    icon: '🕑',
    description: 'Auto-update on changes',
    category: 'auto'
  },
  {
    value: 'createdBy',
    label: 'Created By',
    icon: '👤+',
    description: 'Auto-set creator',
    category: 'auto'
  },
  {
    value: 'updatedBy',
    label: 'Updated By',
    icon: '👤~',
    description: 'Auto-update editor',
    category: 'auto'
  }

  // Computed types (future)
  // { value: 'rollup', label: 'Rollup', icon: 'Σ', description: 'Aggregate related values', category: 'computed', hasConfig: true },
  // { value: 'formula', label: 'Formula', icon: 'fx', description: 'Computed expression', category: 'computed', hasConfig: true },
]

const CATEGORY_LABELS: Record<string, string> = {
  basic: 'Basic',
  selection: 'Selection',
  temporal: 'Date & Time',
  reference: 'Reference',
  auto: 'Auto-generated',
  computed: 'Computed'
}

// ─── TypePicker Component ─────────────────────────────────────────────────────

interface TypePickerProps {
  selectedType: ColumnType | null
  onSelect: (type: ColumnType) => void
}

function TypePicker({ selectedType, onSelect }: TypePickerProps) {
  const categories = ['basic', 'selection', 'temporal', 'reference', 'auto'] as const

  return (
    <div className="space-y-4">
      {categories.map((category) => {
        const types = COLUMN_TYPES.filter((t) => t.category === category)
        if (types.length === 0) return null

        return (
          <div key={category}>
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              {CATEGORY_LABELS[category]}
            </h4>
            <div className="grid grid-cols-2 gap-1.5">
              {types.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => onSelect(type.value)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors',
                    selectedType === type.value
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  )}
                >
                  <span className="w-6 h-6 flex items-center justify-center text-base bg-gray-100 dark:bg-gray-700 rounded">
                    {type.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{type.label}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── ConfigEditor Component ───────────────────────────────────────────────────

interface ConfigEditorProps {
  type: ColumnType
  config: ColumnConfig
  onChange: (config: ColumnConfig) => void
  availableDatabases?: Array<{ id: string; name: string }>
}

function ConfigEditor({ type, config, onChange, availableDatabases }: ConfigEditorProps) {
  if (type === 'select' || type === 'multiSelect') {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Options
          </label>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-2 max-h-48 overflow-y-auto">
            <SelectOptionsEditor
              options={config.options ?? []}
              onChange={(options) => onChange({ ...config, options })}
              allowCreate={true}
              compact
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={config.allowCreate ?? false}
            onChange={(e) => onChange({ ...config, allowCreate: e.target.checked })}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Allow creating new options inline
        </label>
      </div>
    )
  }

  if (type === 'number') {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Format
          </label>
          <select
            value={config.format ?? 'number'}
            onChange={(e) =>
              onChange({ ...config, format: e.target.value as ColumnConfig['format'] })
            }
            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="number">Number</option>
            <option value="percent">Percent</option>
            <option value="currency">Currency</option>
          </select>
        </div>
        {config.format === 'currency' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Currency
            </label>
            <select
              value={config.currency ?? 'USD'}
              onChange={(e) => onChange({ ...config, currency: e.target.value })}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
              <option value="CAD">CAD ($)</option>
              <option value="AUD">AUD ($)</option>
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Decimal Places
          </label>
          <input
            type="number"
            min={0}
            max={10}
            value={config.precision ?? 0}
            onChange={(e) => onChange({ ...config, precision: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>
    )
  }

  if (type === 'date') {
    return (
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={config.includeTime ?? false}
            onChange={(e) => onChange({ ...config, includeTime: e.target.checked })}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Include time
        </label>
      </div>
    )
  }

  if (type === 'relation') {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Target Database
          </label>
          {availableDatabases && availableDatabases.length > 0 ? (
            <select
              value={config.targetDatabase ?? ''}
              onChange={(e) => onChange({ ...config, targetDatabase: e.target.value })}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">Select a database...</option>
              {availableDatabases.map((db) => (
                <option key={db.id} value={db.id}>
                  {db.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No other databases available
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={config.allowMultiple ?? true}
            onChange={(e) => onChange({ ...config, allowMultiple: e.target.checked })}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Allow linking multiple rows
        </label>
      </div>
    )
  }

  // No config needed for this type
  return null
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * AddColumnModal component for adding new database columns
 */
export function AddColumnModal({
  isOpen,
  onClose,
  onAdd,
  availableDatabases
}: AddColumnModalProps): React.JSX.Element | null {
  const [step, setStep] = useState<'type' | 'config'>('type')
  const [name, setName] = useState('')
  const [selectedType, setSelectedType] = useState<ColumnType | null>(null)
  const [config, setConfig] = useState<ColumnConfig>({})
  const nameInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('type')
      setName('')
      setSelectedType(null)
      setConfig({})
    }
  }, [isOpen])

  // Focus name input when step changes to config
  useEffect(() => {
    if (step === 'config' && nameInputRef.current) {
      nameInputRef.current.focus()
    }
  }, [step])

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose]
  )

  const handleTypeSelect = useCallback((type: ColumnType) => {
    setSelectedType(type)
    // Set default name based on type
    const typeOption = COLUMN_TYPES.find((t) => t.value === type)
    setName(typeOption?.label ?? 'New Column')
    // Initialize config for types that need it
    if (type === 'select' || type === 'multiSelect') {
      setConfig({ options: [], allowCreate: true })
    } else if (type === 'number') {
      setConfig({ format: 'number', precision: 0 })
    } else if (type === 'relation') {
      setConfig({ allowMultiple: true })
    } else if (type === 'date') {
      setConfig({ includeTime: false })
    } else {
      setConfig({})
    }
    setStep('config')
  }, [])

  const handleBack = useCallback(() => {
    setStep('type')
  }, [])

  const handleAdd = useCallback(() => {
    if (!selectedType || !name.trim()) return

    const newColumn: NewColumnDefinition = {
      name: name.trim(),
      type: selectedType,
      config,
      width: 150
    }

    onAdd(newColumn)
    onClose()
  }, [selectedType, name, config, onAdd, onClose])

  const typeOption = selectedType ? COLUMN_TYPES.find((t) => t.value === selectedType) : null
  const needsConfig = typeOption?.hasConfig ?? false

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {step === 'type' ? 'Add Column' : 'Configure Column'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {step === 'type' ? (
            <TypePicker selectedType={selectedType} onSelect={handleTypeSelect} />
          ) : (
            <div className="space-y-4">
              {/* Column name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Column Name
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter column name..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Type indicator */}
              {typeOption && (
                <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <span className="w-8 h-8 flex items-center justify-center text-lg bg-white dark:bg-gray-600 rounded">
                    {typeOption.icon}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {typeOption.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {typeOption.description}
                    </div>
                  </div>
                </div>
              )}

              {/* Type-specific config */}
              {needsConfig && selectedType && (
                <ConfigEditor
                  type={selectedType}
                  config={config}
                  onChange={setConfig}
                  availableDatabases={availableDatabases}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          {step === 'config' ? (
            <>
              <button
                type="button"
                onClick={handleBack}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!name.trim()}
                className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-md transition-colors"
              >
                Add Column
              </button>
            </>
          ) : (
            <>
              <div />
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AddColumnModal
