/**
 * Property handlers for rendering and editing different property types
 */

import type { PropertyHandler, Disposable } from '../types'
import type { PropertyType } from '@xnet/data'
import { checkboxHandler } from './checkbox.js'
import { dateHandler } from './date.js'
import { dateRangeHandler } from './dateRange.js'
import { emailHandler } from './email.js'
import { fileHandler } from './file.js'
import { multiSelectHandler } from './multiSelect.js'
import { numberHandler } from './number.js'
import { phoneHandler } from './phone.js'
import { selectHandler } from './select.js'
import { textHandler } from './text.js'
import { urlHandler } from './url.js'

// ─── Built-in Handlers ──────────────────────────────────────────────────────

/**
 * Built-in property handlers (immutable)
 * Using 'any' to avoid complex generic variance issues
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const builtinHandlers: Partial<Record<PropertyType, PropertyHandler<any>>> = {
  text: textHandler,
  number: numberHandler,
  checkbox: checkboxHandler,
  date: dateHandler,
  dateRange: dateRangeHandler,
  select: selectHandler,
  multiSelect: multiSelectHandler,
  url: urlHandler,
  email: emailHandler,
  phone: phoneHandler,
  file: fileHandler,
  // String-based types use textHandler
  person: textHandler,
  relation: textHandler,
  // Auto properties - read-only
  created: dateHandler,
  updated: dateHandler,
  createdBy: textHandler
}

// ─── Dynamic Registry ───────────────────────────────────────────────────────

/**
 * Custom property handlers registered by plugins
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const customHandlers = new Map<string, PropertyHandler<any>>()

/**
 * Listeners for handler changes
 */
const listeners = new Set<() => void>()

/**
 * Register a custom property handler
 *
 * @param type - Property type identifier
 * @param handler - Handler implementation
 * @returns Disposable to unregister the handler
 *
 * @example
 * ```ts
 * const disposable = registerPropertyHandler('currency', {
 *   Cell: CurrencyCell,
 *   Editor: CurrencyEditor,
 *   defaultValue: () => 0,
 *   serialize: (v) => v,
 *   deserialize: (v) => v
 * })
 *
 * // Later: disposable.dispose()
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerPropertyHandler(type: string, handler: PropertyHandler<any>): Disposable {
  customHandlers.set(type, handler)
  notifyListeners()
  return {
    dispose: () => {
      customHandlers.delete(type)
      notifyListeners()
    }
  }
}

/**
 * Get the property handler for a given type
 *
 * Custom handlers take precedence over built-in handlers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPropertyHandler(type: PropertyType | string): PropertyHandler<any> {
  // Check custom handlers first (allows overriding built-in types)
  const customHandler = customHandlers.get(type)
  if (customHandler) {
    return customHandler
  }

  // Fall back to built-in handlers
  const builtinHandler = builtinHandlers[type as PropertyType]
  if (builtinHandler) {
    return builtinHandler
  }

  // Fallback to text handler for unknown types
  return textHandler
}

/**
 * Subscribe to property handler changes
 *
 * @param listener - Callback when handlers change
 * @returns Unsubscribe function
 */
export function onPropertyHandlersChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Get all registered property types (built-in + custom)
 */
export function getRegisteredPropertyTypes(): string[] {
  const builtinTypes = Object.keys(builtinHandlers)
  const customTypes = [...customHandlers.keys()]
  return [...new Set([...builtinTypes, ...customTypes])]
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch (err) {
      console.error('[PropertyHandlers] Listener error:', err)
    }
  }
}

export {
  textHandler,
  numberHandler,
  checkboxHandler,
  dateHandler,
  dateRangeHandler,
  selectHandler,
  multiSelectHandler,
  urlHandler,
  emailHandler,
  phoneHandler,
  fileHandler
}
