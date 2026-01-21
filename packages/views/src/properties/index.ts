/**
 * Property handlers for rendering and editing different property types
 */

import type { PropertyType } from '@xnet/data'
import type { PropertyHandler } from '../types'
import { textHandler } from './text.js'
import { numberHandler } from './number.js'
import { checkboxHandler } from './checkbox.js'
import { dateHandler } from './date.js'
import { selectHandler } from './select.js'
import { multiSelectHandler } from './multiSelect.js'
import { urlHandler } from './url.js'
import { emailHandler } from './email.js'
import { phoneHandler } from './phone.js'

/**
 * Registry of property handlers by type
 * Using 'any' to avoid complex generic variance issues
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: Partial<Record<PropertyType, PropertyHandler<any>>> = {
  text: textHandler,
  number: numberHandler,
  checkbox: checkboxHandler,
  date: dateHandler,
  select: selectHandler,
  multiSelect: multiSelectHandler,
  url: urlHandler,
  email: emailHandler,
  phone: phoneHandler,
  // Auto properties - read-only
  created: dateHandler,
  updated: dateHandler,
  createdBy: textHandler
}

/**
 * Get the property handler for a given type
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPropertyHandler(type: PropertyType): PropertyHandler<any> {
  const handler = handlers[type]
  if (!handler) {
    // Fallback to text handler for unknown types
    return textHandler
  }
  return handler
}

export {
  textHandler,
  numberHandler,
  checkboxHandler,
  dateHandler,
  selectHandler,
  multiSelectHandler,
  urlHandler,
  emailHandler,
  phoneHandler
}
