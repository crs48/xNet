/**
 * @xnetjs/hub - Shared validation utilities.
 */

/** Type guard for plain objects. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

/** Parse an array of strings, returning null if any element is not a string. */
export const toStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null
  const filtered = value.filter((item): item is string => typeof item === 'string')
  return filtered.length === value.length ? filtered : null
}
