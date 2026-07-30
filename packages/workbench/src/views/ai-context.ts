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
 * the conversation history. Returns `[]` when the pack has no resources, so a
 * turn with no relevant context adds nothing.
 */
export function formatContextMessages(pack: AiContextPack | null | undefined): AIMessage[] {
  const resources = pack?.resources ?? []
  if (resources.length === 0) return []

  const blocks = resources.map((resource) => {
    const { kind, id } = resource.citation
    const text =
      resource.text.length > MAX_RESOURCE_CHARS
        ? `${resource.text.slice(0, MAX_RESOURCE_CHARS)}…`
        : resource.text
    return `### ${kind} · ${id}\n${text.trim()}`
  })

  return [
    {
      role: 'system',
      content:
        'Workspace context (read-only, may be incomplete — cite items you use):\n\n' +
        blocks.join('\n\n')
    }
  ]
}
