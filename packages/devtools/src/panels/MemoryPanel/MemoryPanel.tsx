/**
 * Memory console (exploration 0415) — what xNet remembers about this workspace,
 * ranked the way retrieval ranks it, editable and deletable in place.
 *
 * The panel exists because of a rule the exploration states plainly: a memory
 * the user cannot see is not a memory, it is a profile. Everything an agent
 * carries into a session is listed here, the cut-off for the skill preamble is
 * drawn on screen, and every row can be rewritten or removed.
 */

import { useState } from 'react'
import { useMemories, type MemoryRow } from './useMemories'

const KIND_COLORS: Record<string, string> = {
  fact: 'text-blue-600',
  preference: 'text-purple-600',
  episode: 'text-green-600'
}

function MemoryRowView({
  row,
  inPreamble,
  onEdit,
  onForget
}: {
  row: MemoryRow
  inPreamble: boolean
  onEdit: (text: string) => void
  onForget: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <tr className="border-b border-hairline align-top">
      <td
        className="px-2 py-1 text-center"
        title={inPreamble ? 'Carried into sessions' : 'Below the preamble cut-off'}
      >
        {inPreamble ? '●' : '○'}
      </td>
      <td className={`px-2 py-1 text-[11px] ${KIND_COLORS[row.kind] ?? 'text-ink-3'}`}>
        {row.kind}
      </td>
      <td className="px-2 py-1">
        {draft === null ? (
          <button
            className="text-left text-xs hover:underline"
            onClick={() => setDraft(row.text)}
            title="Click to edit"
          >
            {row.text}
          </button>
        ) : (
          <div className="flex gap-1">
            <textarea
              className="w-full rounded border border-hairline bg-transparent px-1 py-0.5 text-xs"
              value={draft}
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              className="text-[11px] text-green-600"
              onClick={() => {
                onEdit(draft)
                setDraft(null)
              }}
            >
              Save
            </button>
            <button className="text-[11px] text-ink-3" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        )}
        {row.evidence.length > 0 && (
          <div className="mt-0.5 text-[10px] text-ink-3">
            distilled from {row.evidence.length} action(s)
          </div>
        )}
      </td>
      <td className="px-2 py-1 text-right text-[11px] tabular-nums text-ink-3">
        {row.score.toFixed(3)}
      </td>
      <td className="px-2 py-1 text-right">
        <button className="text-[11px] text-red-600 hover:underline" onClick={onForget}>
          Forget
        </button>
      </td>
    </tr>
  )
}

export function MemoryPanel() {
  const state = useMemories()

  if (!state.loading && state.rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <div className="text-sm font-medium">Nothing remembered yet</div>
          <div className="mt-1 text-xs text-ink-3">
            Record one with <code>xnet remember &quot;…&quot;</code>, or propose them from recurring
            agent instructions with <code>xnet distill --apply</code>. Memories are ordinary private
            nodes — they sync, export and delete like anything else here.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-hairline px-3 py-1.5 text-[11px] text-ink-3">
        <span>
          {state.rows.length} memor{state.rows.length === 1 ? 'y' : 'ies'}
        </span>
        <span>● = carried into a session ({state.preambleLimit} highest-ranked)</span>
        {state.profile && (
          <span
            className="ml-auto"
            title={state.profile.reason || 'Locally tuned retrieval weights'}
          >
            profile: hopDecay {state.profile.hopDecay.toFixed(2)} · entries{' '}
            {state.profile.maxEntries}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-island-b">
            <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-wide text-ink-3">
              <th className="px-2 py-1"> </th>
              <th className="px-2 py-1">Kind</th>
              <th className="px-2 py-1">Memory</th>
              <th className="px-2 py-1 text-right">Score</th>
              <th className="px-2 py-1"> </th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map((row, index) => (
              <MemoryRowView
                key={row.id}
                row={row}
                inPreamble={index < state.preambleLimit}
                onEdit={(text) => void state.edit(row.id, text)}
                onForget={() => void state.forget(row.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
