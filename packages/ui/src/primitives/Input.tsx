import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
  leftElement?: ReactNode
  rightElement?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, leftElement, rightElement, ...props }, ref) => {
    const baseStyles = cn(
      // Base styles
      'flex h-9 w-full rounded-md',
      'border border-border bg-transparent',
      'px-3 py-1 text-sm',
      'transition-base',
      // Placeholder
      'placeholder:text-foreground-faint',
      // Focus state
      'focus-visible:outline-none',
      'focus-visible:ring-2 focus-visible:ring-ring',
      'focus-visible:border-primary',
      // File input
      'file:border-0 file:bg-transparent',
      'file:text-sm file:font-medium file:text-foreground',
      // Disabled state
      'disabled:cursor-not-allowed disabled:opacity-50'
    )

    const errorStyles = error ? 'border-destructive focus-visible:ring-destructive' : ''

    if (leftElement || rightElement) {
      return (
        <div className="relative">
          {leftElement && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-foreground-muted">
              {leftElement}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              baseStyles,
              errorStyles,
              leftElement && 'pl-10',
              rightElement && 'pr-10',
              className
            )}
            {...props}
          />
          {rightElement && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">{rightElement}</div>
          )}
          {error && (
            <p className="mt-1 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      )
    }

    return (
      <div>
        <input ref={ref} className={cn(baseStyles, errorStyles, className)} {...props} />
        {error && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
