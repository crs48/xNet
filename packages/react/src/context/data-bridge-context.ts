import type { DataBridge } from '@xnetjs/data-bridge'
import type { ReactNode } from 'react'
import { createContext, createElement, useContext } from 'react'

export const DataBridgeContext = createContext<DataBridge | null>(null)

/** @internal Host bridge access; excluded from the untrusted extension import map. */
export function useDataBridge(): DataBridge | null {
  return useContext(DataBridgeContext)
}

/** Supply an already initialized bridge without starting identity, storage, or sync. */
export function DataBridgeProvider({
  bridge,
  children
}: {
  bridge: DataBridge
  children: ReactNode
}) {
  return createElement(DataBridgeContext.Provider, { value: bridge }, children)
}
