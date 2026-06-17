/**
 * Row-height density tiers for the database grid (Airtable parity).
 *
 * A view persists a named tier; the grid resolves it to a pixel height that
 * `GridSurface` uses for virtualization and row layout. Pure + tiny so the
 * toolbar control, the schema default, and the grid all agree on one mapping.
 */

/** Named row-height tiers, densest first. */
export type RowHeight = 'short' | 'medium' | 'tall' | 'extraTall'

/** Pixel height per tier (approximating Airtable's Short/Medium/Tall/Extra). */
export const ROW_HEIGHT_PX: Record<RowHeight, number> = {
  short: 32,
  medium: 48,
  tall: 80,
  extraTall: 128
}

/** Tier order for cycling / menu rendering. */
export const ROW_HEIGHTS: RowHeight[] = ['short', 'medium', 'tall', 'extraTall']

const ROW_HEIGHT_LABELS: Record<RowHeight, string> = {
  short: 'Short',
  medium: 'Medium',
  tall: 'Tall',
  extraTall: 'Extra tall'
}

/** Human label for a tier. */
export function rowHeightLabel(height: RowHeight): string {
  return ROW_HEIGHT_LABELS[height]
}

/** The default tier (densest, matching the prior fixed look). */
export const DEFAULT_ROW_HEIGHT: RowHeight = 'short'

/**
 * Resolve a persisted value (possibly undefined or an unknown string) to a
 * pixel height, falling back to the default tier.
 */
export function resolveRowHeightPx(height: string | null | undefined): number {
  if (height && height in ROW_HEIGHT_PX) return ROW_HEIGHT_PX[height as RowHeight]
  return ROW_HEIGHT_PX[DEFAULT_ROW_HEIGHT]
}

/** Narrow an arbitrary string to a `RowHeight`, or the default. */
export function asRowHeight(height: string | null | undefined): RowHeight {
  return height && height in ROW_HEIGHT_PX ? (height as RowHeight) : DEFAULT_ROW_HEIGHT
}
