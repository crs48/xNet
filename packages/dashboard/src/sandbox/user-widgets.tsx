/**
 * User-authored widget registration and the in-app editor (0162 phase 4).
 *
 * UserWidgetSchema nodes become 'user'-tier WidgetDefinitions whose
 * renderer is the SES-in-Worker UserWidgetHost. The editor is deliberately
 * plain (textarea + live field list); the contract — render(props) →
 * SafeNode — is what matters.
 */

import type { Disposable, WidgetRegistry } from '../registry'
import type { AnyWidgetDefinition, WidgetProps } from '../types'
import { UserWidgetSchema } from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { useEffect, useRef, useState } from 'react'
import { widgetRegistry } from '../registry'
import { nodeQuery, stubDescriptor, TASK_SCHEMA_IRI } from '../widgets/shared'
import { UserWidgetHost } from './UserWidgetHost'

export const USER_WIDGET_TYPE_PREFIX = 'user.'

export const DEFAULT_USER_WIDGET_CODE = `// Define render(props) and return a tree of
// { tag, style, children } nodes (plain strings are text).
// props: { config, rows, variables, width, height }
function render(props) {
  return {
    tag: 'div',
    style: { padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' },
    children: [
      { tag: 'strong', children: [props.config.title || 'My widget'] },
      'Rows: ' + props.rows.length
    ]
  }
}
`

export function userWidgetDefinition(node: {
  id: string
  name?: unknown
  description?: unknown
  code?: unknown
  configFields?: unknown
  defaultSize?: unknown
}): AnyWidgetDefinition {
  const code = String(node.code ?? '')
  const size = (node.defaultSize as { w?: number; h?: number } | null) ?? null

  function UserWidgetComponent(props: WidgetProps): JSX.Element {
    return <UserWidgetHost {...props} code={code} />
  }

  return {
    type: `${USER_WIDGET_TYPE_PREFIX}${node.id}`,
    name: String(node.name ?? 'User widget'),
    icon: 'square-code',
    description: typeof node.description === 'string' ? node.description : undefined,
    trustTier: 'user',
    configFields: Array.isArray(node.configFields)
      ? (node.configFields as AnyWidgetDefinition['configFields'])
      : [{ key: 'title', label: 'Title', type: 'text' }],
    defaultSize: { w: size?.w ?? 3, h: size?.h ?? 3, minW: 2, minH: 2 },
    getStubConfig: () => ({
      config: {},
      query: {
        descriptor: stubDescriptor(
          String(node.name ?? 'User widget'),
          nodeQuery(TASK_SCHEMA_IRI, {
            orderBy: [{ field: 'updatedAt', direction: 'desc' }],
            first: 50
          })
        ),
        refresh: 'live'
      }
    }),
    component: UserWidgetComponent
  }
}

/**
 * Keep the registry in sync with UserWidgetSchema nodes. Mount once on the
 * dashboard surface (or app shell).
 */
export function useUserWidgets(registry: WidgetRegistry = widgetRegistry): void {
  const { data: nodes } = useQuery(UserWidgetSchema, { orderBy: { updatedAt: 'desc' } })
  const registered = useRef(new Map<string, Disposable>())

  useEffect(() => {
    const live = new Set<string>()

    for (const node of nodes ?? []) {
      if (!node.code) continue
      const type = `${USER_WIDGET_TYPE_PREFIX}${node.id}`
      live.add(type)
      // Re-register on every sync so edits to code/name take effect.
      registered.current.get(type)?.dispose()
      registered.current.set(type, registry.register(userWidgetDefinition(node)))
    }

    for (const [type, disposable] of registered.current) {
      if (!live.has(type)) {
        disposable.dispose()
        registered.current.delete(type)
      }
    }
  }, [nodes, registry])

  useEffect(() => {
    const current = registered.current
    return () => {
      for (const disposable of current.values()) {
        disposable.dispose()
      }
      current.clear()
    }
  }, [])
}

export interface UserWidgetEditorProps {
  /** Edit an existing user widget node, or create a new one when absent */
  widgetId?: string
  onClose: () => void
}

export function UserWidgetEditor({ widgetId, onClose }: UserWidgetEditorProps): JSX.Element {
  const { data: existing } = useQuery(UserWidgetSchema, widgetId ?? '__new__')
  const { create, update } = useMutate()
  const [name, setName] = useState('My widget')
  const [code, setCode] = useState(DEFAULT_USER_WIDGET_CODE)
  const [saving, setSaving] = useState(false)
  const hydrated = useRef(false)

  useEffect(() => {
    if (!existing || hydrated.current) return
    hydrated.current = true
    setName(String(existing.name ?? 'My widget'))
    setCode(String(existing.code ?? DEFAULT_USER_WIDGET_CODE))
  }, [existing])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (widgetId && existing) {
        await update(UserWidgetSchema, widgetId, { name, code })
      } else {
        await create(UserWidgetSchema, { name, code })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-label="Widget editor"
      onClick={onClose}
    >
      <div
        className="flex h-[70vh] w-[40rem] flex-col gap-3 rounded-lg border border-border bg-background p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-foreground">
          {widgetId ? 'Edit widget' : 'New widget'}
        </h2>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Name
          <input
            type="text"
            className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="flex min-h-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Code — define render(props), runs sandboxed (SES compartment in a worker)
          <textarea
            className="min-h-0 flex-1 resize-none rounded border border-border bg-background p-2 font-mono text-xs text-foreground"
            spellCheck={false}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            disabled={saving || !name.trim() || !code.trim()}
            onClick={() => void handleSave()}
          >
            Save widget
          </button>
        </div>
      </div>
    </div>
  )
}
