/**
 * Formula Functions Library
 *
 * Built-in functions available in formula expressions.
 * Organized by category: math, string, date, logic, array, property
 */

import type { EvaluatorContext } from '../evaluator.js'

/**
 * Type for formula function implementations
 */
export type FormulaFunction = (args: unknown[], context: EvaluatorContext) => unknown

/**
 * Convert value to number safely
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const num = parseFloat(value)
    return isNaN(num) ? 0 : num
  }
  if (value == null) return 0
  return 0
}

/**
 * Convert value to string safely
 */
function toString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Convert value to boolean
 */
function toBoolean(value: unknown): boolean {
  return Boolean(value)
}

// ============================================================================
// Math Functions
// ============================================================================

const mathFunctions: Record<string, FormulaFunction> = {
  /**
   * Absolute value
   */
  abs: (args) => Math.abs(toNumber(args[0])),

  /**
   * Round up to nearest integer
   */
  ceil: (args) => Math.ceil(toNumber(args[0])),

  /**
   * Round down to nearest integer
   */
  floor: (args) => Math.floor(toNumber(args[0])),

  /**
   * Round to nearest integer (or to decimal places)
   */
  round: (args) => {
    const value = toNumber(args[0])
    const decimals = args.length > 1 ? toNumber(args[1]) : 0
    const factor = Math.pow(10, decimals)
    return Math.round(value * factor) / factor
  },

  /**
   * Square root
   */
  sqrt: (args) => Math.sqrt(toNumber(args[0])),

  /**
   * Cube root
   */
  cbrt: (args) => Math.cbrt(toNumber(args[0])),

  /**
   * Power (base^exponent)
   */
  pow: (args) => Math.pow(toNumber(args[0]), toNumber(args[1])),

  /**
   * Natural exponential (e^x)
   */
  exp: (args) => Math.exp(toNumber(args[0])),

  /**
   * Natural logarithm
   */
  ln: (args) => Math.log(toNumber(args[0])),

  /**
   * Base-10 logarithm
   */
  log10: (args) => Math.log10(toNumber(args[0])),

  /**
   * Base-2 logarithm
   */
  log2: (args) => Math.log2(toNumber(args[0])),

  /**
   * Minimum value
   */
  min: (args) => {
    const nums = args.flat(Infinity).map(toNumber)
    return nums.length > 0 ? Math.min(...nums) : 0
  },

  /**
   * Maximum value
   */
  max: (args) => {
    const nums = args.flat(Infinity).map(toNumber)
    return nums.length > 0 ? Math.max(...nums) : 0
  },

  /**
   * Sum of values
   */
  sum: (args) => {
    const nums = args.flat(Infinity).map(toNumber)
    return nums.reduce((a, b) => a + b, 0)
  },

  /**
   * Average of values
   */
  average: (args) => {
    const nums = args.flat(Infinity).map(toNumber)
    if (nums.length === 0) return 0
    return nums.reduce((a, b) => a + b, 0) / nums.length
  },

  /**
   * Median of values
   */
  median: (args) => {
    const nums = args
      .flat(Infinity)
      .map(toNumber)
      .sort((a, b) => a - b)
    if (nums.length === 0) return 0
    const mid = Math.floor(nums.length / 2)
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2
  },

  /**
   * Sign of a number (-1, 0, or 1)
   */
  sign: (args) => Math.sign(toNumber(args[0])),

  /**
   * Modulo (remainder)
   */
  mod: (args) => toNumber(args[0]) % toNumber(args[1]),

  /**
   * Pi constant
   */
  pi: () => Math.PI,

  /**
   * E constant
   */
  e: () => Math.E,

  /**
   * Random number between 0 and 1
   */
  random: () => Math.random()
}

// ============================================================================
// String Functions
// ============================================================================

const stringFunctions: Record<string, FormulaFunction> = {
  /**
   * Concatenate strings
   */
  concat: (args) => args.map(toString).join(''),

  /**
   * Convert to lowercase
   */
  lower: (args) => toString(args[0]).toLowerCase(),

  /**
   * Convert to uppercase
   */
  upper: (args) => toString(args[0]).toUpperCase(),

  /**
   * Capitalize first letter
   */
  capitalize: (args) => {
    const str = toString(args[0])
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
  },

  /**
   * Get string length
   */
  length: (args) => {
    const val = args[0]
    if (Array.isArray(val)) return val.length
    return toString(val).length
  },

  /**
   * Check if string contains substring
   */
  contains: (args) => toString(args[0]).includes(toString(args[1])),

  /**
   * Check if string starts with prefix
   */
  startsWith: (args) => toString(args[0]).startsWith(toString(args[1])),

  /**
   * Check if string ends with suffix
   */
  endsWith: (args) => toString(args[0]).endsWith(toString(args[1])),

  /**
   * Replace substring
   */
  replace: (args) => toString(args[0]).replace(toString(args[1]), toString(args[2])),

  /**
   * Replace all occurrences of substring
   */
  replaceAll: (args) => toString(args[0]).split(toString(args[1])).join(toString(args[2])),

  /**
   * Extract substring by index
   */
  slice: (args) => {
    const str = toString(args[0])
    const start = toNumber(args[1])
    const end = args.length > 2 ? toNumber(args[2]) : undefined
    return str.slice(start, end)
  },

  /**
   * Extract substring by index and length
   */
  substring: (args) => {
    const str = toString(args[0])
    const start = toNumber(args[1])
    const length = args.length > 2 ? toNumber(args[2]) : undefined
    return length !== undefined ? str.substring(start, start + length) : str.substring(start)
  },

  /**
   * Trim whitespace
   */
  trim: (args) => toString(args[0]).trim(),

  /**
   * Trim leading whitespace
   */
  trimStart: (args) => toString(args[0]).trimStart(),

  /**
   * Trim trailing whitespace
   */
  trimEnd: (args) => toString(args[0]).trimEnd(),

  /**
   * Pad start of string
   */
  padStart: (args) => toString(args[0]).padStart(toNumber(args[1]), toString(args[2] ?? ' ')),

  /**
   * Pad end of string
   */
  padEnd: (args) => toString(args[0]).padEnd(toNumber(args[1]), toString(args[2] ?? ' ')),

  /**
   * Repeat string n times
   */
  repeat: (args) => toString(args[0]).repeat(toNumber(args[1])),

  /**
   * Split string into array
   */
  split: (args) => toString(args[0]).split(toString(args[1])),

  /**
   * Join array into string
   */
  join: (args) => {
    const arr = Array.isArray(args[0]) ? args[0] : [args[0]]
    return arr.map(toString).join(toString(args[1] ?? ','))
  },

  /**
   * Find index of substring (-1 if not found)
   */
  indexOf: (args) => toString(args[0]).indexOf(toString(args[1])),

  /**
   * Test string against regex pattern
   */
  test: (args) => {
    try {
      const regex = new RegExp(toString(args[1]))
      return regex.test(toString(args[0]))
    } catch {
      return false
    }
  },

  /**
   * Match string against regex pattern
   */
  match: (args) => {
    try {
      const regex = new RegExp(toString(args[1]), 'g')
      return toString(args[0]).match(regex) || []
    } catch {
      return []
    }
  },

  /**
   * Format a template string with values
   */
  format: (args) => {
    let template = toString(args[0])
    for (let i = 1; i < args.length; i++) {
      template = template.replace(new RegExp(`\\{${i - 1}\\}`, 'g'), toString(args[i]))
    }
    return template
  }
}

// ============================================================================
// Date Functions
// ============================================================================

const dateFunctions: Record<string, FormulaFunction> = {
  /**
   * Current timestamp
   */
  now: () => Date.now(),

  /**
   * Start of today (midnight)
   */
  today: () => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  },

  /**
   * Create date from timestamp or components
   */
  date: (args) => {
    if (args.length === 1) {
      return new Date(toNumber(args[0])).getTime()
    }
    // year, month, day, hour?, minute?, second?
    return new Date(
      toNumber(args[0]),
      toNumber(args[1]) - 1, // Month is 0-indexed
      toNumber(args[2]) || 1,
      toNumber(args[3]) || 0,
      toNumber(args[4]) || 0,
      toNumber(args[5]) || 0
    ).getTime()
  },

  /**
   * Add time to date
   */
  dateAdd: (args) => {
    const date = new Date(toNumber(args[0]))
    const amount = toNumber(args[1])
    const unit = toString(args[2]).toLowerCase()

    switch (unit) {
      case 'milliseconds':
      case 'ms':
        date.setMilliseconds(date.getMilliseconds() + amount)
        break
      case 'seconds':
      case 's':
        date.setSeconds(date.getSeconds() + amount)
        break
      case 'minutes':
      case 'min':
        date.setMinutes(date.getMinutes() + amount)
        break
      case 'hours':
      case 'h':
        date.setHours(date.getHours() + amount)
        break
      case 'days':
      case 'd':
        date.setDate(date.getDate() + amount)
        break
      case 'weeks':
      case 'w':
        date.setDate(date.getDate() + amount * 7)
        break
      case 'months':
      case 'mo':
        date.setMonth(date.getMonth() + amount)
        break
      case 'years':
      case 'y':
        date.setFullYear(date.getFullYear() + amount)
        break
    }
    return date.getTime()
  },

  /**
   * Subtract dates and return difference
   */
  dateDiff: (args) => {
    const date1 = new Date(toNumber(args[0]))
    const date2 = new Date(toNumber(args[1]))
    const unit = toString(args[2]).toLowerCase()
    const diff = date1.getTime() - date2.getTime()

    switch (unit) {
      case 'milliseconds':
      case 'ms':
        return diff
      case 'seconds':
      case 's':
        return Math.floor(diff / 1000)
      case 'minutes':
      case 'min':
        return Math.floor(diff / 60000)
      case 'hours':
      case 'h':
        return Math.floor(diff / 3600000)
      case 'days':
      case 'd':
        return Math.floor(diff / 86400000)
      case 'weeks':
      case 'w':
        return Math.floor(diff / 604800000)
      case 'months':
      case 'mo':
        return (
          (date1.getFullYear() - date2.getFullYear()) * 12 + (date1.getMonth() - date2.getMonth())
        )
      case 'years':
      case 'y':
        return date1.getFullYear() - date2.getFullYear()
      default:
        return diff
    }
  },

  /**
   * Get year from date
   */
  year: (args) => new Date(toNumber(args[0])).getFullYear(),

  /**
   * Get month from date (1-12)
   */
  month: (args) => new Date(toNumber(args[0])).getMonth() + 1,

  /**
   * Get day of month from date (1-31)
   */
  day: (args) => new Date(toNumber(args[0])).getDate(),

  /**
   * Get day of week (0=Sunday, 6=Saturday)
   */
  weekday: (args) => new Date(toNumber(args[0])).getDay(),

  /**
   * Get hour from date (0-23)
   */
  hour: (args) => new Date(toNumber(args[0])).getHours(),

  /**
   * Get minute from date (0-59)
   */
  minute: (args) => new Date(toNumber(args[0])).getMinutes(),

  /**
   * Get second from date (0-59)
   */
  second: (args) => new Date(toNumber(args[0])).getSeconds(),

  /**
   * Start of time period
   */
  startOf: (args) => {
    const date = new Date(toNumber(args[0]))
    const unit = toString(args[1]).toLowerCase()

    switch (unit) {
      case 'day':
        date.setHours(0, 0, 0, 0)
        break
      case 'week':
        date.setDate(date.getDate() - date.getDay())
        date.setHours(0, 0, 0, 0)
        break
      case 'month':
        date.setDate(1)
        date.setHours(0, 0, 0, 0)
        break
      case 'year':
        date.setMonth(0, 1)
        date.setHours(0, 0, 0, 0)
        break
    }
    return date.getTime()
  },

  /**
   * End of time period
   */
  endOf: (args) => {
    const date = new Date(toNumber(args[0]))
    const unit = toString(args[1]).toLowerCase()

    switch (unit) {
      case 'day':
        date.setHours(23, 59, 59, 999)
        break
      case 'week':
        date.setDate(date.getDate() + (6 - date.getDay()))
        date.setHours(23, 59, 59, 999)
        break
      case 'month':
        date.setMonth(date.getMonth() + 1, 0)
        date.setHours(23, 59, 59, 999)
        break
      case 'year':
        date.setMonth(11, 31)
        date.setHours(23, 59, 59, 999)
        break
    }
    return date.getTime()
  },

  /**
   * Format date as string
   */
  formatDate: (args) => {
    const date = new Date(toNumber(args[0]))
    const format = toString(args[1] ?? 'short')

    switch (format) {
      case 'short':
        return date.toLocaleDateString()
      case 'long':
        return date.toLocaleDateString(undefined, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      case 'iso':
        return date.toISOString()
      case 'time':
        return date.toLocaleTimeString()
      case 'datetime':
        return date.toLocaleString()
      default:
        return date.toLocaleDateString()
    }
  },

  /**
   * Parse date string to timestamp
   */
  parseDate: (args) => {
    const date = new Date(toString(args[0]))
    return isNaN(date.getTime()) ? null : date.getTime()
  }
}

// ============================================================================
// Logic Functions
// ============================================================================

const logicFunctions: Record<string, FormulaFunction> = {
  /**
   * Conditional: if(condition, trueValue, falseValue)
   */
  if: (args) => (toBoolean(args[0]) ? args[1] : args[2]),

  /**
   * Switch: switch(value, case1, result1, case2, result2, ..., default)
   */
  switch: (args) => {
    const value = args[0]
    for (let i = 1; i < args.length - 1; i += 2) {
      if (args[i] === value) {
        return args[i + 1]
      }
    }
    // Return last arg as default if odd number of args after value
    return args.length % 2 === 0 ? args[args.length - 1] : undefined
  },

  /**
   * Logical AND
   */
  and: (args) => args.every(toBoolean),

  /**
   * Logical OR
   */
  or: (args) => args.some(toBoolean),

  /**
   * Logical NOT
   */
  not: (args) => !toBoolean(args[0]),

  /**
   * Check if value is empty
   */
  empty: (args) => {
    const val = args[0]
    if (val == null) return true
    if (val === '') return true
    if (Array.isArray(val) && val.length === 0) return true
    if (typeof val === 'object' && Object.keys(val).length === 0) return true
    return false
  },

  /**
   * Return first non-empty value
   */
  coalesce: (args) => {
    for (const arg of args) {
      if (arg != null && arg !== '') return arg
    }
    return null
  },

  /**
   * Check if value equals any of the arguments
   */
  in: (args) => {
    const value = args[0]
    for (let i = 1; i < args.length; i++) {
      if (args[i] === value) return true
      if (Array.isArray(args[i]) && (args[i] as unknown[]).includes(value)) return true
    }
    return false
  },

  /**
   * Check if value is a number
   */
  isNumber: (args) => typeof args[0] === 'number' && !isNaN(args[0]),

  /**
   * Check if value is a string
   */
  isString: (args) => typeof args[0] === 'string',

  /**
   * Check if value is a boolean
   */
  isBoolean: (args) => typeof args[0] === 'boolean',

  /**
   * Check if value is an array
   */
  isArray: (args) => Array.isArray(args[0]),

  /**
   * Check if value is null or undefined
   */
  isNull: (args) => args[0] == null
}

// ============================================================================
// Array Functions
// ============================================================================

const arrayFunctions: Record<string, FormulaFunction> = {
  /**
   * Get first element
   */
  first: (args) => {
    const arr = Array.isArray(args[0]) ? args[0] : []
    return arr[0]
  },

  /**
   * Get last element
   */
  last: (args) => {
    const arr = Array.isArray(args[0]) ? args[0] : []
    return arr[arr.length - 1]
  },

  /**
   * Get element at index
   */
  at: (args) => {
    const arr = Array.isArray(args[0]) ? args[0] : []
    const index = toNumber(args[1])
    return arr.at(index)
  },

  /**
   * Reverse array
   */
  reverse: (args) => {
    const arr = Array.isArray(args[0]) ? [...args[0]] : []
    return arr.reverse()
  },

  /**
   * Sort array
   */
  sort: (args) => {
    const arr = Array.isArray(args[0]) ? [...args[0]] : []
    return arr.sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b
      return toString(a).localeCompare(toString(b))
    })
  },

  /**
   * Get unique values
   */
  unique: (args) => {
    const arr = Array.isArray(args[0]) ? args[0] : []
    return [...new Set(arr)]
  },

  /**
   * Flatten nested arrays
   */
  flat: (args) => {
    const arr = Array.isArray(args[0]) ? args[0] : []
    const depth = args.length > 1 ? toNumber(args[1]) : 1
    return arr.flat(depth)
  },

  /**
   * Filter array (returns truthy elements if no condition)
   */
  filter: (args) => {
    const arr = Array.isArray(args[0]) ? args[0] : []
    if (args.length === 1) {
      return arr.filter(Boolean)
    }
    // Simple filtering by value
    return arr.filter((item) => item === args[1])
  },

  /**
   * Count elements
   */
  count: (args) => {
    const arr = Array.isArray(args[0]) ? args[0] : []
    return arr.length
  },

  /**
   * Count non-empty elements
   */
  countAll: (args) => {
    const arr = Array.isArray(args[0]) ? args[0] : []
    return arr.filter((x) => x != null && x !== '').length
  },

  /**
   * Check if all elements are truthy
   */
  every: (args) => {
    const arr = Array.isArray(args[0]) ? args[0] : []
    return arr.every(Boolean)
  },

  /**
   * Check if any element is truthy
   */
  some: (args) => {
    const arr = Array.isArray(args[0]) ? args[0] : []
    return arr.some(Boolean)
  },

  /**
   * Check if array includes value
   */
  includes: (args) => {
    const arr = Array.isArray(args[0]) ? args[0] : []
    return arr.includes(args[1])
  },

  /**
   * Create array from range
   */
  range: (args) => {
    const start = toNumber(args[0])
    const end = toNumber(args[1])
    const step = args.length > 2 ? toNumber(args[2]) : 1
    const result: number[] = []
    for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
      result.push(i)
    }
    return result
  }
}

// ============================================================================
// Property Functions
// ============================================================================

const propertyFunctions: Record<string, FormulaFunction> = {
  /**
   * Get property value by name
   */
  prop: (args, context) => {
    const propName = toString(args[0])
    return context.props[propName]
  },

  /**
   * Get related items (for rollups)
   */
  relation: (args, context) => {
    if (!context.getRelation) return []
    const propName = toString(args[0])
    return context.getRelation(propName)
  }
}

// ============================================================================
// Type Conversion Functions
// ============================================================================

const conversionFunctions: Record<string, FormulaFunction> = {
  /**
   * Convert to number
   */
  toNumber: (args: unknown[]) => toNumber(args[0]),

  /**
   * Convert to string
   */
  toString: (args: unknown[]) => toString(args[0]),

  /**
   * Convert to boolean
   */
  toBoolean: (args: unknown[]) => toBoolean(args[0]),

  /**
   * Parse JSON string
   */
  parseJSON: (args) => {
    try {
      return JSON.parse(toString(args[0]))
    } catch {
      return null
    }
  },

  /**
   * Stringify to JSON
   */
  toJSON: (args) => JSON.stringify(args[0])
}

// ============================================================================
// Export all functions
// ============================================================================

export const functions: Record<string, FormulaFunction> = {
  ...mathFunctions,
  ...stringFunctions,
  ...dateFunctions,
  ...logicFunctions,
  ...arrayFunctions,
  ...propertyFunctions,
  ...conversionFunctions
}

/**
 * Get list of available function names
 */
export function getFunctionNames(): string[] {
  return Object.keys(functions).sort()
}

/**
 * Check if a function exists
 */
export function hasFunction(name: string): boolean {
  return name in functions
}
