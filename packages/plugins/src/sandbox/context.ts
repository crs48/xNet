/**
 * ScriptContext - Safe API surface for user scripts
 *
 * Provides a frozen, read-only context with utility functions.
 * Scripts cannot modify nodes directly - they return values/mutations
 * that the runtime applies.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A flat node representation (simplified for script access)
 */
export interface FlatNode {
  id: string
  schemaIRI: string
  [key: string]: unknown
}

/**
 * Format helper functions (no side effects)
 */
export interface FormatHelpers {
  /** Format a timestamp as a date string */
  date: (timestamp: number, options?: Intl.DateTimeFormatOptions) => string
  /** Format a number with options */
  number: (value: number, options?: Intl.NumberFormatOptions) => string
  /** Format a number as currency */
  currency: (value: number, currency?: string, locale?: string) => string
  /** Format a timestamp as relative time (e.g., "5m ago") */
  relative: (timestamp: number) => string
  /** Format bytes as human-readable size */
  bytes: (bytes: number) => string
}

/**
 * Math helper functions (pure functions)
 */
export interface MathHelpers {
  /** Sum an array of numbers */
  sum: (values: number[]) => number
  /** Average of an array of numbers */
  avg: (values: number[]) => number
  /** Minimum value */
  min: (values: number[]) => number
  /** Maximum value */
  max: (values: number[]) => number
  /** Round to decimal places */
  round: (value: number, decimals?: number) => number
  /** Clamp value between min and max */
  clamp: (value: number, min: number, max: number) => number
  /** Absolute value */
  abs: (value: number) => number
  /** Floor */
  floor: (value: number) => number
  /** Ceiling */
  ceil: (value: number) => number
}

/**
 * Text helper functions (pure functions)
 */
export interface TextHelpers {
  /** Convert to URL-safe slug */
  slugify: (text: string) => string
  /** Truncate with ellipsis */
  truncate: (text: string, maxLength: number) => string
  /** Capitalize first letter */
  capitalize: (text: string) => string
  /** Title case */
  titleCase: (text: string) => string
  /** Check if text contains search (case-insensitive) */
  contains: (text: string, search: string) => boolean
  /** Simple template substitution: {key} replaced by vars[key] */
  template: (template: string, vars: Record<string, unknown>) => string
  /** Trim whitespace */
  trim: (text: string) => string
  /** Convert to lowercase */
  lower: (text: string) => string
  /** Convert to uppercase */
  upper: (text: string) => string
}

/**
 * Array helper functions (pure functions)
 */
export interface ArrayHelpers {
  /** Get first element */
  first: <T>(items: T[]) => T | undefined
  /** Get last element */
  last: <T>(items: T[]) => T | undefined
  /** Sort by property */
  sortBy: <T>(items: T[], key: keyof T, desc?: boolean) => T[]
  /** Group by property */
  groupBy: <T>(items: T[], key: keyof T) => Record<string, T[]>
  /** Unique values */
  unique: <T>(items: T[]) => T[]
  /** Count items */
  count: <T>(items: T[]) => number
  /** Filter truthy */
  compact: <T>(items: (T | null | undefined)[]) => T[]
}

/**
 * The context object passed to scripts.
 * All properties and nested objects are frozen (immutable).
 */
export interface ScriptContext {
  /** The current node being processed (read-only, frozen) */
  node: Readonly<FlatNode>

  /**
   * Query sibling nodes by schema.
   * Returns a frozen array of frozen nodes.
   */
  nodes: (schemaIRI?: string) => ReadonlyArray<Readonly<FlatNode>>

  /** Current timestamp in milliseconds */
  now: () => number

  /** Format helpers */
  format: Readonly<FormatHelpers>

  /** Math helpers */
  math: Readonly<MathHelpers>

  /** Text helpers */
  text: Readonly<TextHelpers>

  /** Array helpers */
  array: Readonly<ArrayHelpers>
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Create format helpers (all frozen)
 */
function createFormatHelpers(): FormatHelpers {
  return {
    date: (ts, options) => {
      try {
        return new Intl.DateTimeFormat('en-US', options).format(new Date(ts))
      } catch {
        return String(ts)
      }
    },

    number: (val, options) => {
      try {
        return new Intl.NumberFormat('en-US', options).format(val)
      } catch {
        return String(val)
      }
    },

    currency: (val, currency = 'USD', locale = 'en-US') => {
      try {
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency
        }).format(val)
      } catch {
        return `${currency} ${val}`
      }
    },

    relative: (ts) => {
      const diff = Date.now() - ts
      const absDiff = Math.abs(diff)
      const suffix = diff >= 0 ? 'ago' : 'from now'

      const seconds = Math.floor(absDiff / 1000)
      if (seconds < 60) return `${seconds}s ${suffix}`

      const minutes = Math.floor(seconds / 60)
      if (minutes < 60) return `${minutes}m ${suffix}`

      const hours = Math.floor(minutes / 60)
      if (hours < 24) return `${hours}h ${suffix}`

      const days = Math.floor(hours / 24)
      if (days < 30) return `${days}d ${suffix}`

      const months = Math.floor(days / 30)
      if (months < 12) return `${months}mo ${suffix}`

      const years = Math.floor(months / 12)
      return `${years}y ${suffix}`
    },

    bytes: (bytes) => {
      const units = ['B', 'KB', 'MB', 'GB', 'TB']
      let size = Math.abs(bytes)
      let unitIndex = 0
      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024
        unitIndex++
      }
      return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
    }
  }
}

/**
 * Create math helpers (all frozen)
 */
function createMathHelpers(): MathHelpers {
  return {
    sum: (vals) => {
      if (!Array.isArray(vals) || vals.length === 0) return 0
      return vals.reduce((a, b) => a + (Number(b) || 0), 0)
    },

    avg: (vals) => {
      if (!Array.isArray(vals) || vals.length === 0) return 0
      const sum = vals.reduce((a, b) => a + (Number(b) || 0), 0)
      return sum / vals.length
    },

    min: (vals) => {
      if (!Array.isArray(vals) || vals.length === 0) return 0
      const numbers = vals.map((v) => Number(v) || 0)
      return Math.min(...numbers)
    },

    max: (vals) => {
      if (!Array.isArray(vals) || vals.length === 0) return 0
      const numbers = vals.map((v) => Number(v) || 0)
      return Math.max(...numbers)
    },

    round: (val, decimals = 0) => {
      const factor = Math.pow(10, decimals)
      return Math.round(val * factor) / factor
    },

    clamp: (val, min, max) => Math.min(Math.max(val, min), max),

    abs: (val) => Math.abs(val),

    floor: (val) => Math.floor(val),

    ceil: (val) => Math.ceil(val)
  }
}

/**
 * Create text helpers (all frozen)
 */
function createTextHelpers(): TextHelpers {
  return {
    slugify: (t) =>
      String(t || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, ''),

    truncate: (t, len) => {
      const str = String(t || '')
      return str.length > len ? str.slice(0, len) + '...' : str
    },

    capitalize: (t) => {
      const str = String(t || '')
      return str.charAt(0).toUpperCase() + str.slice(1)
    },

    titleCase: (t) =>
      String(t || '')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase()),

    contains: (t, s) =>
      String(t || '')
        .toLowerCase()
        .includes(String(s || '').toLowerCase()),

    template: (tmpl, vars) =>
      String(tmpl || '').replace(/\{(\w+)\}/g, (_, key) => {
        const val = vars[key]
        return val !== undefined && val !== null ? String(val) : ''
      }),

    trim: (t) => String(t || '').trim(),

    lower: (t) => String(t || '').toLowerCase(),

    upper: (t) => String(t || '').toUpperCase()
  }
}

/**
 * Create array helpers (all frozen)
 */
function createArrayHelpers(): ArrayHelpers {
  return {
    first: (items) => (Array.isArray(items) ? items[0] : undefined),

    last: (items) => (Array.isArray(items) ? items[items.length - 1] : undefined),

    sortBy: (items, key, desc = false) => {
      if (!Array.isArray(items)) return []
      return [...items].sort((a, b) => {
        const aVal = a[key]
        const bVal = b[key]
        if (aVal < bVal) return desc ? 1 : -1
        if (aVal > bVal) return desc ? -1 : 1
        return 0
      })
    },

    groupBy: (items, key) => {
      if (!Array.isArray(items)) return {}
      const groups: Record<string, typeof items> = {}
      for (const item of items) {
        const groupKey = String(item[key] ?? 'undefined')
        if (!groups[groupKey]) groups[groupKey] = []
        groups[groupKey].push(item)
      }
      return groups
    },

    unique: (items) => {
      if (!Array.isArray(items)) return []
      return [...new Set(items)]
    },

    count: (items) => (Array.isArray(items) ? items.length : 0),

    compact: (items) => {
      if (!Array.isArray(items)) return []
      return items.filter((item): item is NonNullable<typeof item> => item != null)
    }
  }
}

/**
 * Deep freeze an object and all nested objects/arrays
 */
function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') return obj

  // Freeze arrays
  if (Array.isArray(obj)) {
    for (const item of obj) {
      deepFreeze(item)
    }
    return Object.freeze(obj) as Readonly<T>
  }

  // Freeze objects
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key]
    if (value !== null && typeof value === 'object') {
      deepFreeze(value)
    }
  }

  return Object.freeze(obj) as Readonly<T>
}

/**
 * Create a frozen ScriptContext for sandbox execution.
 *
 * @param node - The current node being processed
 * @param queryFn - Function to query other nodes by schema
 * @returns A frozen ScriptContext
 *
 * @example
 * ```typescript
 * const context = createScriptContext(
 *   targetNode,
 *   (schema) => store.list({ schemaIRI: schema })
 * )
 *
 * const result = await sandbox.execute(code, context)
 * ```
 */
export function createScriptContext(
  node: FlatNode,
  queryFn: (schemaIRI?: string) => FlatNode[]
): ScriptContext {
  // Create frozen copy of node
  const frozenNode = deepFreeze({ ...node })

  // Create helper objects (will be frozen)
  const format = Object.freeze(createFormatHelpers())
  const math = Object.freeze(createMathHelpers())
  const text = Object.freeze(createTextHelpers())
  const array = Object.freeze(createArrayHelpers())

  // Create and freeze the context
  const context: ScriptContext = {
    node: frozenNode,

    nodes: (schemaIRI?: string) => {
      const results = queryFn(schemaIRI)
      // Return frozen array of frozen nodes
      return Object.freeze(results.map((n) => deepFreeze({ ...n })))
    },

    now: () => Date.now(),

    format,
    math,
    text,
    array
  }

  return Object.freeze(context)
}
