/**
 * DatabaseViewPicker — the `/view of…` picker (exploration 0346).
 *
 * Two steps in one dialog: choose a workspace database, then choose the
 * view type. View types come from the ViewRegistry (plus the shell-owned
 * table), so plugin-registered views are insertable the moment they
 * register — no hardcoded list.
 */
import { DatabaseSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { registerBuiltinViews, viewRegistry } from '@xnetjs/views'
import { Modal } from '@xnetjs/ui'
import { Database } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type JSX } from 'react'

if (!viewRegistry.has('board')) registerBuiltinViews()

export interface DatabaseViewChoice {
  databaseId: string
  viewType: string
}

const DATABASE_QUERY = { orderBy: { title: 'asc' as const }, limit: 200 }

interface PickerState {
  open: boolean
  step: 'database' | 'view'
  databaseId: string | null
}

const CLOSED: PickerState = { open: false, step: 'database', databaseId: null }

/**
 * Imperative promise picker: `pick()` resolves with the choice (or null
 * on dismiss); render `dialog` alongside the editor.
 */
export function useDatabaseViewPicker(): {
  pick: () => Promise<DatabaseViewChoice | null>
  dialog: JSX.Element
} {
  const [state, setState] = useState<PickerState>(CLOSED)
  const resolveRef = useRef<((choice: DatabaseViewChoice | null) => void) | null>(null)

  const pick = useCallback(() => {
    return new Promise<DatabaseViewChoice | null>((resolve) => {
      resolveRef.current?.(null)
      resolveRef.current = resolve
      setState({ open: true, step: 'database', databaseId: null })
    })
  }, [])

  const settle = useCallback((choice: DatabaseViewChoice | null) => {
    resolveRef.current?.(choice)
    resolveRef.current = null
    setState(CLOSED)
  }, [])

  const dialog = (
    <DatabaseViewPickerDialog
      state={state}
      onPickDatabase={(databaseId) => setState((s) => ({ ...s, step: 'view', databaseId }))}
      onPickView={(viewType) => {
        setState((s) => {
          if (s.databaseId) settle({ databaseId: s.databaseId, viewType })
          return CLOSED
        })
      }}
      onDismiss={() => settle(null)}
    />
  )

  return { pick, dialog }
}

function DatabaseViewPickerDialog({
  state,
  onPickDatabase,
  onPickView,
  onDismiss
}: {
  state: PickerState
  onPickDatabase: (databaseId: string) => void
  onPickView: (viewType: string) => void
  onDismiss: () => void
}): JSX.Element {
  const { data: databases } = useQuery(DatabaseSchema, DATABASE_QUERY)
  const [search, setSearch] = useState('')

  // Table is shell-owned (0339); everything else enumerates the registry.
  const viewTypes = useMemo(
    () => [
      { type: 'table', name: 'Table' },
      ...viewRegistry.getAll().map((v) => ({ type: v.type, name: v.name }))
    ],
    []
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return databases
    return databases.filter((db) =>
      String(db.title ?? '')
        .toLowerCase()
        .includes(q)
    )
  }, [databases, search])

  return (
    <Modal
      open={state.open}
      onOpenChange={(open) => {
        if (!open) onDismiss()
      }}
      title={state.step === 'database' ? 'Insert a view of…' : 'Choose a view'}
      size="md"
    >
      {state.step === 'database' ? (
        <div className="flex max-h-80 flex-col gap-2">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search databases…"
            className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none"
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                No databases found.
              </p>
            ) : (
              filtered.map((db) => (
                <button
                  key={db.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => onPickDatabase(db.id)}
                >
                  <Database size={14} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{String(db.title ?? '') || 'Untitled Database'}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1">
          {viewTypes.map((v) => (
            <button
              key={v.type}
              type="button"
              className="rounded-md border border-border/60 px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => onPickView(v.type)}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
