/**
 * UserWidgetSchema - User-authored dashboard widgets (0162 phase 4).
 *
 * Stores the widget source written in the in-app editor. The code defines
 * `render(props)` returning a restricted SafeNode tree and executes in the
 * 'user' trust tier (SES Compartment inside a Web Worker) — it is data
 * here, never evaluated by the data layer.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { json, text } from '../properties'

export interface UserWidgetConfigField {
  key: string
  label: string
  type: 'property-select' | 'select' | 'number' | 'checkbox' | 'text' | 'color'
  options?: Array<{ label: string; value: string }>
  defaultValue?: unknown
}

export interface UserWidgetSize {
  w: number
  h: number
  minW?: number
  minH?: number
}

export const UserWidgetSchema = defineSchema({
  name: 'UserWidget',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Display name shown in the widget picker */
    name: text({ required: true, maxLength: 200 }),

    /** Short picker description */
    description: text({ maxLength: 1000 }),

    /** Widget source: defines render(props) returning a SafeNode tree */
    code: text({ required: true, maxLength: 100000 }),

    /** Config fields driving the auto-generated editor — whole-value LWW */
    configFields: json<UserWidgetConfigField[]>({}),

    /** Default tile size in 12-column grid units — whole-value LWW */
    defaultSize: json<UserWidgetSize>({})
  }
})

export type UserWidget = InferNode<(typeof UserWidgetSchema)['_properties']>
