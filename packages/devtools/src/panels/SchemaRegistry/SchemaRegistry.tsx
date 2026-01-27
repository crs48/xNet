/**
 * SchemaRegistry panel - Browse registered schemas and their usage
 */

import { useCallback } from 'react'
import { useSchemaRegistry, type SchemaEntry, type PropertyInfo } from './useSchemaRegistry'
import { CopyButton } from '../../components/CopyButton'

export function SchemaRegistry() {
  const { schemas, selectedSchema, setSelectedSchema, isLoading } = useSchemaRegistry()

  const getSchemasData = useCallback(() => schemas, [schemas])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        Loading schemas...
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Schema list */}
      <div className="w-64 border-r border-zinc-800 overflow-y-auto shrink-0">
        <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-800">
          <span className="text-[10px] font-bold text-zinc-500">Schemas ({schemas.length})</span>
          <CopyButton getData={getSchemasData} label="Copy" />
        </div>
        {schemas.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-xs">
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
          <div className="flex items-center justify-center h-full text-zinc-600 text-[10px]">
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
        ${isSelected ? 'bg-zinc-800 border-blue-400' : 'border-transparent hover:bg-zinc-900'}
      `}
    >
      <div className="flex items-center gap-2">
        <span className="text-blue-400 font-medium">{schema.name}</span>
        {schema.isBuiltIn && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-zinc-700 text-zinc-400">built-in</span>
        )}
        {schema.documentType && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-purple-900 text-purple-300">
            {schema.documentType}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
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
            <h3 className="text-sm font-bold text-zinc-200">{schema.name}</h3>
            {schema.isBuiltIn && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">
                built-in
              </span>
            )}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono mt-0.5 break-all">{schema.iri}</div>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white text-xs p-1">
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
          <h4 className="text-[10px] font-bold text-zinc-400 uppercase mb-2">
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
        <h4 className="text-[10px] font-bold text-zinc-400 uppercase mb-2">Raw Schema</h4>
        <pre className="text-[9px] text-zinc-400 bg-zinc-900 rounded p-2 overflow-x-auto max-h-48">
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
      <span className="text-[10px] text-zinc-500">{label}:</span>
      <span
        className={`text-[10px] font-mono truncate ${highlight ? 'text-purple-400' : 'text-zinc-300'}`}
      >
        {value}
      </span>
    </div>
  )
}

function PropertyRow({ property }: { property: PropertyInfo }) {
  const typeColors: Record<string, string> = {
    text: 'text-blue-400',
    number: 'text-green-400',
    checkbox: 'text-yellow-400',
    date: 'text-orange-400',
    dateRange: 'text-orange-400',
    select: 'text-purple-400',
    multiSelect: 'text-purple-400',
    person: 'text-pink-400',
    relation: 'text-cyan-400',
    rollup: 'text-teal-400',
    formula: 'text-amber-400',
    url: 'text-sky-400',
    email: 'text-sky-400',
    phone: 'text-sky-400',
    file: 'text-indigo-400',
    created: 'text-zinc-500',
    updated: 'text-zinc-500',
    createdBy: 'text-zinc-500'
  }

  const hasConfig = property.config && Object.keys(property.config).length > 0

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-zinc-900/50 text-[10px]">
      <span className="text-zinc-200 font-medium min-w-20">{property.name}</span>
      <span className={`font-mono ${typeColors[property.type] || 'text-zinc-400'}`}>
        {property.type}
      </span>
      {property.required && (
        <span className="text-red-400 text-[9px]" title="Required">
          *
        </span>
      )}
      {hasConfig && (
        <span
          className="text-zinc-600 text-[9px] truncate flex-1"
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
