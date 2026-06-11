/**
 * Dashboard runtime context: the schema registry widget queries execute
 * against, the dashboard-level variable scope, and host callbacks.
 */

import type { DashboardVariablesState } from '@xnetjs/data'
import type { SavedViewSchemaRegistry } from '@xnetjs/react'
import type { ReactNode } from 'react'
import { createContext, useContext, useMemo } from 'react'

export interface DashboardRuntimeValue {
  /** Schemas widget descriptors may query (passed to useSavedView) */
  schemas: SavedViewSchemaRegistry
  /** Dashboard-level variable scope */
  variables: DashboardVariablesState | undefined
  /** Open a node in its full surface (provided by the host app) */
  onOpenNode?: (nodeId: string, schemaId: string) => void
}

const DashboardRuntimeContext = createContext<DashboardRuntimeValue>({
  schemas: [],
  variables: undefined
})

export function DashboardRuntimeProvider(props: {
  schemas: SavedViewSchemaRegistry
  variables: DashboardVariablesState | undefined
  onOpenNode?: (nodeId: string, schemaId: string) => void
  children: ReactNode
}): JSX.Element {
  const value = useMemo<DashboardRuntimeValue>(
    () => ({
      schemas: props.schemas,
      variables: props.variables,
      onOpenNode: props.onOpenNode
    }),
    [props.schemas, props.variables, props.onOpenNode]
  )

  return (
    <DashboardRuntimeContext.Provider value={value}>
      {props.children}
    </DashboardRuntimeContext.Provider>
  )
}

export function useDashboardRuntime(): DashboardRuntimeValue {
  return useContext(DashboardRuntimeContext)
}
