/**
 * Built-in formula functions.
 *
 * Provides a library of functions for use in formula expressions:
 * - Math: ABS, ROUND, FLOOR, CEIL, MIN, MAX, SUM, AVG, POW, SQRT
 * - Text: CONCAT, UPPER, LOWER, TRIM, LENGTH, SUBSTRING, REPLACE, LEFT, RIGHT
 * - Logic: IF, AND, OR, NOT, COALESCE, ISBLANK
 * - Date: NOW, TODAY, DATE, YEAR, MONTH, DAY, DATEADD, DATEDIFF
 * - Array: CONTAINS, COUNT, FIRST, LAST, JOIN, UNIQUE
 */

// ─── Function Type ───────────────────────────────────────────────────────────

export type FormulaFunction = (...args: unknown[]) => unknown

// ─── Math Functions ──────────────────────────────────────────────────────────

const mathFunctions: Record<string, FormulaFunction> = {
  ABS: (n: unknown) => Math.abs(Number(n)),

  ROUND: (n: unknown, decimals: unknown = 0) => {
    const num = Number(n)
    const d = Number(decimals)
    const factor = Math.pow(10, d)
    return Math.round(num * factor) / factor
  },

  FLOOR: (n: unknown) => Math.floor(Number(n)),

  CEIL: (n: unknown) => Math.ceil(Number(n)),

  MIN: (...args: unknown[]) => {
    const nums = args
      .flat()
      .map(Number)
      .filter((n) => !isNaN(n))
    return nums.length > 0 ? Math.min(...nums) : null
  },

  MAX: (...args: unknown[]) => {
    const nums = args
      .flat()
      .map(Number)
      .filter((n) => !isNaN(n))
    return nums.length > 0 ? Math.max(...nums) : null
  },

  SUM: (...args: unknown[]) => {
    return args.flat().reduce((sum: number, v) => sum + (Number(v) || 0), 0)
  },

  AVG: (...args: unknown[]) => {
    const nums = args
      .flat()
      .map(Number)
      .filter((n) => !isNaN(n))
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null
  },

  POW: (base: unknown, exp: unknown) => Math.pow(Number(base), Number(exp)),

  SQRT: (n: unknown) => Math.sqrt(Number(n)),

  MOD: (n: unknown, divisor: unknown) => Number(n) % Number(divisor)
}

// ─── Text Functions ──────────────────────────────────────────────────────────

const textFunctions: Record<string, FormulaFunction> = {
  CONCAT: (...args: unknown[]) => args.map(String).join(''),

  UPPER: (s: unknown) => String(s ?? '').toUpperCase(),

  LOWER: (s: unknown) => String(s ?? '').toLowerCase(),

  TRIM: (s: unknown) => String(s ?? '').trim(),

  LENGTH: (s: unknown) => String(s ?? '').length,

  SUBSTRING: (s: unknown, start: unknown, len?: unknown) => {
    const str = String(s ?? '')
    const startIdx = Number(start)
    if (len !== undefined) {
      return str.substring(startIdx, startIdx + Number(len))
    }
    return str.substring(startIdx)
  },

  REPLACE: (s: unknown, find: unknown, repl: unknown) => {
    return String(s ?? '').replace(new RegExp(String(find), 'g'), String(repl))
  },

  SPLIT: (s: unknown, delim: unknown) => String(s ?? '').split(String(delim)),

  LEFT: (s: unknown, n: unknown) => String(s ?? '').slice(0, Number(n)),

  RIGHT: (s: unknown, n: unknown) => String(s ?? '').slice(-Number(n)),

  PADLEFT: (s: unknown, len: unknown, char: unknown = ' ') => {
    return String(s ?? '').padStart(Number(len), String(char))
  },

  PADRIGHT: (s: unknown, len: unknown, char: unknown = ' ') => {
    return String(s ?? '').padEnd(Number(len), String(char))
  },

  REPEAT: (s: unknown, count: unknown) => String(s ?? '').repeat(Number(count)),

  STARTSWITH: (s: unknown, prefix: unknown) => String(s ?? '').startsWith(String(prefix)),

  ENDSWITH: (s: unknown, suffix: unknown) => String(s ?? '').endsWith(String(suffix)),

  INCLUDES: (s: unknown, search: unknown) => String(s ?? '').includes(String(search))
}

// ─── Logic Functions ─────────────────────────────────────────────────────────

const logicFunctions: Record<string, FormulaFunction> = {
  IF: (cond: unknown, then: unknown, else_: unknown) => (cond ? then : else_),

  AND: (...args: unknown[]) => args.every(Boolean),

  OR: (...args: unknown[]) => args.some(Boolean),

  NOT: (a: unknown) => !a,

  COALESCE: (...args: unknown[]) => args.find((a) => a != null) ?? null,

  ISBLANK: (v: unknown) => v === null || v === undefined || v === '',

  ISNOTEMPTY: (v: unknown) => v !== null && v !== undefined && v !== '',

  ISNUMBER: (v: unknown) => typeof v === 'number' && !isNaN(v),

  ISTEXT: (v: unknown) => typeof v === 'string',

  ISERROR: (v: unknown) => v instanceof Error,

  SWITCH: (value: unknown, ...cases: unknown[]) => {
    // SWITCH(value, case1, result1, case2, result2, ..., default)
    for (let i = 0; i < cases.length - 1; i += 2) {
      if (value === cases[i]) {
        return cases[i + 1]
      }
    }
    // Return default if odd number of cases
    return cases.length % 2 === 1 ? cases[cases.length - 1] : null
  }
}

// ─── Date Functions ──────────────────────────────────────────────────────────

const dateFunctions: Record<string, FormulaFunction> = {
  NOW: () => new Date().toISOString(),

  TODAY: () => new Date().toISOString().split('T')[0],

  DATE: (y: unknown, m: unknown, d: unknown) => {
    return new Date(Number(y), Number(m) - 1, Number(d)).toISOString()
  },

  YEAR: (d: unknown) => new Date(String(d)).getFullYear(),

  MONTH: (d: unknown) => new Date(String(d)).getMonth() + 1,

  DAY: (d: unknown) => new Date(String(d)).getDate(),

  WEEKDAY: (d: unknown) => new Date(String(d)).getDay(),

  HOUR: (d: unknown) => new Date(String(d)).getHours(),

  MINUTE: (d: unknown) => new Date(String(d)).getMinutes(),

  SECOND: (d: unknown) => new Date(String(d)).getSeconds(),

  DATEADD: (d: unknown, n: unknown, unit: unknown) => {
    const date = new Date(String(d))
    const amount = Number(n)
    const unitStr = String(unit).toLowerCase()

    switch (unitStr) {
      case 'day':
      case 'days':
        date.setDate(date.getDate() + amount)
        break
      case 'week':
      case 'weeks':
        date.setDate(date.getDate() + amount * 7)
        break
      case 'month':
      case 'months':
        date.setMonth(date.getMonth() + amount)
        break
      case 'year':
      case 'years':
        date.setFullYear(date.getFullYear() + amount)
        break
      case 'hour':
      case 'hours':
        date.setHours(date.getHours() + amount)
        break
      case 'minute':
      case 'minutes':
        date.setMinutes(date.getMinutes() + amount)
        break
      case 'second':
      case 'seconds':
        date.setSeconds(date.getSeconds() + amount)
        break
    }
    return date.toISOString()
  },

  DATEDIFF: (d1: unknown, d2: unknown, unit: unknown) => {
    const date1 = new Date(String(d1))
    const date2 = new Date(String(d2))
    const diffMs = date2.getTime() - date1.getTime()
    const unitStr = String(unit).toLowerCase()

    switch (unitStr) {
      case 'day':
      case 'days':
        return Math.floor(diffMs / (1000 * 60 * 60 * 24))
      case 'week':
      case 'weeks':
        return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7))
      case 'month':
      case 'months':
        return (
          (date2.getFullYear() - date1.getFullYear()) * 12 + (date2.getMonth() - date1.getMonth())
        )
      case 'year':
      case 'years':
        return date2.getFullYear() - date1.getFullYear()
      case 'hour':
      case 'hours':
        return Math.floor(diffMs / (1000 * 60 * 60))
      case 'minute':
      case 'minutes':
        return Math.floor(diffMs / (1000 * 60))
      case 'second':
      case 'seconds':
        return Math.floor(diffMs / 1000)
      default:
        return diffMs
    }
  },

  FORMATDATE: (d: unknown, format: unknown) => {
    const date = new Date(String(d))
    const formatStr = String(format)

    // Simple format replacement
    return formatStr
      .replace('YYYY', String(date.getFullYear()))
      .replace('MM', String(date.getMonth() + 1).padStart(2, '0'))
      .replace('DD', String(date.getDate()).padStart(2, '0'))
      .replace('HH', String(date.getHours()).padStart(2, '0'))
      .replace('mm', String(date.getMinutes()).padStart(2, '0'))
      .replace('ss', String(date.getSeconds()).padStart(2, '0'))
  }
}

// ─── Array Functions ─────────────────────────────────────────────────────────

const arrayFunctions: Record<string, FormulaFunction> = {
  CONTAINS: (arr: unknown, val: unknown) => {
    if (Array.isArray(arr)) {
      return arr.includes(val)
    }
    return String(arr).includes(String(val))
  },

  COUNT: (arr: unknown) => (Array.isArray(arr) ? arr.length : 0),

  FIRST: (arr: unknown) => (Array.isArray(arr) ? arr[0] : null),

  LAST: (arr: unknown) => (Array.isArray(arr) ? arr[arr.length - 1] : null),

  JOIN: (arr: unknown, delim: unknown = ', ') => {
    return Array.isArray(arr) ? arr.join(String(delim)) : ''
  },

  UNIQUE: (arr: unknown) => {
    return Array.isArray(arr) ? [...new Set(arr)] : []
  },

  SORT: (arr: unknown) => {
    if (!Array.isArray(arr)) return []
    return [...arr].sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b
      return String(a).localeCompare(String(b))
    })
  },

  REVERSE: (arr: unknown) => {
    return Array.isArray(arr) ? [...arr].reverse() : []
  },

  SLICE: (arr: unknown, start: unknown, end?: unknown) => {
    if (!Array.isArray(arr)) return []
    return arr.slice(Number(start), end !== undefined ? Number(end) : undefined)
  },

  FILTER: (arr: unknown, value: unknown) => {
    if (!Array.isArray(arr)) return []
    return arr.filter((item) => item === value)
  },

  MAP: (arr: unknown, prop: unknown) => {
    if (!Array.isArray(arr)) return []
    const propStr = String(prop)
    return arr.map((item) => {
      if (typeof item === 'object' && item !== null) {
        return (item as Record<string, unknown>)[propStr]
      }
      return null
    })
  }
}

// ─── Type Conversion Functions ───────────────────────────────────────────────

const conversionFunctions: Record<string, FormulaFunction> = {
  TONUMBER: (v: unknown) => {
    const num = Number(v)
    return isNaN(num) ? null : num
  },

  TOTEXT: (v: unknown) => String(v ?? ''),

  TOBOOLEAN: (v: unknown) => Boolean(v),

  TODATE: (v: unknown) => {
    const date = new Date(String(v))
    return isNaN(date.getTime()) ? null : date.toISOString()
  }
}

// ─── All Functions ───────────────────────────────────────────────────────────

export const FUNCTIONS: Record<string, FormulaFunction> = {
  ...mathFunctions,
  ...textFunctions,
  ...logicFunctions,
  ...dateFunctions,
  ...arrayFunctions,
  ...conversionFunctions
}

/**
 * Check if a function name is valid.
 */
export function isValidFunction(name: string): boolean {
  return name.toUpperCase() in FUNCTIONS
}

/**
 * Get a function by name.
 */
export function getFunction(name: string): FormulaFunction | undefined {
  return FUNCTIONS[name.toUpperCase()]
}

/**
 * Get all available function names.
 */
export function getFunctionNames(): string[] {
  return Object.keys(FUNCTIONS)
}
