import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../utils'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  size?: 'sm' | 'md'
  dot?: boolean
  removable?: boolean
  onRemove?: () => void
  children: ReactNode
}

export function Badge({
  className,
  variant = 'default',
  size = 'md',
  dot = false,
  removable = false,
  onRemove,
  children,
  ...props
}: BadgeProps) {
  const baseStyles = 'inline-flex items-center font-medium rounded-full'

  const variants = {
    default: 'bg-gray-100 text-gray-800',
    primary: 'bg-blue-100 text-blue-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800'
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-0.5 text-sm'
  }

  const dotColors = {
    default: 'bg-gray-400',
    primary: 'bg-blue-400',
    success: 'bg-green-400',
    warning: 'bg-yellow-400',
    danger: 'bg-red-400'
  }

  return (
    <span className={cn(baseStyles, variants[variant], sizes[size], className)} {...props}>
      {dot && <span className={cn('mr-1.5 h-1.5 w-1.5 rounded-full', dotColors[variant])} />}
      {children}
      {removable && (
        <button
          type="button"
          className="ml-1 -mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10"
          onClick={onRemove}
        >
          <svg className="h-2 w-2" fill="currentColor" viewBox="0 0 8 8">
            <path d="M1.41 0L0 1.41l2.59 2.59L0 6.59 1.41 8l2.59-2.59L6.59 8 8 6.59 5.41 4 8 1.41 6.59 0 4 2.59 1.41 0z" />
          </svg>
        </button>
      )}
    </span>
  )
}
