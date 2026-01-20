import { useEffect, useCallback } from 'react'

interface ShortcutOptions {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  preventDefault?: boolean
  enabled?: boolean
}

/**
 * Hook to handle keyboard shortcuts
 */
export function useKeyboardShortcut(
  options: ShortcutOptions,
  callback: (event: KeyboardEvent) => void
): void {
  const {
    key,
    ctrlKey = false,
    metaKey = false,
    shiftKey = false,
    altKey = false,
    preventDefault = true,
    enabled = true
  } = options

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      const modifiersMatch =
        event.ctrlKey === ctrlKey &&
        event.metaKey === metaKey &&
        event.shiftKey === shiftKey &&
        event.altKey === altKey

      if (event.key.toLowerCase() === key.toLowerCase() && modifiersMatch) {
        if (preventDefault) {
          event.preventDefault()
        }
        callback(event)
      }
    },
    [key, ctrlKey, metaKey, shiftKey, altKey, preventDefault, enabled, callback]
  )

  useEffect(() => {
    if (!enabled) return

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown, enabled])
}
