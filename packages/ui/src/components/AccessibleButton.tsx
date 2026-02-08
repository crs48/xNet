/**
 * AccessibleButton - Enhanced button with loading and ARIA states
 *
 * Extends the base Button with proper ARIA attributes for loading
 * states and screen reader announcements.
 */

import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { Button, type ButtonProps } from '../primitives/Button'
import { cn } from '../utils'

// ─── Types ─────────────────────────────────────────────────────────

export interface AccessibleButtonProps extends ButtonProps {
  /** Whether the button is in a loading state */
  loading?: boolean
  /** Text announced to screen readers when loading (default: 'Loading...') */
  loadingText?: string
  /** Text announced to screen readers when action completes */
  successText?: string
  /** Text announced to screen readers when action fails */
  errorText?: string
}

// ─── Component ─────────────────────────────────────────────────────

/**
 * Accessible button with loading state support.
 *
 * Properly handles ARIA attributes for loading states and provides
 * screen reader announcements.
 *
 * @example
 * const [loading, setLoading] = useState(false)
 *
 * <AccessibleButton
 *   loading={loading}
 *   loadingText="Saving changes..."
 *   onClick={async () => {
 *     setLoading(true)
 *     await saveData()
 *     setLoading(false)
 *   }}
 * >
 *   Save
 * </AccessibleButton>
 */
export const AccessibleButton = React.forwardRef<HTMLButtonElement, AccessibleButtonProps>(
  (
    { loading = false, loadingText = 'Loading...', disabled, children, className, ...props },
    ref
  ) => {
    return (
      <Button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        aria-disabled={disabled || loading}
        className={cn(loading && 'cursor-wait', className)}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="sr-only">{loadingText}</span>
            <span aria-hidden="true">{children}</span>
          </>
        ) : (
          children
        )}
      </Button>
    )
  }
)

AccessibleButton.displayName = 'AccessibleButton'

// ─── Icon Button Variant ───────────────────────────────────────────

export interface AccessibleIconButtonProps extends Omit<AccessibleButtonProps, 'children'> {
  /** Icon element to display */
  icon: React.ReactNode
  /** Accessible label for screen readers (required) */
  label: string
}

/**
 * Accessible icon-only button.
 *
 * Requires a label for screen readers since there's no visible text.
 *
 * @example
 * <AccessibleIconButton
 *   icon={<Trash2 className="h-4 w-4" />}
 *   label="Delete item"
 *   onClick={handleDelete}
 * />
 */
export const AccessibleIconButton = React.forwardRef<HTMLButtonElement, AccessibleIconButtonProps>(
  ({ icon, label, loading, loadingText = 'Loading...', ...props }, ref) => {
    return (
      <Button ref={ref} size="icon" aria-label={label} aria-busy={loading} {...props}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="sr-only">{loadingText}</span>
          </>
        ) : (
          <>
            <span aria-hidden="true">{icon}</span>
            <span className="sr-only">{label}</span>
          </>
        )}
      </Button>
    )
  }
)

AccessibleIconButton.displayName = 'AccessibleIconButton'
