/**
 * XNet React context provider
 */
import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { StorageAdapter } from '@xnet/storage'
import type { NetworkNode } from '@xnet/network'
import type { Identity } from '@xnet/identity'
import type { SearchIndex } from '@xnet/query'
import { createXNetStore, type XNetStore } from './store/xnet'

/**
 * XNet configuration
 */
export interface XNetConfig {
  storage: StorageAdapter
  network?: NetworkNode
  identity?: Identity
  searchIndex?: SearchIndex
}

/**
 * XNet context value
 */
export interface XNetContextValue {
  store: XNetStore
  storage: StorageAdapter
  network?: NetworkNode
  identity?: Identity
  searchIndex?: SearchIndex
  isReady: boolean
}

const XNetContext = createContext<XNetContextValue | null>(null)

/**
 * XNet provider props
 */
export interface XNetProviderProps {
  config: XNetConfig
  children: ReactNode
}

/**
 * XNet provider component
 */
export function XNetProvider({ config, children }: XNetProviderProps): JSX.Element {
  const [store] = useState(() => createXNetStore({ storage: config.storage }))
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Initialize storage
    config.storage.open().then(() => {
      setIsReady(true)
    })

    return () => {
      config.storage.close()
    }
  }, [config.storage])

  const value: XNetContextValue = {
    store,
    storage: config.storage,
    network: config.network,
    identity: config.identity,
    searchIndex: config.searchIndex,
    isReady
  }

  return React.createElement(XNetContext.Provider, { value }, children)
}

/**
 * Hook to access XNet context
 */
export function useXNet(): XNetContextValue {
  const context = useContext(XNetContext)
  if (!context) {
    throw new Error('useXNet must be used within an XNetProvider')
  }
  return context
}
