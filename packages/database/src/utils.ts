/**
 * Generate a unique ID with optional prefix
 */
export function generateId(prefix?: string): string {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36)
  return prefix ? `${prefix}:${id}` : id
}

/**
 * Generate a database ID
 */
export function generateDatabaseId(): `db:${string}` {
  return `db:${generateId()}`
}

/**
 * Generate a property ID
 */
export function generatePropertyId(): `prop:${string}` {
  return `prop:${generateId()}`
}

/**
 * Generate a view ID
 */
export function generateViewId(): `view:${string}` {
  return `view:${generateId()}`
}

/**
 * Generate an item ID
 */
export function generateItemId(): `item:${string}` {
  return `item:${generateId()}`
}

/**
 * Generate a select option ID
 */
export function generateOptionId(): string {
  return generateId('opt')
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array)
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string' && value.trim() === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  return false
}
