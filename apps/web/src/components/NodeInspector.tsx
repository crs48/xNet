/**
 * NodeInspector — the universal, schema-driven detail/edit panel (0190).
 *
 * The cohesion keystone: instead of every domain hand-coding a detail pane,
 * any node opens in the same shell — an editable title header, an
 * `OrganizeBar` (space / folder / tags), the full schema rendered as an
 * editable `SchemaForm`, and an optional slot for domain-specific panels
 * (stakeholders, line items, …). Adding a field to a schema makes it editable
 * here automatically.
 *
 * `NodePeek` hosts the inspector in a right-side slide-over so a related node
 * can be opened in place without losing context.
 */

import {
  FolderSchema,
  SpaceSchema,
  TagSchema,
  type DefinedSchema,
  type PropertyBuilder
} from '@xnetjs/data'
import { useNode, useQuery } from '@xnetjs/react'
import { SchemaForm, type SchemaToFormOptions } from '@xnetjs/views'
import { X } from 'lucide-react'
import { useCallback, useEffect, type JSX, type ReactNode } from 'react'

// Fields the OrganizeBar owns, so they don't double-render in the form body.
const ORGANIZE_FIELDS = ['space', 'folder', 'tags']

export interface NodeInspectorPanel {
  id: string
  title: string
  render: () => ReactNode
}

export interface NodeInspectorProps<P extends Record<string, PropertyBuilder>> {
  schema: DefinedSchema<P>
  nodeId: string
  /** Extra layout hints forwarded to the form (highlights/order/groups). */
  formOptions?: SchemaToFormOptions
  /** Domain-specific panels rendered below the form. */
  extraPanels?: NodeInspectorPanel[]
  onClose?: () => void
  className?: string
}

function pickTitleKey(propertyNames: string[]): string | undefined {
  for (const candidate of ['displayName', 'name', 'title']) {
    if (propertyNames.includes(candidate)) return candidate
  }
  return propertyNames[0]
}

const selectCls =
  'rounded-sm border border-hairline bg-bg-1 px-1.5 py-0.5 text-xs text-ink-2 outline-none focus:border-ink-3'

/** Space / folder / tags pickers — only the ones the schema actually supports. */
function OrganizeBar<P extends Record<string, PropertyBuilder>>({
  schema,
  data,
  update
}: {
  schema: DefinedSchema<P>
  data: Record<string, unknown> | null
  update: (patch: Record<string, unknown>) => void
}): JSX.Element | null {
  const names = schema.schema.properties.map((p) => p.name)
  const has = (name: string): boolean => names.includes(name)

  const { data: spaceDocs } = useQuery(SpaceSchema, { orderBy: { updatedAt: 'desc' }, limit: 200 })
  const { data: folderDocs } = useQuery(FolderSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: 200
  })
  const { data: tagDocs } = useQuery(TagSchema, { orderBy: { updatedAt: 'desc' }, limit: 300 })

  if (!has('space') && !has('folder') && !has('tags')) return null

  const spaces = ((spaceDocs ?? []) as Array<{ id: string; name?: string; archived?: boolean }>)
    .filter((s) => !s.archived && s.name)
    .map((s) => ({ id: s.id, name: s.name as string }))
  const folders = ((folderDocs ?? []) as Array<{ id: string; name?: string }>).map((f) => ({
    id: f.id,
    name: f.name ?? 'Untitled'
  }))
  const tags = ((tagDocs ?? []) as Array<{ id: string; name?: string; archived?: boolean }>).filter(
    (t) => !t.archived && t.name
  )

  const currentSpace = typeof data?.space === 'string' ? data.space : ''
  const currentFolder = typeof data?.folder === 'string' ? data.folder : ''
  const currentTags = Array.isArray(data?.tags) ? (data.tags as string[]).map(String) : []
  const availableTags = tags.filter((t) => !currentTags.includes(t.id))
  const tagName = (id: string): string => tags.find((t) => t.id === id)?.name ?? id

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-2 text-xs">
      {has('space') && (
        <label className="flex items-center gap-1 text-ink-3">
          Space
          <select
            aria-label="Space"
            value={currentSpace}
            onChange={(e) => update({ space: e.target.value })}
            className={selectCls}
          >
            <option value="">None</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {has('folder') && (
        <label className="flex items-center gap-1 text-ink-3">
          Folder
          <select
            aria-label="Folder"
            value={currentFolder}
            onChange={(e) => update({ folder: e.target.value })}
            className={selectCls}
          >
            <option value="">Unfiled</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {has('tags') && (
        <div className="flex flex-wrap items-center gap-1">
          {currentTags.map((id) => (
            <span
              key={id}
              className="flex items-center gap-1 rounded-full border border-hairline px-2 py-px text-ink-2"
            >
              #{tagName(id)}
              <button
                type="button"
                aria-label={`Remove tag ${tagName(id)}`}
                onClick={() => update({ tags: currentTags.filter((t) => t !== id) })}
                className="text-ink-3 hover:text-red-500"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          {availableTags.length > 0 && (
            <select
              aria-label="Add tag"
              value=""
              onChange={(e) => {
                if (e.target.value) update({ tags: [...currentTags, e.target.value] })
              }}
              className={selectCls}
            >
              <option value="">+ tag</option>
              {availableTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}

export function NodeInspector<P extends Record<string, PropertyBuilder>>({
  schema,
  nodeId,
  formOptions,
  extraPanels,
  onClose,
  className
}: NodeInspectorProps<P>): JSX.Element {
  const { data, update, loading } = useNode(schema, nodeId)
  const node = (data ?? null) as Record<string, unknown> | null

  // useNode's `update` is schema-typed; the inspector edits fields generically
  // (the field keys come from the schema, so the values are valid by construction).
  const updateAny = useCallback(
    (patch: Record<string, unknown>) => {
      void update(patch as never)
    },
    [update]
  )

  const names = schema.schema.properties.map((p) => p.name)
  const titleKey = pickTitleKey(names)
  const titleValue =
    titleKey && typeof node?.[titleKey] === 'string' ? (node[titleKey] as string) : ''

  const onFieldChange = useCallback(
    (key: string, next: unknown) => updateAny({ [key]: next }),
    [updateAny]
  )

  const hidden = [
    ...(titleKey ? [titleKey] : []),
    ...ORGANIZE_FIELDS,
    ...(formOptions?.hidden ?? [])
  ]

  return (
    <div className={`flex h-full min-h-0 flex-col bg-surface-0 ${className ?? ''}`}>
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink-1"
          >
            <X size={16} />
          </button>
        )}
        <span className="text-[10px] uppercase tracking-wide text-ink-3">{schema.schema.name}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-2">
          {titleKey ? (
            <input
              aria-label="Title"
              value={titleValue}
              placeholder="Untitled"
              onChange={(e) => updateAny({ [titleKey]: e.target.value })}
              className="w-full bg-transparent text-xl font-semibold text-ink-1 outline-none placeholder:text-ink-3"
            />
          ) : (
            <h2 className="text-xl font-semibold text-ink-1">Untitled</h2>
          )}
        </div>

        <OrganizeBar schema={schema} data={node} update={updateAny} />

        <div className="px-4 py-3">
          {loading && !node ? (
            <p className="text-xs text-ink-3">Loading…</p>
          ) : (
            <SchemaForm
              schema={schema.schema}
              value={(node ?? {}) as Parameters<typeof SchemaForm>[0]['value']}
              onChange={onFieldChange}
              options={{ ...formOptions, hidden }}
            />
          )}
        </div>

        {extraPanels?.map((panel) => (
          <div key={panel.id} className="border-t border-hairline px-4 py-3">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-ink-3">{panel.title}</div>
            {panel.render()}
          </div>
        ))}
      </div>
    </div>
  )
}

export interface NodePeekProps<P extends Record<string, PropertyBuilder>> extends Omit<
  NodeInspectorProps<P>,
  'onClose' | 'className'
> {
  open: boolean
  onClose: () => void
}

/** Right-side slide-over hosting a NodeInspector for any node. */
export function NodePeek<P extends Record<string, PropertyBuilder>>({
  open,
  onClose,
  ...inspectorProps
}: NodePeekProps<P>): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close details"
        className="flex-1 cursor-default bg-black/30"
        onClick={onClose}
      />
      <div className="h-full w-[440px] max-w-[90vw] border-l border-hairline shadow-xl">
        <NodeInspector {...inspectorProps} onClose={onClose} className="h-full" />
      </div>
    </div>
  )
}
