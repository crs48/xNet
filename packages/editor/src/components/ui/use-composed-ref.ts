/**
 * Vendored from ueberdosis/tiptap-ui-components (MIT © 2025 Tiptap),
 * apps/web/src/hooks/use-composed-ref.ts — copied, not CLI-managed (0297).
 */
import * as React from 'react'

// basically Exclude<React.ClassAttributes<T>["ref"], string>
type UserRef<T> = ((instance: T | null) => void) | React.RefObject<T | null> | null | undefined

const updateRef = <T>(ref: NonNullable<UserRef<T>>, value: T | null) => {
  if (typeof ref === 'function') {
    ref(value)
  } else if (ref && typeof ref === 'object' && 'current' in ref) {
    // Safe assignment without MutableRefObject
    const target = ref as { current: T | null }
    target.current = value
  }
}

export const useComposedRef = <T extends HTMLElement>(
  libRef: React.RefObject<T | null>,
  userRef: UserRef<T>
) => {
  const prevUserRef = React.useRef<UserRef<T>>(null)

  return React.useCallback(
    (instance: T | null) => {
      if (libRef && 'current' in libRef) {
        const target = libRef as { current: T | null }
        target.current = instance
      }

      if (prevUserRef.current) {
        updateRef(prevUserRef.current, null)
      }

      prevUserRef.current = userRef

      if (userRef) {
        updateRef(userRef, instance)
      }
    },
    [libRef, userRef]
  )
}

export default useComposedRef
