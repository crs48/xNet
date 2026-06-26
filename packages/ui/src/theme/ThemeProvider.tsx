import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'

/**
 * 'true-black' collapses dark surfaces to #000 for OLED (0166).
 * 'linear' adds Linear's opt-in violet accent over the monochrome ramp (0198).
 * 'cozy' warms surfaces + ink with a paper canvas and a terracotta accent — an
 * opt-in relaxation of the 0166 "chrome has no hue" default (0232).
 */
export type ThemeVariant = 'default' | 'true-black' | 'linear' | 'cozy'

/**
 * Density is an axis orthogonal to the colour variant (0232). 'compact' is the
 * historical 13px IDE feel (the default — no regression); 'comfortable' opens
 * up type and chrome for a calmer, roomier day.
 */
export type Density = 'compact' | 'comfortable'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  variant: ThemeVariant
  setVariant: (variant: ThemeVariant) => void
  density: Density
  setDensity: (density: Density) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: Theme
  storageKey?: string
  attribute?: string
  enableSystem?: boolean
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'xnet-theme',
  attribute = 'class',
  enableSystem = true
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
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

  const [variant, setVariantState] = useState<ThemeVariant>(() => {
    if (typeof window === 'undefined') return 'default'
    try {
      return (localStorage.getItem(`${storageKey}-variant`) as ThemeVariant) || 'default'
    } catch {
      return 'default'
    }
  })

  const [density, setDensityState] = useState<Density>(() => {
    if (typeof window === 'undefined') return 'compact'
    try {
      return (localStorage.getItem(`${storageKey}-density`) as Density) || 'compact'
    } catch {
      return 'compact'
    }
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

    if (variant === 'default') {
      delete root.dataset.variant
    } else {
      root.dataset.variant = variant
    }

    // 'compact' is the base ramp's default, so the attribute is only set for
    // the opt-in 'comfortable' density (mirrors the variant handling above).
    if (density === 'compact') {
      delete root.dataset.density
    } else {
      root.dataset.density = density
    }
  }, [resolvedTheme, attribute, variant, density])

  // Persist theme choice
  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme)
      try {
        localStorage.setItem(storageKey, newTheme)
      } catch {
        // Silent fail (incognito, etc.)
      }
    },
    [storageKey]
  )

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [resolvedTheme, setTheme])

  const setVariant = useCallback(
    (newVariant: ThemeVariant) => {
      setVariantState(newVariant)
      try {
        localStorage.setItem(`${storageKey}-variant`, newVariant)
      } catch {
        // Silent fail (incognito, etc.)
      }
    },
    [storageKey]
  )

  const setDensity = useCallback(
    (newDensity: Density) => {
      setDensityState(newDensity)
      try {
        localStorage.setItem(`${storageKey}-density`, newDensity)
      } catch {
        // Silent fail (incognito, etc.)
      }
    },
    [storageKey]
  )

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
        variant,
        setVariant,
        density,
        setDensity
      }}
    >
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
