/**
 * UndoToast - transient "<thing> deleted · Undo" affordance (0179)
 *
 * A discoverable, surface-agnostic complement to Cmd+Z: destructive node
 * actions (delete a folder, archive a task) call `showUndoToast(message)`,
 * and the toast's Undo button drives the same app-wide undo stack. The
 * keyboard hint reminds users the action is reversible.
 */
import { useGlobalUndo } from '@xnetjs/react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode
} from 'react'

const UNDO_TOAST_TIMEOUT_MS = 6000

interface UndoToastContextValue {
  /** Show a transient toast whose Undo button reverses the last action. */
  showUndoToast: (message: string) => void
}

const UndoToastContext = createContext<UndoToastContextValue | null>(null)

/** No-op outside a provider, so callers never need to null-check. */
export function useUndoToast(): UndoToastContextValue {
  return useContext(UndoToastContext) ?? { showUndoToast: () => {} }
}

export function UndoToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const { undo } = useGlobalUndo()
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idRef = useRef(0)

  const showUndoToast = useCallback((message: string) => {
    idRef.current += 1
    setToast({ id: idRef.current, message })
  }, [])

  useEffect(() => {
    if (!toast) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setToast(null), UNDO_TOAST_TIMEOUT_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [toast])

  const handleUndo = useCallback(async () => {
    setToast(null)
    await undo()
  }, [undo])

  return (
    <UndoToastContext.Provider value={{ showUndoToast }}>
      {children}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground shadow-2xl"
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => void handleUndo()}
            className="cursor-pointer rounded-md border-none bg-transparent p-0 font-semibold text-primary hover:underline"
          >
            Undo
          </button>
          <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
            ⌘Z
          </kbd>
        </div>
      ) : null}
    </UndoToastContext.Provider>
  )
}
