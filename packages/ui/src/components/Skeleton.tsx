/**
 * Skeleton component for loading states
 *
 * Displays a placeholder with a shimmer animation while content is loading.
 */

import * as React from 'react'
import { cn } from '../utils'

// ─── Skeleton ──────────────────────────────────────────────────────

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Width of the skeleton. Can be a number (px) or string (e.g., '100%') */
  width?: number | string
  /** Height of the skeleton. Can be a number (px) or string */
  height?: number | string
  /** Border radius variant */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full'
  /** Whether to show as a circle (for avatars) */
  circle?: boolean
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, width, height, rounded = 'md', circle, style, ...props }, ref) => {
    const roundedStyles = {
      none: 'rounded-none',
      sm: 'rounded-sm',
      md: 'rounded-md',
      lg: 'rounded-lg',
      full: 'rounded-full'
    }

    const computedStyle: React.CSSProperties = {
      ...style,
      width: typeof width === 'number' ? `${width}px` : width,
      height: typeof height === 'number' ? `${height}px` : height
    }

    return (
      <div
        ref={ref}
        className={cn(
          'animate-shimmer',
          'bg-gradient-to-r from-background-muted via-background-subtle to-background-muted',
          'bg-[length:200%_100%]',
          circle ? 'rounded-full' : roundedStyles[rounded],
          className
        )}
        style={computedStyle}
        {...props}
      />
    )
  }
)
Skeleton.displayName = 'Skeleton'

// ─── Skeleton Text ─────────────────────────────────────────────────

export interface SkeletonTextProps extends Omit<SkeletonProps, 'height'> {
  /** Number of text lines to show */
  lines?: number
}

const SkeletonText = React.forwardRef<HTMLDivElement, SkeletonTextProps>(
  ({ className, lines = 3, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-2', className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={16} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  )
)
SkeletonText.displayName = 'SkeletonText'

// ─── Skeleton Avatar ───────────────────────────────────────────────

export interface SkeletonAvatarProps extends Omit<SkeletonProps, 'circle' | 'width' | 'height'> {
  /** Size of the avatar in pixels */
  size?: number
}

const SkeletonAvatar = React.forwardRef<HTMLDivElement, SkeletonAvatarProps>(
  ({ className, size = 40, ...props }, ref) => (
    <Skeleton ref={ref} circle width={size} height={size} className={className} {...props} />
  )
)
SkeletonAvatar.displayName = 'SkeletonAvatar'

// ─── Skeleton Card ─────────────────────────────────────────────────

export interface SkeletonCardProps extends Omit<SkeletonProps, 'width' | 'height'> {}

const SkeletonCard = React.forwardRef<HTMLDivElement, SkeletonCardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg border border-border p-4 space-y-4', className)}
      {...props}
    >
      <div className="flex items-center space-x-4">
        <SkeletonAvatar />
        <div className="space-y-2 flex-1">
          <Skeleton height={16} width="40%" />
          <Skeleton height={12} width="20%" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  )
)
SkeletonCard.displayName = 'SkeletonCard'

// ─── Skeleton Button ───────────────────────────────────────────────

export interface SkeletonButtonProps extends Omit<SkeletonProps, 'width' | 'height'> {
  /** Size variant */
  size?: 'sm' | 'default' | 'lg'
}

const SkeletonButton = React.forwardRef<HTMLDivElement, SkeletonButtonProps>(
  ({ className, size = 'default', ...props }, ref) => {
    const sizeStyles = {
      sm: { height: 32, width: 64 },
      default: { height: 40, width: 80 },
      lg: { height: 48, width: 96 }
    }

    return (
      <Skeleton
        ref={ref}
        height={sizeStyles[size].height}
        width={sizeStyles[size].width}
        rounded="md"
        className={className}
        {...props}
      />
    )
  }
)
SkeletonButton.displayName = 'SkeletonButton'

export { Skeleton, SkeletonText, SkeletonAvatar, SkeletonCard, SkeletonButton }
