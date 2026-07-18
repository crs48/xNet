/**
 * BoardView — V2 kanban over the grid data model (exploration 0339).
 *
 * Stacks come from the group-by select field's options (keyed by option
 * ID — renames never orphan a stack), plus a "No <field>" stack for empty
 * cells. A card move is ONE node write: the group cell + the fractional
 * sortKey travel together through `onMoveCard`. Stack order is option
 * order, overridable by dragging column headers (persisted in
 * `groupMeta`); collapse state persists per view in `collapsedGroups`.
 */

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { rebalanceSortKeys, type CellValue, type ViewGroupMeta } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import { ChevronRight, Plus } from 'lucide-react'
import React, { useCallback, useMemo, useState } from 'react'
import type { GridField } from '../grid/model.js'
import { optionChipStyle } from '../properties/optionColors.js'
import { CardCover, FieldValueChip, WindowFootnote, firstFileRef } from './card-bits.js'
import {
  resolveGroupField,
  rowTitle,
  type DatabaseViewProps,
  type DatabaseViewRow
} from './contract.js'
import {
  UNGROUPED_KEY,
  buildGroups,
  dropCardSortKey,
  moveCellValue,
  orderRowsBySortKey,
  type ViewGroup
} from './group-model.js'

// Composite drag ids keep a multiSelect row unique per stack.
const cardDragId = (groupKey: string, rowId: string) => `card:${groupKey}:${rowId}`
const columnDragId = (groupKey: string) => `col:${groupKey}`
const parseDragId = (
  id: string
): { kind: 'card' | 'col'; groupKey: string; rowId?: string } | null => {
  if (id.startsWith('card:')) {
    const rest = id.slice(5)
    const sep = rest.indexOf(':')
    if (sep < 0) return null
    return { kind: 'card', groupKey: rest.slice(0, sep), rowId: rest.slice(sep + 1) }
  }
  if (id.startsWith('col:')) return { kind: 'col', groupKey: id.slice(4) }
  return null
}

function colorEdge(
  row: DatabaseViewRow,
  colorField: GridField | undefined
): React.CSSProperties | undefined {
  if (!colorField) return undefined
  const value = row.cells[colorField.id]
  const optionId = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : null
  if (typeof optionId !== 'string') return undefined
  const option = colorField.options?.find((o) => o.id === optionId)
  if (!option) return undefined
  return { borderLeft: `3px solid ${optionChipStyle(option.color).backgroundColor}` }
}

// ─── Card ───────────────────────────────────────────────────────────────────

function BoardCard({
  row,
  groupKey,
  fields,
  cardFields,
  coverField,
  colorField,
  coverFit,
  onOpenRow,
  onResolveFileUrl,
  overlay
}: {
  row: DatabaseViewRow
  groupKey: string
  fields: GridField[]
  cardFields: GridField[]
  coverField: GridField | undefined
  colorField: GridField | undefined
  coverFit: 'cover' | 'contain'
  onOpenRow?: (rowId: string) => void
  onResolveFileUrl?: DatabaseViewProps['onResolveFileUrl']
  overlay?: boolean
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardDragId(groupKey, row.id),
    disabled: overlay
  })
  const cover = coverField ? firstFileRef(row.cells[coverField.id]) : null
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...colorEdge(row, colorField)
      }}
      className={cn(
        'group/card cursor-pointer overflow-hidden rounded-md border border-hairline bg-surface-0 shadow-sm',
        isDragging && 'opacity-40',
        overlay && 'shadow-lg'
      )}
      data-testid="board-card"
      data-row-id={row.id}
      onClick={() => onOpenRow?.(row.id)}
      {...attributes}
      {...listeners}
    >
      {cover && (
        <CardCover
          fileRef={cover}
          fit={coverFit}
          heightClass="h-24"
          onResolveFileUrl={onResolveFileUrl}
        />
      )}
      <div className="flex flex-col gap-1 p-2">
        <div className="text-[13px] font-medium leading-tight text-ink-1">
          {rowTitle(row, fields)}
        </div>
        {cardFields.map((field) => {
          const chip = <FieldValueChip field={field} value={row.cells[field.id]} />
          return chip == null ? null : <div key={field.id}>{chip}</div>
        })}
      </div>
    </div>
  )
}

// ─── Column ─────────────────────────────────────────────────────────────────

function BoardColumn({
  group,
  window: viewWindow,
  reorderable,
  children,
  onToggleCollapsed,
  onAddCard
}: {
  group: ViewGroup
  window: DatabaseViewProps['window']
  reorderable: boolean
  children: React.ReactNode
  onToggleCollapsed?: () => void
  onAddCard?: () => void
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: group.key })
  const sortable = useSortable({ id: columnDragId(group.key), disabled: !reorderable })
  const chip = optionChipStyle(group.color)
  const truncated = viewWindow.total !== null && viewWindow.total > viewWindow.size

  if (group.collapsed) {
    return (
      <div className="w-10 shrink-0">
        <button
          type="button"
          className="flex h-full max-h-64 w-10 flex-col items-center gap-2 rounded-lg border border-hairline bg-surface-1 py-2"
          onClick={onToggleCollapsed}
          title={`Expand ${group.name}`}
        >
          <ChevronRight className="h-3.5 w-3.5 text-ink-3" />
          <span
            className="text-[11px] font-medium text-ink-2"
            style={{ writingMode: 'vertical-rl' }}
          >
            {group.name} · {group.rows.length}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition
      }}
      className={cn('flex w-72 shrink-0 flex-col', sortable.isDragging && 'opacity-40')}
      data-testid="board-column"
      data-group-key={group.key}
    >
      <div
        className="mb-2 flex items-center gap-2 px-1"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <button
          type="button"
          aria-label={`Collapse ${group.name}`}
          className="rounded p-0.5 text-ink-3 hover:bg-surface-1"
          onClick={onToggleCollapsed}
        >
          <ChevronRight className="h-3 w-3 rotate-90" />
        </button>
        <span
          className="rounded px-1.5 py-px text-[11px] font-medium leading-4"
          style={group.key === UNGROUPED_KEY ? undefined : chip}
        >
          {group.name}
        </span>
        <span className="text-[11px] text-ink-3">
          {group.rows.length}
          {truncated ? '+' : ''}
        </span>
        <span className="flex-1" />
        {onAddCard && (
          <button
            type="button"
            aria-label={`Add card to ${group.name}`}
            className="rounded p-0.5 text-ink-3 hover:bg-surface-1"
            onClick={onAddCard}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-16 flex-1 flex-col gap-2 rounded-lg border border-transparent bg-surface-1/60 p-2',
          isOver && 'border-border-emphasis'
        )}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Board ──────────────────────────────────────────────────────────────────

export function BoardView(props: DatabaseViewProps): React.JSX.Element {
  const {
    fields,
    visibleFields,
    rows,
    window: viewWindow,
    config,
    sorted,
    compact,
    className,
    onPatchConfig,
    onMoveCard,
    onToggleGroupCollapsed,
    onOpenRow,
    onCreateRow,
    onCreateOption,
    onResolveFileUrl
  } = props

  const groupField = resolveGroupField(fields, config)
  // Boards show covers only when explicitly configured (Notion default);
  // the gallery is where the first-file-field fallback lives.
  const coverField = config.coverField ? fields.find((f) => f.id === config.coverField) : undefined
  const colorField = config.colorBy ? fields.find((f) => f.id === config.colorBy) : undefined
  const coverFit = config.coverFit === 'contain' ? 'contain' : 'cover'

  // Manual order (sortKey) unless the view has explicit sorts
  const orderedRows = useMemo(() => (sorted ? rows : orderRowsBySortKey(rows)), [rows, sorted])
  const groups = useMemo(
    () => buildGroups(orderedRows, groupField, config),
    [orderedRows, groupField, config]
  )
  const rowsById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])

  // Card body fields: visible fields minus the title and the group field
  const cardFields = useMemo(
    () =>
      visibleFields.filter((f) => !f.isTitle && f.id !== groupField?.id && f.id !== coverField?.id),
    [visibleFields, groupField, coverField]
  )

  const [activeCard, setActiveCard] = useState<{ row: DatabaseViewRow; groupKey: string } | null>(
    null
  )
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [newOption, setNewOption] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const parsed = parseDragId(String(event.active.id))
      if (parsed?.kind === 'card' && parsed.rowId) {
        const row = rowsById.get(parsed.rowId)
        if (row) setActiveCard({ row, groupKey: parsed.groupKey })
      }
    },
    [rowsById]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCard(null)
      const { active, over } = event
      if (!over || !groupField) return
      const from = parseDragId(String(active.id))
      if (!from) return

      // Column header drag → rewrite groupMeta with rebalanced stack keys
      if (from.kind === 'col') {
        const to = parseDragId(String(over.id))
        if (!to || to.kind !== 'col' || !onPatchConfig) return
        const order = groups.filter((g) => g.key !== UNGROUPED_KEY).map((g) => g.key)
        const fromIndex = order.indexOf(from.groupKey)
        const toIndex = order.indexOf(to.groupKey)
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
        const next = arrayMove(order, fromIndex, toIndex)
        const keys = rebalanceSortKeys(next)
        const groupMeta: Record<string, ViewGroupMeta> = { ...config.groupMeta }
        for (const key of next) {
          groupMeta[key] = { ...groupMeta[key], sortKey: keys.get(key)! }
        }
        onPatchConfig({ groupMeta })
        return
      }

      // Card drag → group cell + fractional sortKey in one write
      if (!from.rowId || !onMoveCard) return
      const row = rowsById.get(from.rowId)
      if (!row) return

      const overParsed = parseDragId(String(over.id))
      const targetKey =
        overParsed?.kind === 'card'
          ? overParsed.groupKey
          : overParsed?.kind === 'col'
            ? overParsed.groupKey
            : String(over.id) // column droppable id is the bare group key
      const targetGroup = groups.find((g) => g.key === targetKey)
      if (!targetGroup) return

      const targetIndex =
        overParsed?.kind === 'card' && overParsed.rowId
          ? targetGroup.rows.findIndex((r) => r.id === overParsed.rowId)
          : targetGroup.rows.length

      const cells: Record<string, CellValue> = {}
      if (targetKey !== from.groupKey) {
        cells[groupField.id] = moveCellValue(row, groupField, from.groupKey, targetKey) as CellValue
      }
      const sortKey = sorted
        ? undefined
        : dropCardSortKey(targetGroup.rows, row.id, Math.max(0, targetIndex))
      if (Object.keys(cells).length === 0 && sortKey === undefined) return
      onMoveCard(row.id, cells, sortKey !== undefined ? { sortKey } : undefined)
    },
    [groupField, groups, rowsById, config.groupMeta, sorted, onMoveCard, onPatchConfig]
  )

  // Cards win over columns when the pointer is over both
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const within = pointerWithin(args)
    const cards = within.filter((c) => String(c.id).startsWith('card:'))
    if (cards.length > 0) return [cards[0]]
    if (within.length > 0) return within
    const rects = rectIntersection(args)
    return rects.length > 0 ? rects : closestCenter(args)
  }, [])

  const handleAddCard = useCallback(
    (group: ViewGroup) => {
      if (!onCreateRow || !groupField) return
      if (group.key === UNGROUPED_KEY) {
        onCreateRow()
        return
      }
      onCreateRow({
        [groupField.id]: (groupField.type === 'multiSelect' ? [group.key] : group.key) as CellValue
      })
    },
    [onCreateRow, groupField]
  )

  if (!groupField) {
    return (
      <div
        className={cn('flex h-full items-center justify-center p-8 text-sm text-ink-3', className)}
      >
        Add a select field to group this board.
      </div>
    )
  }

  const columnDragIds = groups
    .filter((g) => g.key !== UNGROUPED_KEY)
    .map((g) => columnDragId(g.key))

  return (
    <div className={cn('flex h-full flex-col overflow-hidden', className)} data-testid="board-view">
      <div className={cn('flex-1 overflow-x-auto overflow-y-hidden', compact ? 'p-2' : 'p-4')}>
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveCard(null)}
        >
          <SortableContext items={columnDragIds} strategy={horizontalListSortingStrategy}>
            <div className="flex h-full items-stretch gap-3">
              {groups.map((group) => (
                <BoardColumn
                  key={group.key}
                  group={group}
                  window={viewWindow}
                  reorderable={group.key !== UNGROUPED_KEY && Boolean(onPatchConfig)}
                  onToggleCollapsed={() => onToggleGroupCollapsed?.(group.key, !group.collapsed)}
                  onAddCard={onCreateRow ? () => handleAddCard(group) : undefined}
                >
                  <SortableContext
                    items={group.rows.map((r) => cardDragId(group.key, r.id))}
                    strategy={verticalListSortingStrategy}
                  >
                    {group.rows.map((row) => (
                      <BoardCard
                        key={row.id}
                        row={row}
                        groupKey={group.key}
                        fields={fields}
                        cardFields={cardFields}
                        coverField={coverField}
                        colorField={colorField}
                        coverFit={coverFit}
                        onOpenRow={onOpenRow}
                        onResolveFileUrl={onResolveFileUrl}
                      />
                    ))}
                  </SortableContext>
                </BoardColumn>
              ))}

              {/* Add group = create a select option */}
              {onCreateOption && !compact && (
                <div className="w-56 shrink-0">
                  {addingTo === '__new__' ? (
                    <input
                      autoFocus
                      value={newOption}
                      placeholder="Group name"
                      aria-label="New group name"
                      className="w-full rounded border border-border bg-transparent px-2 py-1 text-sm outline-none focus:border-border-emphasis"
                      onChange={(e) => setNewOption(e.target.value)}
                      onBlur={() => {
                        setAddingTo(null)
                        setNewOption('')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setAddingTo(null)
                          setNewOption('')
                        }
                        if (e.key === 'Enter' && newOption.trim()) {
                          void onCreateOption(groupField.id, newOption.trim())
                          setAddingTo(null)
                          setNewOption('')
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="w-full rounded-lg border border-dashed border-hairline py-2 text-sm text-ink-3 hover:bg-surface-1"
                      onClick={() => setAddingTo('__new__')}
                    >
                      + Add group
                    </button>
                  )}
                </div>
              )}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeCard && (
              <BoardCard
                row={activeCard.row}
                groupKey={activeCard.groupKey}
                fields={fields}
                cardFields={cardFields}
                coverField={coverField}
                colorField={colorField}
                coverFit={coverFit}
                onResolveFileUrl={onResolveFileUrl}
                overlay
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>
      <WindowFootnote shown={rows.length} window={viewWindow} />
    </div>
  )
}
