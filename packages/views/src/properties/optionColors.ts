/**
 * Chip colors for select options.
 *
 * V2 options store a named SelectColor ('gray' | 'brown' | …). These map to
 * soft chip palettes (Notion-style) for light/dark. Unknown values (legacy
 * hex strings) fall through to inline background-color.
 */

export interface OptionChipStyle {
  backgroundColor: string
  color: string
}

const CHIP_COLORS: Record<string, OptionChipStyle> = {
  gray: { backgroundColor: '#e5e7eb', color: '#374151' },
  brown: { backgroundColor: '#e8d5c4', color: '#6b4226' },
  orange: { backgroundColor: '#fed7aa', color: '#9a3412' },
  yellow: { backgroundColor: '#fef08a', color: '#854d0e' },
  green: { backgroundColor: '#bbf7d0', color: '#166534' },
  blue: { backgroundColor: '#bfdbfe', color: '#1e40af' },
  purple: { backgroundColor: '#e9d5ff', color: '#6b21a8' },
  pink: { backgroundColor: '#fbcfe8', color: '#9d174d' },
  red: { backgroundColor: '#fecaca', color: '#991b1b' }
}

const FALLBACK: OptionChipStyle = CHIP_COLORS.gray

/**
 * Style for an option chip. Named colors map to the soft palette;
 * anything else (legacy hex) is used as the background with white text.
 */
export function optionChipStyle(color: string | undefined): OptionChipStyle {
  if (!color) return FALLBACK
  const named = CHIP_COLORS[color]
  if (named) return named
  return { backgroundColor: color, color: '#ffffff' }
}
