/**
 * NodeExplorer panel - Browse all nodes grouped by schema
 */

import { useNodeExplorer, type NodeEntry } from './useNodeExplorer'
import { truncateDID, relativeTime } from '../../utils/formatters'

export function NodeExplorer() {
  const {
    nodes,
    schemas,
    selectedNode,
    setSelectedNode,
    schemaFilter,
    setSchemaFilter,
    searchQuery,
    setSearchQuery,
    showDeleted,
    setShowDeleted,
    isLoading
  } = useNodeExplorer()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">Loading nodes...</div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Main list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          />
          <select
            value={schemaFilter || ''}
            onChange={(e) => setSchemaFilter(e.target.value || null)}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200"
          >
            <option value="">All schemas ({schemas.length})</option>
            {schemas.map((s) => (
              <option key={s} value={s}>
                {s.split('/').pop()}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-[10px] text-zinc-500 cursor-pointer">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="w-3 h-3"
            />
            Deleted
          </label>
          <span className="text-[10px] text-zinc-500">{nodes.length} nodes</span>
        </div>

        {/* Node list */}
        <div className="flex-1 overflow-y-auto">
          {nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
              No nodes found
            </div>
          ) : (
            nodes.map((node) => (
              <NodeRow
                key={node.id}
                node={node}
                isSelected={selectedNode?.id === node.id}
                onSelect={() => setSelectedNode(node)}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail pane */}
      {selectedNode && (
        <div className="w-80 border-l border-zinc-800 overflow-y-auto p-3">
          <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
        </div>
      )}
    </div>
  )
}

function NodeRow({
  node,
  isSelected,
  onSelect
}: {
  node: NodeEntry
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`
        flex items-center gap-2 px-3 py-1 cursor-pointer border-l-2 text-xs
        ${isSelected ? 'bg-zinc-800 border-blue-400' : 'border-transparent hover:bg-zinc-900'}
        ${node.deleted ? 'opacity-50' : ''}
      `}
    >
      <span className="text-zinc-500 font-mono text-[10px] w-20 truncate">
        {node.id.slice(0, 8)}
      </span>
      <span className="text-blue-400 text-[10px] w-20 truncate">{node.schemaLabel}</span>
      <span className="text-zinc-400 flex-1 truncate text-[10px]">
        {Object.entries(node.properties)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 20) : JSON.stringify(v)}`)
          .join(', ')}
      </span>
      <span className="text-zinc-600 text-[10px]">{relativeTime(node.updatedAt)}</span>
    </div>
  )
}

function NodeDetail({ node, onClose }: { node: NodeEntry; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-zinc-200">Node Detail</h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white text-xs">
          x
        </button>
      </div>

      <div className="space-y-1.5">
        <DetailRow label="ID" value={node.id} mono />
        <DetailRow label="Schema" value={node.schemaId} />
        <DetailRow label="Created" value={new Date(node.createdAt).toLocaleString()} />
        <DetailRow label="Updated" value={new Date(node.updatedAt).toLocaleString()} />
        <DetailRow label="Author" value={truncateDID(node.createdBy)} mono />
        <DetailRow label="Deleted" value={String(node.deleted)} />
      </div>

      <div>
        <h4 className="text-[10px] font-bold text-zinc-400 mb-1">Properties</h4>
        <pre className="text-[10px] text-zinc-300 bg-zinc-900 rounded p-2 overflow-x-auto max-h-40">
          {JSON.stringify(node.properties, null, 2)}
        </pre>
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] text-zinc-500 w-16 shrink-0">{label}</span>
      <span className={`text-[10px] text-zinc-300 break-all ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}
