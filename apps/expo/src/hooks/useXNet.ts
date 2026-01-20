/**
 * XNet client hook for Expo
 */
import { useState, useEffect } from 'react'
import { createXNetClient, type XNetClient } from '@xnet/sdk'
import { ExpoStorageAdapter } from '../storage/ExpoStorageAdapter'
import 'react-native-get-random-values' // Polyfill for crypto

interface UseXNetResult {
  client: XNetClient | null
  isReady: boolean
  identity: string | null
  error: Error | null
}

let clientInstance: XNetClient | null = null

export function useXNet(): UseXNetResult {
  const [isReady, setIsReady] = useState(false)
  const [identity, setIdentity] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function init() {
      try {
        if (!clientInstance) {
          const storage = new ExpoStorageAdapter('xnet.db')
          clientInstance = await createXNetClient({
            storage,
            enableNetwork: false // Disabled until network is stable
          })
          await clientInstance.start()
        }
        setIdentity(clientInstance.identity.did)
        setIsReady(true)
      } catch (e) {
        setError(e as Error)
      }
    }

    init()

    return () => {
      // Don't stop client on unmount - it's shared
    }
  }, [])

  return {
    client: clientInstance,
    isReady,
    identity,
    error
  }
}
