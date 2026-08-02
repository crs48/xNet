/**
 * Workspace grounding for the AI chat panel (exploration 0192, Phase 1).
 *
 * Turns a read-only {@link AiContextPack} (from `AiSurfaceService.createContextPack`)
 * into the system messages the runtime injects ahead of the conversation, so the
 * assistant can answer about the user's actual pages/databases/nodes instead of
 * guessing. Pure + tested — no store, no network.
 */

import type { AiContextPack, AIMessage } from '@xnetjs/plugins'

/** Standing instructions for the in-app assistant. */
export const AI_SYSTEM_PROMPT = [
  "You are xNet, a helpful assistant embedded in the user's local-first workspace.",
  'You may be given read-only "Workspace context" gathered from the user\'s own pages,',
  'databases, and nodes. Ground your answers in that context and cite the relevant',
  'item (by title or id) when you use it. If the context does not contain the answer,',
  'say so plainly rather than inventing details. This in-app chat is read-only: you can',
  'answer and cite context but not edit the workspace directly, so when asked to make',
  'changes, explain what you would change and ask the user to apply it.'
].join(' ')

/** Cap per-resource text so a few large pages can't blow the context window. */
const MAX_RESOURCE_CHARS = 2000

/**
 * Format a context pack into the (zero or one) system messages to inject before
 * the conversation history.
 *
 * A degraded retrieval produces a message even with zero resources — an empty
 * result from a bounded substring scan is precisely the case where the model
 * would otherwise assert "there is no such thing" from a search that never
 * looked (exploration 0424).
 */
export function formatContextMessages(pack: AiContextPack | null | undefined): AIMessage[] {
  const resources = pack?.resources ?? []
  const notice = pack?.retrieval?.degraded ? pack.retrieval.notice : undefined
  if (resources.length === 0 && !notice) return []

  const blocks = resources.map((resource) => {
    const { kind, id, path } = resource.citation
    const text =
      resource.text.length > MAX_RESOURCE_CHARS
        ? `${resource.text.slice(0, MAX_RESOURCE_CHARS)}…`
        : resource.text
    // The path is how this item was reached from the query's entry node — the
    // provenance the retriever computed and the pack used to discard.
    const heading = path ? `### ${kind} · ${id} (via ${path})` : `### ${kind} · ${id}`
    return `${heading}\n${text.trim()}`
  })

  const header = notice
    ? `Workspace context (read-only, INCOMPLETE — ${notice} Say so if you cannot answer):`
    : 'Workspace context (read-only, may be incomplete — cite items you use):'

  return [
    {
      role: 'system',
      content: blocks.length > 0 ? `${header}\n\n${blocks.join('\n\n')}` : header
    }
  ]
}
