/**
 * AccessibleInput - Form input with proper labeling and error handling
 *
 * Provides a complete accessible form field with label, hint text,
 * and error messaging with proper ARIA attributes.
 */

import * as React from 'react'
import { Input, type InputProps } from '../primitives/Input'
import { cn } from '../utils'

// ─── Types ─────────────────────────────────────────────────────────

export interface AccessibleInputProps extends InputProps {
  /** Label text (required for accessibility) */
  label: string
  /** Error message to display */
  error?: string
  /** Hint text to display below the label */
  hint?: string
  /** Whether the label should be visually hidden (still accessible) */
  hideLabel?: boolean
  /** Whether the field is required */
  required?: boolean
}

// ─── Component ─────────────────────────────────────────────────────

/**
 * Accessible form input with label, hint, and error support.
 *
 * Automatically handles ARIA attributes for error states and
 * associates labels with inputs.
 *
 * @example
 * <AccessibleInput
 *   label="Email address"
 *   hint="We'll never share your email"
 *   type="email"
 *   required
 * />
 *
 * @example
 * // With error state
 * <AccessibleInput
 *   label="Password"
 *   type="password"
 *   error="Password must be at least 8 characters"
 * />
 *
 * @example
 * // Hidden label (icon-only input)
 * <AccessibleInput
 *   label="Search"
 *   hideLabel
 *   placeholder="Search..."
 * />
 */
export const AccessibleInput = React.forwardRef<HTMLInputElement, AccessibleInputProps>(
  ({ label, error, hint, hideLabel = false, required = false, id, className, ...props }, ref) => {
    const generatedId = React.useId()
    const inputId = id || generatedId
    const errorId = `${inputId}-error`
    const hintId = `${inputId}-hint`

    // Build aria-describedby from hint and error
    const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined

    return (
      <div className="space-y-1.5">
        {/* Label */}
        <label
          htmlFor={inputId}
          className={cn('text-sm font-medium text-foreground', hideLabel && 'sr-only')}
        >
          {label}
          {required && (
            <span className="text-destructive ml-1" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only">(required)</span>}
        </label>

        {/* Hint text */}
        {hint && (
          <p id={hintId} className="text-sm text-foreground-muted">
            {hint}
          </p>
        )}

        {/* Input */}
        <Input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          aria-required={required}
          className={cn(error && 'border-destructive focus-visible:ring-destructive', className)}
          {...props}
        />

        {/* Error message */}
        {error && (
          <p id={errorId} role="alert" className="text-sm text-destructive flex items-center gap-1">
            <svg
              className="h-4 w-4 shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}
      </div>
    )
  }
)

AccessibleInput.displayName = 'AccessibleInput'

// ─── Textarea Variant ──────────────────────────────────────────────

export interface AccessibleTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Label text (required for accessibility) */
  label: string
  /** Error message to display */
  error?: string
  /** Hint text to display below the label */
  hint?: string
  /** Whether the label should be visually hidden */
  hideLabel?: boolean
  /** Whether the field is required */
  required?: boolean
}

/**
 * Accessible textarea with label, hint, and error support.
 */
export const AccessibleTextarea = React.forwardRef<HTMLTextAreaElement, AccessibleTextareaProps>(
  ({ label, error, hint, hideLabel = false, required = false, id, className, ...props }, ref) => {
    const generatedId = React.useId()
    const inputId = id || generatedId
    const errorId = `${inputId}-error`
    const hintId = `${inputId}-hint`

    const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined

    return (
      <div className="space-y-1.5">
        <label
          htmlFor={inputId}
          className={cn('text-sm font-medium text-foreground', hideLabel && 'sr-only')}
        >
          {label}
          {required && (
            <span className="text-destructive ml-1" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only">(required)</span>}
        </label>

        {hint && (
          <p id={hintId} className="text-sm text-foreground-muted">
            {hint}
          </p>
        )}

        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          aria-required={required}
          className={cn(
            'flex min-h-[80px] w-full rounded-md border border-border',
            'bg-background px-3 py-2 text-sm',
            'ring-offset-background',
            'placeholder:text-foreground-muted',
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-destructive focus-visible:ring-destructive',
            className
          )}
          {...props}
        />

        {error && (
          <p id={errorId} role="alert" className="text-sm text-destructive flex items-center gap-1">
            <svg
              className="h-4 w-4 shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}
      </div>
    )
  }
)

AccessibleTextarea.displayName = 'AccessibleTextarea'
