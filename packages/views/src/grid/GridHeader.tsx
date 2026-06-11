/**
 * GridHeader — column headers with sort toggle, dnd-kit reorder,
 * pointer-based resize, column selection, and the add-field button.
 */

import type { GridField } from './model.js'
import type { SortConfig } from '@xnetjs/data'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@xnetjs/ui'
import { ArrowDown, ArrowUp, MoreHorizontal, Plus } from 'lucide-react'
import React, { useCallback, useRef } from 'react'

const MIN_WIDTH = 60

export interface GridHeaderProps {
  fields: GridField[]
  gutterWidth: number
  sorts?: SortConfig[]
  readOnly?: boolean
  onToggleSort?: (fieldId: string) => void
  onMoveField?: (fieldId: string, targetIndex: number) => void
  onResizeField?: (fieldId: string, width: number) => void
  onFieldMenu?: (fieldId: string, anchorEl: HTMLElement) => void
  onAddField?: (anchorEl: HTMLElement) => void
  onSelectColumn?: (colIndex: number, shiftKey: boolean) => void
}

interface HeaderCellProps {
  field: GridField
  colIndex: number
  sort?: SortConfig
  readOnly?: boolean
  onToggleSort?: (fieldId: string) => void
  onResizeField?: (fieldId: string, width: number) => void
  onFieldMenu?: (fieldId: string, anchorEl: HTMLElement) => void
  onSelectColumn?: (colIndex: number, shiftKey: boolean) => void
}

function HeaderCell({
  field,
  colIndex,
  sort,
  readOnly,
  onToggleSort,
  onResizeField,
  onFieldMenu,
  onSelectColumn
}: HeaderCellProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    disabled: readOnly
  })
  const resizing = useRef(false)

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      resizing.current = true
      const startX = e.clientX
      const startWidth = field.width

      const onMove = (ev: PointerEvent): void => {
        const width = Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX))
        onResizeField?.(field.id, Math.round(width))
      }
      const onUp = (): void => {
        resizing.current = false
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [field.id, field.width, onResizeField]
  )

  return (
    <div
      ref={setNodeRef}
      role="columnheader"
      aria-colindex={colIndex + 1}
      aria-sort={sort ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
      data-grid-header
      data-field-id={field.id}
      style={{
        width: field.width,
        minWidth: field.width,
        maxWidth: field.width,
        transform: CSS.Translate.toString(transform),
        transition
      }}
      className={cn(
        'relative group flex items-center gap-1 px-2 h-8 border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 text-xs font-medium text-gray-600 dark:text-gray-300',
        isDragging && 'opacity-60 z-20'
      )}
      onClick={(e) => {
        if (resizing.current) return
        if (e.altKey) {
          onSelectColumn?.(colIndex, e.shiftKey)
        } else {
          onToggleSort?.(field.id)
        }
      }}
    >
      {/* Drag handle covers the label */}
      <span
        className="flex-1 truncate cursor-grab active:cursor-grabbing"
        title={`${field.name} — click to sort, drag to reorder`}
        {...attributes}
        {...listeners}
      >
        {field.name}
      </span>

      {sort &&
        (sort.direction === 'asc' ? (
          <ArrowUp data-testid={`sort-asc-${field.id}`} className="w-3 h-3 text-blue-500" />
        ) : (
          <ArrowDown data-testid={`sort-desc-${field.id}`} className="w-3 h-3 text-blue-500" />
        ))}

      {!readOnly && onFieldMenu && (
        <button
          type="button"
          aria-label={`${field.name} field menu`}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          onClick={(e) => {
            e.stopPropagation()
            onFieldMenu?.(field.id, e.currentTarget)
          }}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Resize handle */}
      {!readOnly && (
        <div
          data-testid={`resize-${field.id}`}
          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/60"
          onPointerDown={startResize}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  )
}

export function GridHeader({
  fields,
  gutterWidth,
  sorts,
  readOnly,
  onToggleSort,
  onMoveField,
  onResizeField,
  onFieldMenu,
  onAddField,
  onSelectColumn
}: GridHeaderProps): React.JSX.Element {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Touch: long-press to drag so taps/scrolls pass through
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const targetIndex = fields.findIndex((f) => f.id === over.id)
      if (targetIndex >= 0) {
        onMoveField?.(String(active.id), targetIndex)
      }
    },
    [fields, onMoveField]
  )

  return (
    <div role="row" aria-rowindex={1} className="flex sticky top-0 z-10">
      {/* Gutter corner */}
      <div
        style={{ width: gutterWidth, minWidth: gutterWidth }}
        className="h-8 border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80"
      />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={horizontalListSortingStrategy}>
          {fields.map((field, i) => (
            <HeaderCell
              key={field.id}
              field={field}
              colIndex={i}
              sort={sorts?.find((s) => s.columnId === field.id)}
              readOnly={readOnly}
              onToggleSort={onToggleSort}
              onResizeField={onResizeField}
              onFieldMenu={onFieldMenu}
              onSelectColumn={onSelectColumn}
            />
          ))}
        </SortableContext>
      </DndContext>
      {!readOnly && onAddField && (
        <button
          type="button"
          aria-label="Add field"
          title="Add a field"
          className="h-8 px-2 border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          onClick={(e) => onAddField(e.currentTarget)}
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
