/**
 * SchemaRegistry panel - Browse registered schemas and their usage
 */

import { useCallback } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { useSchemaRegistry, type SchemaEntry, type PropertyInfo } from './useSchemaRegistry'

export function SchemaRegistry() {
  const { schemas, selectedSchema, setSelectedSchema, isLoading } = useSchemaRegistry()

  const getSchemasData = useCallback(() => schemas, [schemas])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-ink-3">Loading schemas...</div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Schema list */}
      <div className="w-64 border-r border-hairline overflow-y-auto shrink-0">
        <div className="flex items-center justify-between px-2 py-1 border-b border-hairline">
          <span className="text-[10px] font-bold text-ink-3">Schemas ({schemas.length})</span>
          <CopyButton getData={getSchemasData} label="Copy" />
        </div>
        {schemas.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-ink-3 text-xs">
            No schemas found
          </div>
        ) : (
          schemas.map((schema) => (
            <SchemaRow
              key={schema.iri}
              schema={schema}
              isSelected={selectedSchema?.iri === schema.iri}
              onSelect={() => setSelectedSchema(schema)}
            />
          ))
        )}
      </div>

      {/* Detail pane */}
      <div className="flex-1 overflow-y-auto">
        {selectedSchema ? (
          <SchemaDetail schema={selectedSchema} onClose={() => setSelectedSchema(null)} />
        ) : (
          <div className="flex items-center justify-center h-full text-ink-3 text-[10px]">
            Select a schema to view details
          </div>
        )}
      </div>
    </div>
  )
}

function SchemaRow({
  schema,
  isSelected,
  onSelect
}: {
  schema: SchemaEntry
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`
        px-3 py-1.5 cursor-pointer border-l-2 text-xs
        ${isSelected ? 'bg-background-emphasis border-accent-ink' : 'border-transparent hover:bg-accent'}
      `}
    >
      <div className="flex items-center gap-2">
        <span className="text-ink-1 font-medium">{schema.name}</span>
        {schema.isBuiltIn && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-background-emphasis text-ink-2">
            built-in
          </span>
        )}
        {schema.documentType && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-background-emphasis text-ink-1">
            {schema.documentType}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-ink-3">
        <span>{schema.propertyCount} props</span>
        <span>{schema.nodeCount} nodes</span>
      </div>
    </div>
  )
}

function SchemaDetail({ schema, onClose }: { schema: SchemaEntry; onClose: () => void }) {
  return (
    <div className="p-3 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-ink-1">{schema.name}</h3>
            {schema.isBuiltIn && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-background-emphasis text-ink-2">
                built-in
              </span>
            )}
          </div>
          <div className="text-[10px] text-ink-3 font-mono mt-0.5 break-all">{schema.iri}</div>
        </div>
        <button onClick={onClose} className="text-ink-3 hover:text-ink-1 text-xs p-1">
          x
        </button>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <MetaRow label="Namespace" value={schema.namespace} />
        <MetaRow label="Node Count" value={String(schema.nodeCount)} />
        <MetaRow label="Properties" value={String(schema.propertyCount)} />
        {schema.documentType && <MetaRow label="Document" value={schema.documentType} highlight />}
        {schema.extendsSchema && (
          <MetaRow label="Extends" value={schema.extendsSchema.split('/').pop() || ''} />
        )}
      </div>

      {/* Properties */}
      {schema.properties.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold text-ink-2 uppercase mb-2">
            Properties ({schema.properties.length})
          </h4>
          <div className="space-y-1">
            {schema.properties.map((prop) => (
              <PropertyRow key={prop.name} property={prop} />
            ))}
          </div>
        </div>
      )}

      {/* Raw Schema */}
      <div>
        <h4 className="text-[10px] font-bold text-ink-2 uppercase mb-2">Raw Schema</h4>
        <pre className="text-[9px] text-ink-2 bg-surface-2 rounded p-2 overflow-x-auto max-h-48">
          {JSON.stringify(schema, null, 2)}
        </pre>
      </div>
    </div>
  )
}

function MetaRow({
  label,
  value,
  highlight
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-ink-3">{label}:</span>
      <span className={`text-[10px] font-mono truncate ${highlight ? 'text-ink-1' : 'text-ink-2'}`}>
        {value}
      </span>
    </div>
  )
}

function PropertyRow({ property }: { property: PropertyInfo }) {
  const typeColors: Record<string, string> = {
    text: 'text-ink-2',
    number: 'text-ink-2',
    checkbox: 'text-ink-2',
    date: 'text-ink-2',
    dateRange: 'text-ink-2',
    select: 'text-ink-2',
    multiSelect: 'text-ink-2',
    person: 'text-ink-2',
    relation: 'text-ink-2',
    rollup: 'text-ink-2',
    formula: 'text-ink-2',
    url: 'text-ink-2',
    email: 'text-ink-2',
    phone: 'text-ink-2',
    file: 'text-ink-2',
    created: 'text-ink-3',
    updated: 'text-ink-3',
    createdBy: 'text-ink-3'
  }

  const hasConfig = property.config && Object.keys(property.config).length > 0

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-surface-2 text-[10px]">
      <span className="text-ink-1 font-medium min-w-20">{property.name}</span>
      <span className={`font-mono ${typeColors[property.type] || 'text-ink-2'}`}>
        {property.type}
      </span>
      {property.required && (
        <span className="text-destructive text-[9px]" title="Required">
          *
        </span>
      )}
      {hasConfig && (
        <span
          className="text-ink-3 text-[9px] truncate flex-1"
          title={JSON.stringify(property.config)}
        >
          {formatConfig(property.config!)}
        </span>
      )}
    </div>
  )
}

function formatConfig(config: Record<string, unknown>): string {
  const parts: string[] = []

  if ('options' in config && Array.isArray(config.options)) {
    // Handle select/multiSelect options which are {id, name, color?} objects
    const optionLabels = config.options.map((opt: unknown) => {
      if (typeof opt === 'object' && opt !== null) {
        const o = opt as Record<string, unknown>
        return o.name || o.id || o.value || JSON.stringify(opt)
      }
      return String(opt)
    })
    const display = optionLabels.slice(0, 3).join(', ')
    parts.push(`[${display}${optionLabels.length > 3 ? ', ...' : ''}]`)
  }
  if ('default' in config && config.default !== undefined) {
    parts.push(`default: ${config.default}`)
  }
  if ('targetSchema' in config) {
    const target = String(config.targetSchema).split('/').pop()
    parts.push(`-> ${target}`)
  }
  if ('format' in config) {
    parts.push(String(config.format))
  }

  return parts.join(' ')
}
