/**
 * useDevTools hook - access DevTools context from any panel component
 */

import { useContext } from 'react'
import { DevToolsContext, type DevToolsContextValue } from './DevToolsContext'

export function useDevTools(): DevToolsContextValue {
  const ctx = useContext(DevToolsContext)
  if (!ctx) {
    throw new Error('useDevTools must be used within an XNetDevToolsProvider')
  }
  return ctx
}
