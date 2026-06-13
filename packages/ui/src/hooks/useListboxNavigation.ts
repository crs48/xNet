/**
 * useListboxNavigation — one keyboard contract for every suggestion list
 * (exploration 0172).
 *
 * Before this hook, the app had three divergent typeahead implementations:
 * the editor menus (wrap-around, Tab only on wikilinks), the comment mention
 * textarea (clamp, no IME guard), and the chat composer pickers (mouse-only,
 * no keyboard nav at all). This hoists the shared behavior so every surface
 * agrees: arrows wrap, Enter + Tab commit, Escape dismisses (opt-in), Space
 * never commits (so multi-word display names stay typeable), and Enter is
 * suppressed mid-IME-composition (`isComposing`) so confirming a CJK
 * conversion does not also commit a suggestion.
 *
 * The hook owns only the highlight index and key handling — rendering and
 * positioning stay with each surface. `onKeyDown` returns `true` when it
 * consumed the key, matching the `SuggestionMenuRef` contract the editor
 * menus already expose via `useImperativeHandle`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** Default commit keys — module constant so the dep identity is stable. */
const DEFAULT_COMMIT_KEYS = ['Enter', 'Tab'] as const

/**
 * The minimal event shape the handler needs. Both a native `KeyboardEvent`
 * (editor menus, via the suggestion plugin) and a React synthetic
 * `KeyboardEvent` (textareas) satisfy it structurally — native exposes
 * `isComposing` directly, React exposes it on `nativeEvent`.
 */
export interface ListboxKeyEvent {
  key: string
  preventDefault: () => void
  isComposing?: boolean
  nativeEvent?: { isComposing?: boolean }
}

export interface ListboxNavigationOptions {
  /** Number of options currently in the list. */
  count: number
  /** Commit the option at `index`. */
  onCommit: (index: number) => void
  /** Whether the list is open; when false the handler is a no-op. Default true. */
  isOpen?: boolean
  /** When provided, Escape calls this and is reported as handled. */
  onDismiss?: () => void
  /** Wrap past the ends (true) or clamp at them (false). Default true. */
  wrap?: boolean
  /** Keys that commit the highlighted option. Default `['Enter', 'Tab']`. */
  commitKeys?: readonly string[]
  /**
   * When the list is open but empty, swallow nav/commit keys (preventDefault +
   * report handled) instead of letting them fall through. The slash menu wants
   * this so arrows don't move the editor caret while "No results" shows.
   */
  swallowKeysWhenEmpty?: boolean
  /**
   * Reset the highlight to 0 whenever this value changes identity. Pass the
   * items array so re-querying re-highlights the first row. Defaults to `count`.
   */
  resetKey?: unknown
  /**
   * When set, options get stable ids (`${idPrefix}-opt-${i}`) for
   * `aria-activedescendant`, and the active option is scrolled into view on
   * each move (browsers do not auto-scroll activedescendant targets).
   */
  idPrefix?: string
}

export interface ListboxNavigation {
  /** Index of the highlighted option. */
  activeIndex: number
  /** Imperatively set the highlight (e.g. on mouse-enter). */
  setActiveIndex: (index: number) => void
  /** Stable id for option `index`, or undefined when no `idPrefix` was given. */
  optionId: (index: number) => string | undefined
  /** Value for the input's `aria-activedescendant`, or undefined. */
  activeDescendantId: string | undefined
  /** Handle a keydown; returns true when the key was consumed. */
  onKeyDown: (event: ListboxKeyEvent) => boolean
}

function eventIsComposing(event: ListboxKeyEvent): boolean {
  if (typeof event.isComposing === 'boolean') return event.isComposing
  return event.nativeEvent?.isComposing ?? false
}

export function useListboxNavigation(options: ListboxNavigationOptions): ListboxNavigation {
  const {
    count,
    onCommit,
    isOpen = true,
    onDismiss,
    wrap = true,
    commitKeys = DEFAULT_COMMIT_KEYS,
    swallowKeysWhenEmpty = false,
    resetKey,
    idPrefix
  } = options

  const [activeIndex, setActiveIndex] = useState(0)

  // Re-highlight the first row whenever the option set changes identity.
  const resetSignal = resetKey === undefined ? count : resetKey
  useEffect(() => {
    setActiveIndex(0)
  }, [resetSignal])

  // aria-activedescendant targets are NOT auto-scrolled by the browser; do it
  // ourselves on each move so keyboard users never lose the highlight.
  useEffect(() => {
    if (!isOpen || count === 0 || !idPrefix || typeof document === 'undefined') return
    const el = document.getElementById(`${idPrefix}-opt-${activeIndex}`)
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'nearest' })
      } catch {
        /* jsdom has no layout engine — ignore */
      }
    }
  }, [isOpen, count, idPrefix, activeIndex])

  const optionId = useCallback(
    (index: number) => (idPrefix ? `${idPrefix}-opt-${index}` : undefined),
    [idPrefix]
  )

  const move = useCallback(
    (delta: number) => {
      setActiveIndex((prev) => {
        if (count === 0) return 0
        const next = prev + delta
        if (wrap) return (next + count) % count
        return Math.max(0, Math.min(count - 1, next))
      })
    },
    [count, wrap]
  )

  // Commit reads the live highlight from a ref so the handler identity does not
  // have to churn on every arrow press.
  const activeIndexRef = useRef(0)
  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  const onKeyDown = useCallback(
    (event: ListboxKeyEvent): boolean => {
      if (!isOpen) return false

      if (count === 0) {
        if (
          swallowKeysWhenEmpty &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown' || commitKeys.includes(event.key))
        ) {
          event.preventDefault()
          return true
        }
        return false
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        move(-1)
        return true
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        move(1)
        return true
      }
      if (commitKeys.includes(event.key)) {
        // Confirming an IME conversion must not also commit the suggestion.
        if (eventIsComposing(event)) return false
        event.preventDefault()
        onCommit(activeIndexRef.current)
        return true
      }
      if (event.key === 'Escape' && onDismiss) {
        event.preventDefault()
        onDismiss()
        return true
      }
      return false
    },
    [isOpen, count, swallowKeysWhenEmpty, commitKeys, move, onCommit, onDismiss]
  )

  return {
    activeIndex,
    setActiveIndex,
    optionId,
    activeDescendantId: idPrefix && count > 0 ? `${idPrefix}-opt-${activeIndex}` : undefined,
    onKeyDown
  }
}
