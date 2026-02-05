/**
 * ViewRenderer - Renders the appropriate view based on type
 *
 * Replaces hardcoded switch statements in apps with a registry-based lookup.
 */

import type { ViewProps } from './registry.js'
import React from 'react'
import { useViewRegistry } from './hooks/useViewRegistry.js'

export interface ViewRendererProps extends ViewProps {
  /** View type to render */
  viewType: string
  /** Fallback content when view type is not found */
  fallback?: React.ReactNode
}

/**
 * Renders a view component based on the view type
 *
 * Looks up the view component from the ViewRegistry and renders it
 * with the provided props. Falls back to an error message if the
 * view type is not registered.
 *
 * @example
 * ```tsx
 * // Instead of:
 * switch (viewType) {
 *   case 'table': return <TableView {...props} />
 *   case 'board': return <BoardView {...props} />
 * }
 *
 * // Use:
 * <ViewRenderer viewType={viewType} {...props} />
 * ```
 */
export function ViewRenderer({
  viewType,
  fallback,
  ...viewProps
}: ViewRendererProps): React.JSX.Element {
  const { getView } = useViewRegistry()
  const registration = getView(viewType)

  if (!registration) {
    if (fallback) {
      return <>{fallback}</>
    }
    return (
      <div className="flex items-center justify-center h-full p-8 text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium">Unknown view type</p>
          <p className="text-sm mt-1">View type &quot;{viewType}&quot; is not registered</p>
        </div>
      </div>
    )
  }

  const Component = registration.component
  return <Component {...viewProps} />
}
