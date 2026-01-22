import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
  leftElement?: ReactNode
  rightElement?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, leftElement, rightElement, ...props }, ref) => {
    const baseStyles =
      'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

    const errorStyles = error ? 'border-destructive focus-visible:ring-destructive' : ''

    if (leftElement || rightElement) {
      return (
        <div className="relative">
          {leftElement && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
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
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      )
    }

    return (
      <div>
        <input ref={ref} className={cn(baseStyles, errorStyles, className)} {...props} />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
