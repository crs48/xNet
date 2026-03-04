# 05 - App Theming

> ThemeProvider, useTheme hook, theme toggle, and per-app integration

## Overview

This document implements the theme management layer - a `ThemeProvider` that manages the `.dark` class on `<html>`, persists the user's preference, and respects system preferences as default. All three apps (Electron, Web, Expo) get proper dark/light mode support.

## ThemeProvider

```typescript
// packages/ui/src/theme/ThemeProvider.tsx

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme                    // Current setting (including 'system')
  resolvedTheme: 'light' | 'dark' // Actual applied theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: Theme
  storageKey?: string
  attribute?: string             // default: 'class'
  enableSystem?: boolean         // default: true
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'xnet-theme',
  attribute = 'class',
  enableSystem = true,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Read from storage on mount
    if (typeof window === 'undefined') return defaultTheme
    try {
      return (localStorage.getItem(storageKey) as Theme) || defaultTheme
    } catch {
      return defaultTheme
    }
  })

  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  // Listen for system theme changes
  useEffect(() => {
    if (!enableSystem) return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [enableSystem])

  // Compute resolved theme
  const resolvedTheme = theme === 'system' ? systemTheme : theme

  // Apply theme to DOM
  useEffect(() => {
    const root = window.document.documentElement

    if (attribute === 'class') {
      root.classList.remove('light', 'dark')
      root.classList.add(resolvedTheme)
    } else {
      root.setAttribute(attribute, resolvedTheme)
    }
  }, [resolvedTheme, attribute])

  // Persist theme choice
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    try {
      localStorage.setItem(storageKey, newTheme)
    } catch {
      // Silent fail (incognito, etc.)
    }
  }, [storageKey])

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [resolvedTheme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
```

## Theme Toggle Component

```typescript
// packages/ui/src/composed/ThemeToggle.tsx

import { useTheme } from '../theme/ThemeProvider'
import { Button } from '../primitives/Button'

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme, theme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className={className}
      title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}

// Dropdown version with system option
export function ThemeDropdown({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className}>
          <SunIcon className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <MoonIcon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

## App Integrations

### Electron App

```typescript
// apps/electron/src/renderer/App.tsx

import { ThemeProvider } from '@xnetjs/ui'

export function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="xnet-electron-theme">
      <NodeStoreProvider {...}>
        {/* ... app content */}
      </NodeStoreProvider>
    </ThemeProvider>
  )
}
```

Electron menu integration:

```typescript
// apps/electron/src/main/menu.ts
{
  label: 'Appearance',
  submenu: [
    { label: 'Light', click: () => win.webContents.send('theme:set', 'light') },
    { label: 'Dark', click: () => win.webContents.send('theme:set', 'dark') },
    { label: 'System', click: () => win.webContents.send('theme:set', 'system') },
  ]
}
```

### Web App

```typescript
// apps/web/src/App.tsx

import { ThemeProvider } from '@xnetjs/ui'

export function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
      <Router />
    </ThemeProvider>
  )
}
```

### Expo App

For React Native, we use a simplified approach since there's no `<html>` element:

```typescript
// packages/ui/src/theme/ThemeProvider.native.tsx

import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export function ThemeProvider({ children, defaultTheme = 'system' }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme()
  const [theme, setThemeState] = useState<Theme>(defaultTheme)

  // Load persisted theme
  useEffect(() => {
    AsyncStorage.getItem('xnet-theme').then(stored => {
      if (stored) setThemeState(stored as Theme)
    })
  }, [])

  const resolvedTheme = theme === 'system'
    ? (systemColorScheme ?? 'light')
    : theme

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    AsyncStorage.setItem('xnet-theme', t)
  }, [])

  // For NativeWind, we need to set the colorScheme
  // This integrates with NativeWind's dark mode support

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      <View style={{ flex: 1 }} className={resolvedTheme === 'dark' ? 'dark' : ''}>
        {children}
      </View>
    </ThemeContext.Provider>
  )
}
```

## CSS Import Structure

Each app imports the tokens CSS file:

```typescript
// apps/electron/src/renderer/main.tsx
import '@xnetjs/ui/src/theme/tokens.css'
import './styles.css' // App-specific overrides only (titlebar, etc.)

// apps/web/src/main.tsx
import '@xnetjs/ui/src/theme/tokens.css'
import './styles.css' // App-specific layout only
```

The old `globals.css` variable definitions are removed. Any app-specific CSS (titlebar height, etc.) goes in a minimal app stylesheet.

## Flash Prevention

To prevent a flash of wrong theme on page load, add a script to the HTML:

```html
<!-- apps/web/index.html / apps/electron/index.html -->
<script>
  ;(function () {
    const theme = localStorage.getItem('xnet-web-theme') || 'system'
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme
    document.documentElement.classList.add(resolved)
  })()
</script>
```

## Checklist

- [ ] Implement `ThemeProvider` with system detection
- [ ] Implement `useTheme` hook
- [ ] Implement `ThemeToggle` button component
- [ ] Implement `ThemeDropdown` with light/dark/system options
- [ ] Integrate ThemeProvider into Electron app
- [ ] Integrate ThemeProvider into Web app
- [ ] Implement React Native ThemeProvider variant
- [ ] Integrate into Expo app
- [ ] Add Electron menu items for theme switching
- [ ] Add flash-prevention script to HTML files
- [x] Remove old CSS variable definitions from app stylesheets
- [ ] Import tokens.css in each app entry point
- [ ] Verify light mode works in Electron
- [ ] Verify dark mode works in Electron
- [ ] Verify system detection works in Web
- [ ] Verify theme persists across page reloads
- [ ] Verify no flash of wrong theme on load

---

[Previous: New Primitives](./04-new-primitives.md) | [Next: DevTools Components](./06-devtools-components.md)
