/**
 * Color contrast utilities for WCAG compliance
 *
 * Provides functions to calculate and verify color contrast ratios
 * according to WCAG 2.1 guidelines.
 */

// ─── Types ─────────────────────────────────────────────────────────

export interface RGB {
  r: number
  g: number
  b: number
}

export interface HSL {
  h: number
  s: number
  l: number
}

export type ContrastLevel = 'AA' | 'AAA'

export interface ContrastResult {
  ratio: number
  meetsAA: boolean
  meetsAAA: boolean
  meetsAALarge: boolean
  meetsAAALarge: boolean
}

// ─── Luminance Calculation ─────────────────────────────────────────

/**
 * Calculate relative luminance of a color.
 *
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * Calculate relative luminance from RGB object.
 */
export function getLuminanceFromRGB(color: RGB): number {
  return getLuminance(color.r, color.g, color.b)
}

// ─── Contrast Ratio ────────────────────────────────────────────────

/**
 * Calculate contrast ratio between two colors.
 *
 * @see https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 *
 * @param color1 - First color as RGB
 * @param color2 - Second color as RGB
 * @returns Contrast ratio (1 to 21)
 */
export function getContrastRatio(color1: RGB, color2: RGB): number {
  const l1 = getLuminanceFromRGB(color1)
  const l2 = getLuminanceFromRGB(color2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Get full contrast analysis between two colors.
 */
export function analyzeContrast(color1: RGB, color2: RGB): ContrastResult {
  const ratio = getContrastRatio(color1, color2)
  return {
    ratio,
    meetsAA: ratio >= 4.5,
    meetsAAA: ratio >= 7,
    meetsAALarge: ratio >= 3,
    meetsAAALarge: ratio >= 4.5
  }
}

// ─── WCAG Requirements ─────────────────────────────────────────────

/**
 * Check if contrast meets WCAG requirements.
 *
 * @param ratio - Contrast ratio
 * @param level - WCAG level ('AA' or 'AAA')
 * @param isLargeText - Whether the text is large (18pt+ or 14pt+ bold)
 */
export function meetsContrastRequirement(
  ratio: number,
  level: ContrastLevel = 'AA',
  isLargeText: boolean = false
): boolean {
  if (level === 'AAA') {
    return isLargeText ? ratio >= 4.5 : ratio >= 7
  }
  return isLargeText ? ratio >= 3 : ratio >= 4.5
}

/**
 * Get the minimum required contrast ratio.
 */
export function getMinimumContrastRatio(
  level: ContrastLevel = 'AA',
  isLargeText: boolean = false
): number {
  if (level === 'AAA') {
    return isLargeText ? 4.5 : 7
  }
  return isLargeText ? 3 : 4.5
}

// ─── Color Parsing ─────────────────────────────────────────────────

/**
 * Parse a hex color string to RGB.
 */
export function hexToRGB(hex: string): RGB {
  // Remove # if present
  hex = hex.replace(/^#/, '')

  // Handle shorthand (e.g., #fff)
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }

  const num = parseInt(hex, 16)
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  }
}

/**
 * Convert RGB to hex string.
 */
export function rgbToHex(color: RGB): string {
  const toHex = (n: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
}

/**
 * Parse HSL string to RGB.
 *
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 */
export function hslToRGB(h: number, s: number, l: number): RGB {
  s /= 100
  l /= 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let r = 0,
    g = 0,
    b = 0

  if (h >= 0 && h < 60) {
    r = c
    g = x
    b = 0
  } else if (h >= 60 && h < 120) {
    r = x
    g = c
    b = 0
  } else if (h >= 120 && h < 180) {
    r = 0
    g = c
    b = x
  } else if (h >= 180 && h < 240) {
    r = 0
    g = x
    b = c
  } else if (h >= 240 && h < 300) {
    r = x
    g = 0
    b = c
  } else if (h >= 300 && h < 360) {
    r = c
    g = 0
    b = x
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  }
}

/**
 * Parse a CSS color string to RGB.
 *
 * Supports hex (#fff, #ffffff), rgb(r, g, b), and hsl(h, s%, l%).
 */
export function parseColor(color: string): RGB | null {
  color = color.trim().toLowerCase()

  // Hex
  if (color.startsWith('#')) {
    return hexToRGB(color)
  }

  // RGB
  const rgbMatch = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/)
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10)
    }
  }

  // HSL
  const hslMatch = color.match(/^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/)
  if (hslMatch) {
    return hslToRGB(parseInt(hslMatch[1], 10), parseInt(hslMatch[2], 10), parseInt(hslMatch[3], 10))
  }

  return null
}

// ─── Suggestions ───────────────────────────────────────────────────

/**
 * Suggest a lighter or darker version of a color to meet contrast requirements.
 *
 * @param foreground - Foreground color
 * @param background - Background color
 * @param level - Target WCAG level
 * @param isLargeText - Whether the text is large
 */
export function suggestAccessibleColor(
  foreground: RGB,
  background: RGB,
  level: ContrastLevel = 'AA',
  isLargeText: boolean = false
): RGB {
  const targetRatio = getMinimumContrastRatio(level, isLargeText)
  const currentRatio = getContrastRatio(foreground, background)

  if (currentRatio >= targetRatio) {
    return foreground
  }

  // Determine if we should lighten or darken
  const bgLuminance = getLuminanceFromRGB(background)
  const shouldDarken = bgLuminance > 0.5

  // Binary search for the right adjustment
  let low = 0
  let high = 1
  let result = foreground

  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2
    const adjusted = adjustBrightness(foreground, shouldDarken ? -mid : mid)
    const ratio = getContrastRatio(adjusted, background)

    if (ratio >= targetRatio) {
      result = adjusted
      if (shouldDarken) {
        low = mid
      } else {
        high = mid
      }
    } else {
      if (shouldDarken) {
        high = mid
      } else {
        low = mid
      }
    }
  }

  return result
}

/**
 * Adjust the brightness of a color.
 *
 * @param color - Color to adjust
 * @param amount - Amount to adjust (-1 to 1, negative = darker)
 */
function adjustBrightness(color: RGB, amount: number): RGB {
  const adjust = (c: number) => {
    if (amount > 0) {
      return Math.round(c + (255 - c) * amount)
    }
    return Math.round(c * (1 + amount))
  }

  return {
    r: Math.max(0, Math.min(255, adjust(color.r))),
    g: Math.max(0, Math.min(255, adjust(color.g))),
    b: Math.max(0, Math.min(255, adjust(color.b)))
  }
}
