/**
 * ViewRenderer — dispatches a database view type to its registered
 * component (exploration 0337). The database shell renders this for
 * every non-table/form view; plugin-registered types render through the
 * exact same path.
 */

import React from 'react'
import type { DatabaseViewProps } from './database-views/contract.js'
import { viewRegistry } from './registry.js'

export interface ViewRendererProps extends DatabaseViewProps {
  /** View type to render (the DatabaseView node's `type`) */
  type: string
}

export function ViewRenderer({ type, ...props }: ViewRendererProps): React.JSX.Element {
  const registration = viewRegistry.get(type)
  if (!registration) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-ink-3">
        Unknown view type “{type}”. A plugin may need to be enabled.
      </div>
    )
  }
  const Component = registration.component
  return <Component {...props} />
}
