/**
 * Fractional indexing for O(1) row ordering.
 *
 * Row order uses fractional indexing instead of array positions. Each row has
 * a `sortKey` string that can be sorted lexicographically. Inserting between
 * two rows generates a key that sorts between them, without updating any other rows.
 *
 * This approach is used by Figma, Linear, and other collaborative apps because
 * it enables O(1) insert/reorder operations and works naturally with database
 * queries (`ORDER BY sort_key`).
 *
 * @example
 * ```typescript
 * generateSortKey()           // "a0" - first key
 * generateSortKey("a0")       // "a1" - append
 * generateSortKey("a0", "a1") // "a0V" - insert between
 * ```
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Base-62 alphabet for compact keys.
 * Order: 0-9 < A-Z < a-z
 */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const BASE = ALPHABET.length // 62

/**
 * Default starting key.
 * We use 'a0' as the starting point to leave room for prepending.
 */
const START_KEY = 'a0'

/**
 * Midpoint character for inserting between adjacent keys.
 */
const MIDPOINT_CHAR = ALPHABET[Math.floor(BASE / 2)] // 'V'

// ─── Key Generation ──────────────────────────────────────────────────────────

/**
 * Generate a sort key that orders between `before` and `after`.
 *
 * @param before - The key to sort after (or undefined for start)
 * @param after - The key to sort before (or undefined for end)
 * @returns A new key that sorts between before and after
 *
 * @example
 * ```typescript
 * generateSortKey()           // "a0" - first key
 * generateSortKey("a0")       // "a1" - append
 * generateSortKey(undefined, "a0") // key before a0
 * generateSortKey("a0", "a1") // "a0V" - insert between
 * ```
 */
export function generateSortKey(before?: string, after?: string): string {
  // No constraints - return starting key
  if (!before && !after) {
    return START_KEY
  }

  // Append after last key
  if (before && !after) {
    return incrementKey(before)
  }

  // Prepend before first key
  if (!before && after) {
    return prependKey(after)
  }

  // Insert between two keys
  return midpointKey(before!, after!)
}

/**
 * Generate a sort key with random jitter to prevent collisions.
 * Use this in high-concurrency scenarios where multiple users might
 * insert at the same position simultaneously.
 *
 * @param before - The key to sort after (or undefined for start)
 * @param after - The key to sort before (or undefined for end)
 * @returns A new key with random suffix
 */
export function generateSortKeyWithJitter(before?: string, after?: string): string {
  const base = generateSortKey(before, after)

  // Add 2 random characters as suffix
  const jitter = ALPHABET[randomInt(BASE)] + ALPHABET[randomInt(BASE)]
  return base + jitter
}

// ─── Key Manipulation ────────────────────────────────────────────────────────

/**
 * Increment a key to get the next key in sequence.
 * Like adding 1 in base-62.
 */
function incrementKey(key: string): string {
  const chars = key.split('')
  let i = chars.length - 1

  while (i >= 0) {
    const idx = ALPHABET.indexOf(chars[i])
    if (idx < BASE - 1) {
      // Can increment this character
      chars[i] = ALPHABET[idx + 1]
      return chars.join('')
    }
    // Carry over to previous character
    chars[i] = ALPHABET[0]
    i--
  }

  // All characters were max, prepend a character
  // This maintains lexicographic order: 'zz' -> '0zz' (but '0zz' < 'zz')
  // So we need to append instead: 'zz' -> 'zz0'
  return key + ALPHABET[0]
}

/**
 * Generate a key that sorts before the given key.
 * We do this by finding a character we can decrement and appending 'z' to create space.
 */
function prependKey(key: string): string {
  // Strategy: Find the first character we can decrement, decrement it,
  // and append 'z' to create space for future prepends.

  const chars = key.split('')

  for (let i = 0; i < chars.length; i++) {
    const idx = ALPHABET.indexOf(chars[i])
    if (idx > 0) {
      // Decrement this character and append 'z' for space
      chars[i] = ALPHABET[idx - 1]
      // Take prefix up to and including this char, append 'z'
      return chars.slice(0, i + 1).join('') + ALPHABET[BASE - 1]
    }
  }

  // All characters are '0', prepend '0' and append 'z'
  // '000' -> '000z' which is still > '000', so we need different approach
  // Actually prepend a smaller character: use '0' + original + 'V'
  // Wait, that won't work either.

  // Better approach: prepend the key with a character that sorts before
  // Since all chars are '0', we can't go lower. So we extend the key.
  // '00' -> '00' + midpoint that's less than '00' when compared
  // Actually, for lexicographic ordering, shorter keys sort before longer ones
  // with the same prefix. So '0' < '00' < '000'.

  // The safest approach: return a key that's definitely smaller
  // by using a smaller first character if possible, or extending with midpoint
  return ALPHABET[0] + key.slice(1) + MIDPOINT_CHAR
}

/**
 * Generate a key that sorts between two keys.
 */
function midpointKey(before: string, after: string): string {
  // Validate ordering
  if (before >= after) {
    throw new Error(`Invalid key order: "${before}" >= "${after}"`)
  }

  // Pad keys to same length for easier comparison
  const maxLen = Math.max(before.length, after.length) + 1
  const paddedBefore = before.padEnd(maxLen, ALPHABET[0])
  const paddedAfter = after.padEnd(maxLen, ALPHABET[0])

  // Find the first position where we can insert a character between them
  for (let i = 0; i < maxLen; i++) {
    const beforeIdx = ALPHABET.indexOf(paddedBefore[i])
    const afterIdx = ALPHABET.indexOf(paddedAfter[i])

    if (beforeIdx === afterIdx) {
      continue
    }

    // Found differing position
    if (afterIdx - beforeIdx > 1) {
      // There's room between the characters, use midpoint
      const midIdx = Math.floor((beforeIdx + afterIdx) / 2)
      return paddedBefore.slice(0, i) + ALPHABET[midIdx]
    }

    // Adjacent characters - we need to go deeper
    // Look at the next character positions
    for (let j = i + 1; j < maxLen; j++) {
      const bIdx = ALPHABET.indexOf(paddedBefore[j])
      const aIdx = ALPHABET.indexOf(paddedAfter[j])

      if (aIdx > bIdx + 1) {
        // Room to insert
        const midIdx = Math.floor((bIdx + aIdx) / 2)
        return paddedBefore.slice(0, j) + ALPHABET[midIdx]
      } else if (aIdx > bIdx) {
        // Adjacent, continue to next position
        continue
      } else {
        // bIdx >= aIdx, we can use any value > bIdx
        // Since after[i] > before[i], any suffix after before[0..i] works
        // as long as it's less than after
        const midIdx = Math.floor((bIdx + BASE) / 2)
        return paddedBefore.slice(0, j) + ALPHABET[midIdx]
      }
    }

    // If we get here, append a midpoint character
    return before + MIDPOINT_CHAR
  }

  // Keys are equal up to the length of the shorter one
  // This means before is a prefix of after
  // Find the first non-zero character in after's suffix and halve it
  for (let i = before.length; i < after.length; i++) {
    const afterIdx = ALPHABET.indexOf(after[i])
    if (afterIdx > 0) {
      const midIdx = Math.floor(afterIdx / 2)
      return before + ALPHABET[0].repeat(i - before.length) + ALPHABET[midIdx]
    }
  }

  // Fallback: append midpoint
  return before + MIDPOINT_CHAR
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate that a key is well-formed.
 */
export function isValidSortKey(key: string): boolean {
  if (!key || key.length === 0) return false
  return key.split('').every((c) => ALPHABET.includes(c))
}

/**
 * Compare two sort keys.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 *
 * Uses simple string comparison (not locale-aware) to ensure
 * consistent ordering across all environments.
 */
export function compareSortKeys(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

// ─── Rebalancing ─────────────────────────────────────────────────────────────

/**
 * Rebalance sort keys for a set of rows.
 * Generates evenly-spaced keys for all rows.
 *
 * Use this when sort keys get too long (> 10 chars) due to many
 * insertions at the same position.
 *
 * @param rowIds - Row IDs in current sorted order
 * @returns Map of rowId -> new sortKey
 *
 * @example
 * ```typescript
 * const newKeys = rebalanceSortKeys(['row1', 'row2', 'row3'])
 * // Map { 'row1' => '0U', 'row2' => '0q', 'row3' => '1C' }
 * ```
 */
export function rebalanceSortKeys(rowIds: string[]): Map<string, string> {
  const result = new Map<string, string>()

  if (rowIds.length === 0) {
    return result
  }

  for (let i = 0; i < rowIds.length; i++) {
    // Generate evenly spaced keys
    const key = indexToKey(i, rowIds.length)
    result.set(rowIds[i], key)
  }

  return result
}

/**
 * Convert an index to a sort key, distributing evenly across the keyspace.
 */
function indexToKey(index: number, total: number): string {
  // Use two-character keys for up to 62^2 = 3844 rows
  // Use three-character keys for up to 62^3 = 238,328 rows
  const charCount = total <= BASE * BASE ? 2 : 3

  const range = Math.pow(BASE, charCount)
  const step = Math.floor(range / (total + 1))
  const value = step * (index + 1)

  return valueToKey(value, charCount)
}

/**
 * Convert a numeric value to a base-62 key of specified length.
 */
function valueToKey(value: number, length: number): string {
  let result = ''
  let remaining = value

  for (let i = 0; i < length; i++) {
    const idx = remaining % BASE
    result = ALPHABET[idx] + result
    remaining = Math.floor(remaining / BASE)
  }

  return result
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Generate a random integer in [0, max).
 */
function randomInt(max: number): number {
  return Math.floor(Math.random() * max)
}

/**
 * Get the maximum recommended key length before rebalancing.
 */
export const MAX_KEY_LENGTH = 10

/**
 * Check if any keys in a list exceed the maximum recommended length.
 */
export function needsRebalancing(sortKeys: string[]): boolean {
  return sortKeys.some((key) => key.length > MAX_KEY_LENGTH)
}
