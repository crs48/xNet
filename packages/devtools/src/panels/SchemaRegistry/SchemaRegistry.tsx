/**
 * SchemaRegistry panel - Browse registered schemas and their usage
 */

import { useCallback } from 'react'
import { useSchemaRegistry, type SchemaEntry } from './useSchemaRegistry'
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
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-800">
          <span className="text-[10px] font-bold text-zinc-500">Schemas ({schemas.length})</span>
          <CopyButton getData={getSchemasData} label="Copy Schemas" />
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
      {selectedSchema && (
        <div className="w-72 border-l border-zinc-800 overflow-y-auto p-3">
          <SchemaDetail schema={selectedSchema} onClose={() => setSelectedSchema(null)} />
        </div>
      )}
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
        flex items-center gap-2 px-3 py-1.5 cursor-pointer border-l-2 text-xs
        ${isSelected ? 'bg-zinc-800 border-blue-400' : 'border-transparent hover:bg-zinc-900'}
      `}
    >
      <span className="text-blue-400 font-medium">{schema.name}</span>
      <span className="text-zinc-600 text-[10px] truncate flex-1">{schema.namespace}</span>
      <span className="text-zinc-500 text-[10px]">{schema.propertyCount} nodes</span>
    </div>
  )
}

function SchemaDetail({ schema, onClose }: { schema: SchemaEntry; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-zinc-200">{schema.name}</h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white text-xs">
          x
        </button>
      </div>
      <div className="space-y-1.5">
        <DetailRow label="IRI" value={schema.iri} />
        <DetailRow label="Namespace" value={schema.namespace} />
        <DetailRow label="Nodes" value={String(schema.propertyCount)} />
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] text-zinc-500 w-16 shrink-0">{label}</span>
      <span className="text-[10px] text-zinc-300 break-all font-mono">{value}</span>
    </div>
  )
}
