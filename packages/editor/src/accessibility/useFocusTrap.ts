/**
 * React hook for focus trapping within a container element.
 */
import { useRef, useEffect } from 'react'
import { createFocusTrap, type FocusTrap, type FocusTrapOptions } from './focus-trap'

export interface UseFocusTrapOptions extends Omit<FocusTrapOptions, 'returnFocusTo'> {
  /** Whether the trap is currently enabled. Default: true */
  enabled?: boolean
}

/**
 * Hook that traps focus within the referenced element.
 *
 * @example
 * ```tsx
 * function Modal({ isOpen, onClose }) {
 *   const trapRef = useFocusTrap<HTMLDivElement>({
 *     enabled: isOpen,
 *     onEscape: onClose
 *   })
 *
 *   return <div ref={trapRef}>...</div>
 * }
 * ```
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  options: UseFocusTrapOptions = {}
): React.RefObject<T | null> {
  const { enabled = true, autoFocus = true, onEscape } = options
  const containerRef = useRef<T | null>(null)
  const trapRef = useRef<FocusTrap | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) {
      // Deactivate if disabled
      if (trapRef.current?.isActive) {
        trapRef.current.deactivate()
      }
      return
    }

    trapRef.current = createFocusTrap(container, {
      autoFocus,
      onEscape,
      returnFocusTo: document.activeElement as HTMLElement
    })
    trapRef.current.activate()

    return () => {
      trapRef.current?.deactivate()
      trapRef.current = null
    }
  }, [enabled, autoFocus, onEscape])

  return containerRef
}
