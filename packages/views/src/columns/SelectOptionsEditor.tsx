/**
 * SelectOptionsEditor - Editor for managing select/multiSelect options
 *
 * Allows users to:
 * - Add new options
 * - Edit option names
 * - Change option colors
 * - Reorder options (drag and drop)
 * - Delete options
 */

import type { SelectColor } from '@xnet/data'
import { cn } from '@xnet/ui'
import { nanoid } from 'nanoid'
import React, { useState, useRef, useEffect, useCallback } from 'react'

/**
 * Select option with typed color
 */
interface SelectOption {
  id: string
  name: string
  color?: SelectColor
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SelectOptionsEditorProps {
  /** Current options */
  options: SelectOption[]
  /** Callback when options change */
  onChange: (options: SelectOption[]) => void
  /** Whether to allow creating new options */
  allowCreate?: boolean
  /** Compact mode for inline editing */
  compact?: boolean
}

// ─── Color Palette ────────────────────────────────────────────────────────────

const SELECT_COLORS: { value: SelectColor; label: string; bg: string; text: string }[] = [
  { value: 'gray', label: 'Gray', bg: '#6b7280', text: 'white' },
  { value: 'brown', label: 'Brown', bg: '#92400e', text: 'white' },
  { value: 'orange', label: 'Orange', bg: '#ea580c', text: 'white' },
  { value: 'yellow', label: 'Yellow', bg: '#ca8a04', text: 'white' },
  { value: 'green', label: 'Green', bg: '#16a34a', text: 'white' },
  { value: 'blue', label: 'Blue', bg: '#2563eb', text: 'white' },
  { value: 'purple', label: 'Purple', bg: '#9333ea', text: 'white' },
  { value: 'pink', label: 'Pink', bg: '#db2777', text: 'white' },
  { value: 'red', label: 'Red', bg: '#dc2626', text: 'white' }
]

/**
 * Get background color for a SelectColor value
 */
export function getColorBg(color?: SelectColor): string {
  return SELECT_COLORS.find((c) => c.value === color)?.bg ?? '#6b7280'
}

// ─── OptionRow Component ──────────────────────────────────────────────────────

interface OptionRowProps {
  option: SelectOption
  onUpdate: (updates: Partial<SelectOption>) => void
  onDelete: () => void
  compact?: boolean
}

function OptionRow({ option, onUpdate, onDelete, compact }: OptionRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [editValue, setEditValue] = useState(option.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Close color picker on outside click
  useEffect(() => {
    if (!showColorPicker) return

    function handleClick(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showColorPicker])

  const handleSave = useCallback(() => {
    if (editValue.trim()) {
      onUpdate({ name: editValue.trim() })
    } else {
      setEditValue(option.name)
    }
    setIsEditing(false)
  }, [editValue, option.name, onUpdate])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSave()
      } else if (e.key === 'Escape') {
        setEditValue(option.name)
        setIsEditing(false)
      }
    },
    [handleSave, option.name]
  )

  const handleColorSelect = useCallback(
    (color: SelectColor) => {
      onUpdate({ color })
      setShowColorPicker(false)
    },
    [onUpdate]
  )

  const colorBg = getColorBg(option.color)

  return (
    <div
      className={cn(
        'flex items-center gap-2 group',
        compact ? 'py-1' : 'py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800'
      )}
    >
      {/* Color indicator / picker trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="w-4 h-4 rounded-sm flex-shrink-0 hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 transition-all"
          style={{ backgroundColor: colorBg }}
          title="Change color"
        />

        {/* Color picker dropdown */}
        {showColorPicker && (
          <div
            ref={colorPickerRef}
            className="absolute left-0 top-6 z-50 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
          >
            <div className="grid grid-cols-3 gap-1.5">
              {SELECT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => handleColorSelect(c.value)}
                  className={cn(
                    'w-6 h-6 rounded-sm transition-all',
                    option.color === c.value && 'ring-2 ring-offset-1 ring-gray-600'
                  )}
                  style={{ backgroundColor: c.bg }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Option name (editable) */}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 px-1.5 py-0.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
        />
      ) : (
        <span
          className="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-200 truncate cursor-pointer"
          onClick={() => {
            setEditValue(option.name)
            setIsEditing(true)
          }}
          title={option.name}
        >
          {option.name}
        </span>
      )}

      {/* Delete button */}
      <button
        type="button"
        onClick={onDelete}
        className={cn(
          'p-1 text-gray-400 hover:text-red-500 transition-colors',
          compact ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
        title="Delete option"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  )
}

// ─── AddOptionInput Component ─────────────────────────────────────────────────

interface AddOptionInputProps {
  onAdd: (option: SelectOption) => void
  compact?: boolean
}

function AddOptionInput({ onAdd, compact }: AddOptionInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleAdd = useCallback(() => {
    if (!value.trim()) return

    const newOption: SelectOption = {
      id: nanoid(10),
      name: value.trim(),
      color: SELECT_COLORS[Math.floor(Math.random() * SELECT_COLORS.length)]?.value ?? 'gray'
    }

    onAdd(newOption)
    setValue('')
    inputRef.current?.focus()
  }, [value, onAdd])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleAdd()
      }
    },
    [handleAdd]
  )

  return (
    <div className={cn('flex items-center gap-2', compact ? 'mt-1' : 'mt-2 px-2')}>
      <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-gray-400">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add an option..."
        className="flex-1 min-w-0 px-1.5 py-1 text-sm bg-transparent border-none outline-none placeholder:text-gray-400 text-gray-900 dark:text-gray-100"
      />
      {value.trim() && (
        <button
          type="button"
          onClick={handleAdd}
          className="px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
        >
          Add
        </button>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * SelectOptionsEditor component for managing select/multiSelect options
 */
export function SelectOptionsEditor({
  options,
  onChange,
  allowCreate = true,
  compact = false
}: SelectOptionsEditorProps): React.JSX.Element {
  const handleUpdateOption = useCallback(
    (id: string, updates: Partial<SelectOption>) => {
      const updated = options.map((opt) => (opt.id === id ? { ...opt, ...updates } : opt))
      onChange(updated)
    },
    [options, onChange]
  )

  const handleDeleteOption = useCallback(
    (id: string) => {
      const updated = options.filter((opt) => opt.id !== id)
      onChange(updated)
    },
    [options, onChange]
  )

  const handleAddOption = useCallback(
    (option: SelectOption) => {
      onChange([...options, option])
    },
    [options, onChange]
  )

  return (
    <div className={cn('select-options-editor', compact ? '' : 'space-y-1')}>
      {options.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 italic px-2 py-2">
          No options yet
        </div>
      ) : (
        <div className="space-y-0.5">
          {options.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              onUpdate={(updates) => handleUpdateOption(option.id, updates)}
              onDelete={() => handleDeleteOption(option.id)}
              compact={compact}
            />
          ))}
        </div>
      )}

      {allowCreate && <AddOptionInput onAdd={handleAddOption} compact={compact} />}
    </div>
  )
}

export default SelectOptionsEditor
