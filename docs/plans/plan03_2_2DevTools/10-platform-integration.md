# 10 - Platform Integration

> Making devtools work across Electron, Expo, and Web with platform-appropriate UI

## Overview

xNet runs on three platforms (Electron desktop, Expo mobile, Web PWA). The devtools must work on all three with appropriate interaction patterns for each. The core devtools are platform-agnostic React components; this document covers the platform-specific shell, toggle mechanisms, and layout adaptations.

## Platform Detection

```typescript
// utils/platform.ts

export type Platform = 'electron' | 'expo' | 'web'

export function detectPlatform(): Platform {
  // Electron: check for IPC bridge
  if (typeof window !== 'undefined' && window.electronAPI) {
    return 'electron'
  }

  // Expo: check for React Native / Expo globals
  if (typeof global !== 'undefined' && (global as any).__expo) {
    return 'expo'
  }

  // Default: web
  return 'web'
}

export function isDesktop(): boolean {
  return detectPlatform() === 'electron'
}

export function isMobile(): boolean {
  return detectPlatform() === 'expo'
}

export function isWeb(): boolean {
  return detectPlatform() === 'web'
}
```

## Platform Strategies

| Feature         | Electron                        | Web PWA                  | Expo Mobile          |
| --------------- | ------------------------------- | ------------------------ | -------------------- |
| **Toggle**      | `Cmd+Shift+D` / menu item       | `Ctrl+Shift+D`           | 4-finger tap / shake |
| **Position**    | Bottom/right of window          | Bottom/right of viewport | Full-screen overlay  |
| **Resize**      | Drag handle                     | Drag handle              | Fixed full-screen    |
| **Persistence** | localStorage                    | localStorage             | AsyncStorage         |
| **IPC**         | BroadcastChannel + Electron IPC | BroadcastChannel         | React Native bridge  |
| **Font**        | System mono                     | System mono              | Platform mono        |

## Electron Integration

### Menu Item

```typescript
// apps/electron/src/main/menu.ts

import { Menu, BrowserWindow } from 'electron'

export function createDevToolsMenuItem(): Electron.MenuItemConstructorOptions {
  return {
    label: 'Toggle xNet DevTools',
    accelerator: 'CmdOrCtrl+Shift+D',
    click: (_, window) => {
      window?.webContents.send('devtools:toggle')
    }
  }
}
```

### Renderer Listener

```typescript
// apps/electron/src/renderer/devtools-bridge.ts

export function setupElectronDevToolsBridge() {
  if (!window.electronAPI?.onDevToolsToggle) return

  window.electronAPI.onDevToolsToggle(() => {
    // Dispatch custom event that DevToolsProvider listens for
    window.dispatchEvent(new CustomEvent('xnet-devtools-toggle'))
  })
}
```

### Provider Adaptation

```typescript
// In DevToolsProvider: listen for Electron IPC toggle
useEffect(() => {
  if (detectPlatform() !== 'electron') return

  const handler = () => setIsOpen((prev) => !prev)
  window.addEventListener('xnet-devtools-toggle', handler)
  return () => window.removeEventListener('xnet-devtools-toggle', handler)
}, [])
```

### Electron Window Panel

In Electron, the devtools panel is rendered within the same BrowserWindow. For a more advanced setup (future), it could be a separate BrowserWindow communicating via IPC.

```typescript
// Future: Separate window option
function openDevToolsWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'xNet DevTools',
    webPreferences: { preload: '...' }
  })
  win.loadURL('app://devtools') // Separate route
}
```

## Expo/React Native Integration

### Touch Gesture Toggle

```typescript
// Expo-specific gesture handler

import { GestureDetector, Gesture } from 'react-native-gesture-handler'

export function DevToolsGestureWrapper({ children, onToggle }) {
  // 4-finger tap
  const tapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .minPointers(4)
    .onEnd(() => onToggle())

  return (
    <GestureDetector gesture={tapGesture}>
      {children}
    </GestureDetector>
  )
}
```

### Shake Gesture (Android)

```typescript
import { DeviceMotion } from 'expo-sensors'

export function useShakeDetector(onShake: () => void) {
  useEffect(() => {
    let lastShake = 0
    const threshold = 15 // m/s^2

    const subscription = DeviceMotion.addListener(({ acceleration }) => {
      if (!acceleration) return
      const { x, y, z } = acceleration
      const magnitude = Math.sqrt(x * x + y * y + z * z)

      if (magnitude > threshold && Date.now() - lastShake > 1000) {
        lastShake = Date.now()
        onShake()
      }
    })

    DeviceMotion.setUpdateInterval(100)
    return () => subscription.remove()
  }, [onShake])
}
```

### Mobile Overlay Layout

On mobile, the devtools render as a full-screen overlay with a close button:

```typescript
// panels/Shell.mobile.tsx

import { Modal, SafeAreaView, ScrollView } from 'react-native'

export function MobileDevToolsShell({ children, visible, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView className="flex-1 bg-zinc-950">
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 border-b border-zinc-800">
          <Text className="text-white font-bold">xNet DevTools</Text>
          <Pressable onPress={onClose} className="ml-auto">
            <Text className="text-zinc-400">Close</Text>
          </Pressable>
        </View>

        {/* Tab bar */}
        <ScrollView horizontal className="border-b border-zinc-800">
          {/* Horizontal scrolling tabs for mobile */}
        </ScrollView>

        {/* Content */}
        <View className="flex-1">
          {children}
        </View>
      </SafeAreaView>
    </Modal>
  )
}
```

### React Native Table Fallback

Since `@xnetjs/views` TableView uses HTML `<table>`, on React Native we need a simplified list view for the Node Explorer:

```typescript
// panels/NodeExplorer/NodeExplorer.native.tsx

import { FlatList, View, Text } from 'react-native'

export function NodeExplorerNative({ nodes }) {
  return (
    <FlatList
      data={nodes}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <View className="flex-row px-3 py-2 border-b border-zinc-800">
          <Text className="text-zinc-200 text-xs flex-1">{item.properties?.title ?? item.id}</Text>
          <Text className="text-zinc-500 text-xs">{item.schemaId.split('/').pop()}</Text>
        </View>
      )}
    />
  )
}
```

## Web PWA Integration

The web version is the default. It uses the standard panel shell with keyboard shortcuts and BroadcastChannel for potential extension support.

### Service Worker Awareness

```typescript
// If the app has a service worker, devtools should be aware of it
export function useServiceWorkerStatus() {
  const [swStatus, setSwStatus] = useState<'none' | 'installing' | 'active' | 'waiting'>('none')

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setSwStatus('none')
      return
    }

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return setSwStatus('none')
      if (reg.active) setSwStatus('active')
      else if (reg.installing) setSwStatus('installing')
      else if (reg.waiting) setSwStatus('waiting')
    })
  }, [])

  return swStatus
}
```

## Persistence of DevTools State

DevTools state (open/closed, active panel, position, height) persists across sessions:

```typescript
// utils/persistence.ts

const STORAGE_KEY = 'xnet-devtools-state'

interface PersistedState {
  isOpen: boolean
  activePanel: PanelId
  position: PanelPosition
  height: number
}

export function loadDevToolsState(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveDevToolsState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Silent fail (e.g., incognito mode)
  }
}
```

## Platform-Specific Exports

```typescript
// The package uses platform-specific file extensions for React Native:
// panels/Shell.tsx         → Web/Electron
// panels/Shell.native.tsx  → React Native (Expo)

// metro.config.js in apps/expo:
// resolver: { sourceExts: ['native.tsx', 'tsx', 'ts', ...] }
```

## BroadcastChannel Bridge (Future Extension Support)

```typescript
// utils/broadcast.ts

export class DevToolsBroadcast {
  private channel: BroadcastChannel | null

  constructor() {
    this.channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('xnet-devtools') : null
  }

  /** Send state snapshot to external listeners (browser extension, separate window) */
  broadcastState(state: unknown): void {
    this.channel?.postMessage({ type: 'STATE_UPDATE', payload: state })
  }

  /** Listen for commands from external sources */
  onCommand(handler: (command: string, args: unknown) => void): () => void {
    if (!this.channel) return () => {}

    const listener = (event: MessageEvent) => {
      if (event.data?.type === 'COMMAND') {
        handler(event.data.command, event.data.args)
      }
    }
    this.channel.addEventListener('message', listener)
    return () => this.channel?.removeEventListener('message', listener)
  }

  dispose(): void {
    this.channel?.close()
  }
}
```

## Checklist

- [ ] Implement `detectPlatform()` utility
- [ ] Implement Electron menu item and IPC bridge
- [ ] Implement Expo 4-finger tap gesture
- [ ] Implement Expo shake detection (Android)
- [ ] Implement mobile full-screen overlay shell
- [ ] Implement React Native fallback for TableView (FlatList)
- [ ] Implement devtools state persistence (localStorage/AsyncStorage)
- [ ] Implement BroadcastChannel bridge for future extension
- [ ] Implement `.native.tsx` variants for key components
- [ ] Add platform detection to status bar
- [ ] Write tests for platform detection
- [ ] Test on Electron (macOS)
- [ ] Test on Expo (iOS simulator)
- [ ] Test on Web (Chrome, Safari)

---

[Previous: Telemetry Panel](./09-telemetry-panel.md)
