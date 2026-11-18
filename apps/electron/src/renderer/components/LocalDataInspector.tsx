import type { NodeState } from '@xnetjs/data'
import { useNodeStore } from '@xnetjs/react/internal'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const PAGE_SIZE = 50
const buttonClass =
  'rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40'
const nodeName = (node: NodeState): string => {
  const value =
    node.properties.title ??
    node.properties.name ??
    node.properties.displayName ??
    node.properties.content
  return typeof value === 'string' && value.trim() ? value.slice(0, 160) : schemaName(node.schemaId)
}
const schemaName = (schema: string) => schema.split('/').pop()?.split('@')[0] || schema

/** An on-demand snapshot of local nodes. No mutations or diagnostic instrumentation. */
export function LocalDataInspector({ onClose }: { onClose: () => void }) {
  const { store, isReady, error: storeError } = useNodeStore()
  const [offset, setOffset] = useState(0)
  const [input, setInput] = useState('')
  const [nodeId, setNodeId] = useState('')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ rows: NodeState[]; hasMore: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const details = useRef<HTMLElement>(null)
  const [selected, setSelected] = useState<NodeState | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  useEffect(() => {
    if (!store || !isReady) return
    let active = true
    setResult(null)
    setSelected(null)
    setCopyError(null)
    setError(null)
    const read = nodeId
      ? store.get(nodeId).then((node) => (node && (includeDeleted || !node.deleted) ? [node] : []))
      : store.list({ includeDeleted, limit: PAGE_SIZE + 1, offset, orderBy: { createdAt: 'desc' } })
    void read.then(
      (nodes) => {
        if (active)
          setResult({ rows: nodes.slice(0, PAGE_SIZE), hasMore: nodes.length > PAGE_SIZE })
      },
      (cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause))
      }
    )
    return () => {
      active = false
    }
  }, [store, isReady, nodeId, offset, includeDeleted, revision])
  useEffect(() => {
    if (selected) {
      details.current?.focus({ preventScroll: true })
      details.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selected])
  const failure = error || storeError?.message
  const detail = selected ? JSON.stringify(selected, null, 2) : ''
  return (
    <section className="space-y-5 min-w-0">
      <button className={`${buttonClass} inline-flex items-center gap-2`} onClick={onClose}>
        <ArrowLeft size={14} /> Back to storage
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Local data</h2>
          <p className="text-sm text-muted-foreground">
            Read-only xNet records on this device · 50 nodes per page
          </p>
        </div>
        <button
          className={`${buttonClass} inline-flex items-center gap-2`}
          onClick={() => setRevision((value) => value + 1)}
          disabled={!result && !failure}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setOffset(0)
          setNodeId(input.trim())
          setRevision((value) => value + 1)
        }}
      >
        <label className="sr-only" htmlFor="local-node-id">
          Find node by ID
        </label>
        <input
          id="local-node-id"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Find node by ID…"
          maxLength={512}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button className={buttonClass} type="submit">
          Find
        </button>
        {nodeId && (
          <button
            className={buttonClass}
            type="button"
            onClick={() => {
              setInput('')
              setNodeId('')
              setOffset(0)
            }}
          >
            Show all
          </button>
        )}
      </form>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeDeleted}
          onChange={(event) => {
            setIncludeDeleted(event.target.checked)
            setOffset(0)
          }}
        />{' '}
        Include deleted nodes
      </label>
      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          Could not read local data: {failure}
        </p>
      ) : !result ? (
        <p role="status" className="text-sm text-muted-foreground">
          Reading local data…
        </p>
      ) : result.rows.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          {nodeId
            ? 'No matching node. You can also include deleted nodes.'
            : offset
              ? 'No more nodes. Go back or refresh the first page.'
              : 'No local nodes yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">Local xNet nodes</caption>
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th scope="col" className="w-1/2 px-3 py-2 font-medium">
                  Node
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Type
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((node) => (
                <tr key={node.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <button
                      className="block w-full text-left hover:underline focus-visible:underline"
                      aria-label={`Inspect node ${node.id}`}
                      onClick={() => {
                        setSelected(node)
                        setCopied(false)
                        setCopyError(null)
                      }}
                    >
                      <span className="block truncate" title={nodeName(node)}>
                        {nodeName(node)}
                      </span>
                      <span
                        className="block truncate font-mono text-[11px] text-muted-foreground"
                        title={node.id}
                      >
                        {node.id}
                      </span>
                    </button>
                    {node.deleted && <span className="text-xs text-muted-foreground">Deleted</span>}
                  </td>
                  <td className="truncate px-3 py-2" title={node.schemaId}>
                    {schemaName(node.schemaId)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(node.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!nodeId && (
        <div className="flex items-center justify-between gap-3">
          <button
            className={buttonClass}
            disabled={offset === 0 || !result}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </button>
          <span role="status" className="text-xs text-muted-foreground">
            {result?.rows.length ? `Nodes ${offset + 1}–${offset + result.rows.length}` : ''}
          </span>
          <button
            className={buttonClass}
            disabled={!result?.hasMore}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      )}
      {selected && (
        <section
          ref={details}
          tabIndex={-1}
          className="space-y-3 rounded-lg border border-border p-4"
          aria-label="Node details"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="min-w-0 break-all font-medium">{nodeName(selected)}</h3>
            <button
              className={buttonClass}
              onClick={() =>
                void navigator.clipboard.writeText(selected.id).then(
                  () => setCopied(true),
                  () => setCopyError('Could not copy the node ID. Select it in the details below.')
                )
              }
            >
              {copied ? 'Copied' : 'Copy node ID'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            This snapshot cannot change the record. Refresh to read the latest data.
          </p>
          {copyError && (
            <p role="alert" className="text-xs text-destructive">
              {copyError}
            </p>
          )}
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-3 font-mono text-xs">
            {detail.slice(0, 100_000)}
          </pre>
          {detail.length > 100_000 && (
            <p className="text-xs text-muted-foreground">
              Preview limited to the first 100,000 characters.
            </p>
          )}
        </section>
      )}
    </section>
  )
}
