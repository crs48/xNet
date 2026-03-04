/**
 * xNet Mobile - Main App Entry
 */
import type { XNetConfig } from '@xnetjs/react'
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native'
import { SQLiteNodeStorageAdapter } from '@xnetjs/data'
import { XNetProvider } from '@xnetjs/react'
import { SCHEMA_DDL, SCHEMA_VERSION } from '@xnetjs/sqlite'
import { ExpoSQLiteAdapter } from '@xnetjs/sqlite/expo'
import * as SecureStore from 'expo-secure-store'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, View, useColorScheme } from 'react-native'
import 'react-native-get-random-values'
import { AppNavigator } from './src/navigation/AppNavigator'

const IDENTITY_KEY = 'xnet:identity'
const SIGNING_KEY = 'xnet:signingKey'

function generateSigningKey(): Uint8Array {
  const key = new Uint8Array(32)
  crypto.getRandomValues(key)
  return key
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

function generateDID(publicKey: Uint8Array): `did:key:${string}` {
  const keyHex = toHex(publicKey.slice(0, 16))
  return `did:key:z${keyHex}`
}

async function loadOrCreateIdentity(): Promise<{
  did: `did:key:${string}`
  signingKey: Uint8Array
}> {
  try {
    const storedDID = await SecureStore.getItemAsync(IDENTITY_KEY)
    const storedKey = await SecureStore.getItemAsync(SIGNING_KEY)

    if (storedDID && storedKey) {
      return { did: storedDID as `did:key:${string}`, signingKey: fromHex(storedKey) }
    }
  } catch (err) {
    void err
  }

  const signingKey = generateSigningKey()
  const did = generateDID(signingKey)

  try {
    await SecureStore.setItemAsync(IDENTITY_KEY, did)
    await SecureStore.setItemAsync(SIGNING_KEY, toHex(signingKey))
  } catch (err) {
    void err
  }

  return { did, signingKey }
}

export default function App() {
  const colorScheme = useColorScheme()
  const [config, setConfig] = useState<XNetConfig | null>(null)
  const [bootError, setBootError] = useState<Error | null>(null)

  useEffect(() => {
    let disposed = false
    let sqlite: ExpoSQLiteAdapter | null = null

    async function bootstrap(): Promise<void> {
      try {
        const identity = await loadOrCreateIdentity()

        sqlite = new ExpoSQLiteAdapter()
        await sqlite.open({ path: 'xnet.db' })
        await sqlite.applySchema(SCHEMA_VERSION, SCHEMA_DDL)

        const nodeStorage = new SQLiteNodeStorageAdapter(sqlite)

        if (disposed) {
          await sqlite.close()
          return
        }

        setConfig({
          nodeStorage,
          authorDID: identity.did,
          signingKey: identity.signingKey
        })
      } catch (err) {
        if (!disposed) {
          setBootError(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }

    bootstrap()

    return () => {
      disposed = true
      if (sqlite) {
        sqlite.close().catch(() => {})
      }
    }
  }, [])

  const navTheme = useMemo(() => (colorScheme === 'dark' ? DarkTheme : DefaultTheme), [colorScheme])

  if (bootError) {
    return <View style={{ flex: 1, backgroundColor: '#fff' }} />
  }

  if (!config) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}
      >
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    )
  }

  return (
    <XNetProvider config={config}>
      <NavigationContainer theme={navTheme}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <AppNavigator />
      </NavigationContainer>
    </XNetProvider>
  )
}
