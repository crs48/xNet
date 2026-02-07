/**
 * Checklist Node Component
 *
 * Renders a task list with keyboard navigation support:
 * - Enter: Add new item below
 * - Backspace on empty: Delete item
 * - Tab/Shift+Tab: Indent/outdent
 * - Alt+Arrow: Move item up/down
 */

import { memo, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string
  text: string
  checked: boolean
  indent: number
}

export interface ChecklistNodeData {
  id: string
  type: 'checklist'
  properties: {
    title?: string
    items: ChecklistItem[]
  }
}

export interface ChecklistNodeProps {
  node: ChecklistNodeData
  onUpdate: (changes: Partial<ChecklistNodeData['properties']>) => void
}

// ─── ID Generator ────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2, 12)
}

// ─── Component ───────────────────────────────────────────────────────────────

export const ChecklistNodeComponent = memo(function ChecklistNodeComponent({
  node,
  onUpdate
}: ChecklistNodeProps) {
  const items = node.properties.items ?? []

  const updateItem = useCallback(
    (id: string, changes: Partial<ChecklistItem>) => {
      const newItems = items.map((item) => (item.id === id ? { ...item, ...changes } : item))
      onUpdate({ items: newItems })
    },
    [items, onUpdate]
  )

  const addItem = useCallback(
    (afterId: string | null) => {
      const newItem: ChecklistItem = {
        id: generateId(),
        text: '',
        checked: false,
        indent: 0
      }

      let newItems: ChecklistItem[]
      if (afterId) {
        const index = items.findIndex((item) => item.id === afterId)
        newItem.indent = items[index]?.indent ?? 0
        newItems = [...items.slice(0, index + 1), newItem, ...items.slice(index + 1)]
      } else {
        newItems = [...items, newItem]
      }

      onUpdate({ items: newItems })

      // Focus new item after render
      setTimeout(() => {
        const input = document.querySelector(
          `[data-item-id="${newItem.id}"] input[type="text"]`
        ) as HTMLInputElement
        input?.focus()
      }, 0)

      return newItem.id
    },
    [items, onUpdate]
  )

  const deleteItem = useCallback(
    (id: string) => {
      const index = items.findIndex((item) => item.id === id)
      if (index < 0) return

      const newItems = items.filter((item) => item.id !== id)
      onUpdate({ items: newItems })

      // Focus previous item
      if (index > 0) {
        setTimeout(() => {
          const prevId = items[index - 1].id
          const input = document.querySelector(
            `[data-item-id="${prevId}"] input[type="text"]`
          ) as HTMLInputElement
          input?.focus()
        }, 0)
      }
    },
    [items, onUpdate]
  )

  const moveItem = useCallback(
    (id: string, direction: -1 | 1) => {
      const index = items.findIndex((item) => item.id === id)
      if (index < 0) return

      const newIndex = index + direction
      if (newIndex < 0 || newIndex >= items.length) return

      const newItems = [...items]
      const [removed] = newItems.splice(index, 1)
      newItems.splice(newIndex, 0, removed)
      onUpdate({ items: newItems })
    },
    [items, onUpdate]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, item: ChecklistItem) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        addItem(item.id)
      } else if (e.key === 'Backspace' && item.text === '') {
        e.preventDefault()
        deleteItem(item.id)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const newIndent = e.shiftKey ? Math.max(0, item.indent - 1) : Math.min(4, item.indent + 1)
        updateItem(item.id, { indent: newIndent })
      } else if (e.key === 'ArrowUp' && e.altKey) {
        e.preventDefault()
        moveItem(item.id, -1)
      } else if (e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault()
        moveItem(item.id, 1)
      }
    },
    [addItem, deleteItem, updateItem, moveItem]
  )

  const handleAddClick = useCallback(() => {
    addItem(items[items.length - 1]?.id ?? null)
  }, [addItem, items])

  return (
    <div className="checklist-node" style={styles.node}>
      {node.properties.title && (
        <div className="checklist-title" style={styles.title}>
          {node.properties.title}
        </div>
      )}

      <div className="checklist-items" style={styles.items}>
        {items.map((item) => (
          <div
            key={item.id}
            data-item-id={item.id}
            className="checklist-item"
            style={{ ...styles.item, paddingLeft: item.indent * 20 + 8 }}
          >
            <input
              type="checkbox"
              checked={item.checked}
              onChange={(e) => updateItem(item.id, { checked: e.target.checked })}
              style={styles.checkbox}
            />
            <input
              type="text"
              value={item.text}
              onChange={(e) => updateItem(item.id, { text: e.target.value })}
              onKeyDown={(e) => handleKeyDown(e, item)}
              placeholder="Task..."
              style={{
                ...styles.textInput,
                textDecoration: item.checked ? 'line-through' : 'none',
                color: item.checked ? '#9ca3af' : '#111827'
              }}
            />
          </div>
        ))}
      </div>

      <button className="checklist-add" onClick={handleAddClick} style={styles.addButton}>
        + Add item
      </button>
    </div>
  )
})

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  node: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'white',
    borderRadius: '8px',
    padding: '12px',
    overflow: 'hidden'
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#111827',
    marginBottom: '8px',
    paddingBottom: '8px',
    borderBottom: '1px solid #e5e7eb'
  },
  items: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    overflowY: 'auto'
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minHeight: '28px'
  },
  checkbox: {
    width: '16px',
    height: '16px',
    flexShrink: 0,
    cursor: 'pointer'
  },
  textInput: {
    flex: 1,
    border: 'none',
    background: 'transparent',
    fontSize: '14px',
    lineHeight: 1.4,
    padding: '4px 0',
    outline: 'none'
  },
  addButton: {
    marginTop: '8px',
    padding: '6px 12px',
    border: 'none',
    background: 'transparent',
    color: '#6b7280',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'left',
    borderRadius: '4px'
  }
}
