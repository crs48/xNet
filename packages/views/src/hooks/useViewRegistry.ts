/**
 * React hook for accessing the ViewRegistry
 */

import type { SchemaIRI } from '@xnet/data'
import { useState, useEffect, useCallback } from 'react'
import { viewRegistry, type ViewRegistration, type Platform } from '../registry.js'

/**
 * Hook return value for useViewRegistry
 */
export interface UseViewRegistryResult {
  /** All registered views */
  views: ViewRegistration[]
  /** Get a specific view by type */
  getView: (type: string) => ViewRegistration | undefined
  /** Get views compatible with a schema */
  getViewsForSchema: (schemaIRI: SchemaIRI) => ViewRegistration[]
  /** Get views compatible with a platform */
  getViewsForPlatform: (platform: Platform) => ViewRegistration[]
  /** Check if a view type is registered */
  hasView: (type: string) => boolean
}

/**
 * React hook for accessing the ViewRegistry
 *
 * Provides reactive access to registered views. The hook re-renders
 * when views are added or removed from the registry.
 *
 * @example
 * ```tsx
 * function ViewSwitcher({ currentType, onChange }) {
 *   const { views } = useViewRegistry()
 *
 *   return (
 *     <div>
 *       {views.map(view => (
 *         <button
 *           key={view.type}
 *           onClick={() => onChange(view.type)}
 *           className={currentType === view.type ? 'active' : ''}
 *         >
 *           {view.name}
 *         </button>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useViewRegistry(): UseViewRegistryResult {
  const [views, setViews] = useState(() => viewRegistry.getAll())

  useEffect(() => {
    // Subscribe to registry changes
    const unsubscribe = viewRegistry.onChange(() => {
      setViews(viewRegistry.getAll())
    })
    return unsubscribe
  }, [])

  const getView = useCallback((type: string) => {
    return viewRegistry.get(type)
  }, [])

  const getViewsForSchema = useCallback((schemaIRI: SchemaIRI) => {
    return viewRegistry.getForSchema(schemaIRI)
  }, [])

  const getViewsForPlatform = useCallback((platform: Platform) => {
    return viewRegistry.getForPlatform(platform)
  }, [])

  const hasView = useCallback((type: string) => {
    return viewRegistry.has(type)
  }, [])

  return {
    views,
    getView,
    getViewsForSchema,
    getViewsForPlatform,
    hasView
  }
}
