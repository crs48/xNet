/**
 * Canvas theme tokens.
 *
 * Resolves light/dark-aware colors from the active document theme while
 * providing stable fallbacks for isolated tests and non-themed hosts.
 */

import { useEffect, useState } from 'react'

export type CanvasThemeMode = 'light' | 'dark'

export interface CanvasThemeTokens {
  mode: CanvasThemeMode
  surfaceBackground: string
  panelBackground: string
  panelBorder: string
  panelShadow: string
  panelText: string
  panelMutedText: string
  panelIconColor: string
  panelDivider: string
  panelButtonDisabled: string
  minimapBackground: string
  minimapBorder: string
  minimapEdge: string
  minimapViewportFill: string
  minimapViewportStroke: string
  minimapOverlayBackground: string
  gridColor: [number, number, number, number]
  majorGridColor: [number, number, number, number]
  axisColor: [number, number, number, number]
}

type ThemeVariableName =
  | 'background'
  | 'background-subtle'
  | 'foreground'
  | 'foreground-muted'
  | 'border'
  | 'border-emphasis'
  | 'primary'

const FALLBACK_THEME_VARIABLES: Record<CanvasThemeMode, Record<ThemeVariableName, string>> = {
  light: {
    background: '0 0% 98%',
    'background-subtle': '0 0% 100%',
    foreground: '0 0% 9%',
    'foreground-muted': '0 0% 45%',
    border: '0 0% 90%',
    'border-emphasis': '0 0% 82%',
    primary: '221 83% 53%'
  },
  dark: {
    background: '0 0% 7%',
    'background-subtle': '0 0% 10%',
    foreground: '0 0% 95%',
    'foreground-muted': '0 0% 65%',
    border: '0 0% 18%',
    'border-emphasis': '0 0% 25%',
    primary: '217 91% 60%'
  }
}

function resolveRootElement(root?: HTMLElement | null): HTMLElement | null {
  if (root) {
    return root
  }

  if (typeof document === 'undefined') {
    return null
  }

  return document.documentElement
}

export function resolveCanvasThemeMode(root?: HTMLElement | null): CanvasThemeMode {
  const resolvedRoot = resolveRootElement(root)

  if (resolvedRoot?.classList.contains('dark')) {
    return 'dark'
  }

  if (resolvedRoot?.classList.contains('light')) {
    return 'light'
  }

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  return 'light'
}

function readThemeVariable(name: ThemeVariableName, root?: HTMLElement | null): string {
  const resolvedRoot = resolveRootElement(root)
  const mode = resolveCanvasThemeMode(resolvedRoot)
  const fallback = FALLBACK_THEME_VARIABLES[mode][name]

  if (!resolvedRoot || typeof window === 'undefined') {
    return fallback
  }

  const value = window.getComputedStyle(resolvedRoot).getPropertyValue(`--${name}`).trim()

  return value || fallback
}

function hslWithAlpha(value: string, alpha: number): string {
  return `hsl(${value} / ${alpha})`
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)))
}

function hslToRgba(value: string, alpha: number): [number, number, number, number] {
  const match = value.match(/^\s*(-?(?:\d+(?:\.\d+)?))\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/)

  if (!match) {
    return [0.5, 0.5, 0.5, alpha]
  }

  const hue = (((Number(match[1]) % 360) + 360) % 360) / 360
  const saturation = Number(match[2]) / 100
  const lightness = Number(match[3]) / 100

  const hueToRgb = (p: number, q: number, t: number): number => {
    let normalized = t
    if (normalized < 0) normalized += 1
    if (normalized > 1) normalized -= 1
    if (normalized < 1 / 6) return p + (q - p) * 6 * normalized
    if (normalized < 1 / 2) return q
    if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6
    return p
  }

  let red = lightness
  let green = lightness
  let blue = lightness

  if (saturation !== 0) {
    const q =
      lightness < 0.5
        ? lightness * (1 + saturation)
        : lightness + saturation - lightness * saturation
    const p = 2 * lightness - q
    red = hueToRgb(p, q, hue + 1 / 3)
    green = hueToRgb(p, q, hue)
    blue = hueToRgb(p, q, hue - 1 / 3)
  }

  return [clampChannel(red) / 255, clampChannel(green) / 255, clampChannel(blue) / 255, alpha]
}

export function resolveCanvasThemeTokens(root?: HTMLElement | null): CanvasThemeTokens {
  const mode = resolveCanvasThemeMode(root)
  const background = readThemeVariable('background', root)
  const backgroundSubtle = readThemeVariable('background-subtle', root)
  const foreground = readThemeVariable('foreground', root)
  const foregroundMuted = readThemeVariable('foreground-muted', root)
  const border = readThemeVariable('border', root)
  const borderEmphasis = readThemeVariable('border-emphasis', root)
  const primary = readThemeVariable('primary', root)

  return {
    mode,
    surfaceBackground: hslWithAlpha(background, 1),
    panelBackground: hslWithAlpha(backgroundSubtle, mode === 'dark' ? 0.82 : 0.88),
    panelBorder: hslWithAlpha(borderEmphasis, mode === 'dark' ? 0.84 : 0.78),
    panelShadow:
      mode === 'dark' ? '0 18px 42px rgba(0, 0, 0, 0.42)' : '0 18px 38px rgba(15, 23, 42, 0.12)',
    panelText: hslWithAlpha(foreground, 1),
    panelMutedText: hslWithAlpha(foregroundMuted, mode === 'dark' ? 0.92 : 0.88),
    panelIconColor: hslWithAlpha(foreground, mode === 'dark' ? 0.92 : 0.82),
    panelDivider: hslWithAlpha(border, mode === 'dark' ? 0.92 : 0.88),
    panelButtonDisabled: hslWithAlpha(foregroundMuted, mode === 'dark' ? 0.42 : 0.48),
    minimapBackground: hslWithAlpha(backgroundSubtle, mode === 'dark' ? 0.88 : 0.95),
    minimapBorder: hslWithAlpha(borderEmphasis, mode === 'dark' ? 0.88 : 0.86),
    minimapEdge: hslWithAlpha(foregroundMuted, mode === 'dark' ? 0.34 : 0.28),
    minimapViewportFill: hslWithAlpha(primary, mode === 'dark' ? 0.2 : 0.12),
    minimapViewportStroke: hslWithAlpha(primary, mode === 'dark' ? 0.92 : 0.82),
    minimapOverlayBackground: hslWithAlpha(backgroundSubtle, mode === 'dark' ? 0.84 : 0.9),
    gridColor: hslToRgba(foregroundMuted, mode === 'dark' ? 0.2 : 0.12),
    majorGridColor: hslToRgba(foregroundMuted, mode === 'dark' ? 0.34 : 0.22),
    axisColor: hslToRgba(primary, mode === 'dark' ? 0.4 : 0.28)
  }
}

function areRgbaTuplesEqual(
  left: [number, number, number, number],
  right: [number, number, number, number]
): boolean {
  return left.every((value, index) => value === right[index])
}

function areCanvasThemeTokensEqual(left: CanvasThemeTokens, right: CanvasThemeTokens): boolean {
  return (
    left.mode === right.mode &&
    left.surfaceBackground === right.surfaceBackground &&
    left.panelBackground === right.panelBackground &&
    left.panelBorder === right.panelBorder &&
    left.panelShadow === right.panelShadow &&
    left.panelText === right.panelText &&
    left.panelMutedText === right.panelMutedText &&
    left.panelIconColor === right.panelIconColor &&
    left.panelDivider === right.panelDivider &&
    left.panelButtonDisabled === right.panelButtonDisabled &&
    left.minimapBackground === right.minimapBackground &&
    left.minimapBorder === right.minimapBorder &&
    left.minimapEdge === right.minimapEdge &&
    left.minimapViewportFill === right.minimapViewportFill &&
    left.minimapViewportStroke === right.minimapViewportStroke &&
    left.minimapOverlayBackground === right.minimapOverlayBackground &&
    areRgbaTuplesEqual(left.gridColor, right.gridColor) &&
    areRgbaTuplesEqual(left.majorGridColor, right.majorGridColor) &&
    areRgbaTuplesEqual(left.axisColor, right.axisColor)
  )
}

export function useCanvasThemeTokens(): CanvasThemeTokens {
  const [tokens, setTokens] = useState<CanvasThemeTokens>(() => resolveCanvasThemeTokens())

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return
    }

    const root = document.documentElement
    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null
    const updateTokens = () => {
      const nextTokens = resolveCanvasThemeTokens(root)
      setTokens((currentTokens) =>
        areCanvasThemeTokensEqual(currentTokens, nextTokens) ? currentTokens : nextTokens
      )
    }

    updateTokens()

    const observer = new MutationObserver(updateTokens)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'style']
    })

    mediaQuery?.addEventListener('change', updateTokens)

    return () => {
      observer.disconnect()
      mediaQuery?.removeEventListener('change', updateTokens)
    }
  }, [])

  return tokens
}
