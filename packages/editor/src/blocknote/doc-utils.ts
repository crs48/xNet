/**
 * Block-JSON document walkers (0312). Replace the TipTap JSON utilities in
 * utils/mentions.ts and utils/hashtags.ts, preserving the host contracts:
 * the composer — not the reader — declares mentions/tags (0168/0169).
 */

/** Loose structural view of a BlockNote block tree (schema-agnostic). */
export interface BlockLike {
  id?: string
  type?: string
  props?: Record<string, unknown>
  content?: unknown
  children?: BlockLike[]
}

interface InlineLike {
  type?: string
  text?: string
  props?: Record<string, unknown>
  content?: InlineLike[] | string
  href?: string
}

const DID_PATTERN = /^did:[a-z]+:[a-zA-Z0-9._:-]+$/

function inlineItems(content: unknown): InlineLike[] {
  if (!Array.isArray(content)) return []
  return content as InlineLike[]
}

function walkInline(content: unknown, visit: (item: InlineLike) => void): void {
  for (const item of inlineItems(content)) {
    visit(item)
    if (Array.isArray(item.content)) {
      walkInline(item.content, visit)
    }
  }
}

export function walkBlocks(blocks: BlockLike[], visit: (block: BlockLike) => void): void {
  for (const block of blocks) {
    visit(block)
    if (block.children?.length) walkBlocks(block.children, visit)
  }
}

/** All DIDs mentioned via pills in the document, deduped, in walk order. */
export function extractMentionDids(blocks: BlockLike[] | null | undefined): string[] {
  const dids = new Set<string>()
  if (!blocks) return []
  walkBlocks(blocks, (block) => {
    walkInline(block.content, (item) => {
      if (item.type !== 'mention') return
      const id = item.props?.id
      if (typeof id === 'string' && DID_PATTERN.test(id)) dids.add(id)
    })
  })
  return [...dids]
}

/**
 * The structured `mentions` value for a composed document, or undefined
 * when nothing is mentioned (so the property is omitted entirely).
 */
export function mentionsFromDoc(
  blocks: BlockLike[] | null | undefined
): { dids: string[] } | undefined {
  const dids = extractMentionDids(blocks)
  return dids.length > 0 ? { dids } : undefined
}

/** Deduped Tag node ids of every hashtag pill, in walk order (0169). */
export function extractTagIds(blocks: BlockLike[] | null | undefined): string[] {
  const ids = new Set<string>()
  if (!blocks) return []
  walkBlocks(blocks, (block) => {
    walkInline(block.content, (item) => {
      if (item.type !== 'hashtag') return
      const id = item.props?.id
      if (typeof id === 'string' && id) ids.add(id)
    })
  })
  return [...ids]
}

/** The structured `tags` value, or undefined when the doc has no pills. */
export function tagsFromDoc(blocks: BlockLike[] | null | undefined): string[] | undefined {
  const ids = extractTagIds(blocks)
  return ids.length > 0 ? ids : undefined
}

/** Plain text of a block's inline content (labels for chips). */
export function blockInlineText(block: BlockLike): string {
  let out = ''
  walkInline(block.content, (item) => {
    if (typeof item.text === 'string') out += item.text
    else if (item.type === 'mention') out += `@${String(item.props?.label ?? '')}`
    else if (item.type === 'hashtag') out += `#${String(item.props?.name ?? '')}`
    else if (item.type === 'wikilink') out += String(item.props?.title ?? '')
    else if (item.type === 'link' && Array.isArray(item.content)) {
      for (const child of item.content) {
        if (typeof child.text === 'string') out += child.text
      }
    }
  })
  return out
}

// --- Page-backed checklist tasks (0103/0161, re-keyed to block ids 0312) ---

export interface PageTaskReferenceSnapshot {
  url: string
  title: string | null
}

export interface PageTaskSnapshot {
  taskId: string
  blockId: string
  title: string
  completed: boolean
  parentTaskId: string | null
  sortKey: string
  assignees: string[]
  dueDate: string | null
  references: PageTaskReferenceSnapshot[]
}

/** Deterministic task node id for a checklist block (stable across edits). */
export function pageTaskIdForBlock(pageId: string, blockId: string): string {
  return `page-task-${pageId}-${blockId}`
}

/**
 * Snapshot every checkListItem block as a page task. BlockNote block ids
 * are stable, so identity survives edits and moves; nesting comes from
 * block children. Assignee/due-date metadata now lives only on the task
 * node (the LWW log), not in the document.
 */
export function getPageTasksSnapshot(
  blocks: BlockLike[] | null | undefined,
  pageId: string
): PageTaskSnapshot[] {
  const tasks: PageTaskSnapshot[] = []
  if (!blocks) return tasks

  const visit = (block: BlockLike, parentTaskId: string | null, path: number[]): void => {
    let taskId = parentTaskId
    if (block.type === 'checkListItem' && block.id) {
      taskId = pageTaskIdForBlock(pageId, block.id)
      tasks.push({
        taskId,
        blockId: block.id,
        title: blockInlineText(block),
        completed: block.props?.checked === true,
        parentTaskId,
        sortKey: path.map((n) => String(n).padStart(6, '0')).join('.'),
        assignees: [],
        dueDate: null,
        references: []
      })
    }
    block.children?.forEach((child, index) => visit(child, taskId, [...path, index]))
  }

  blocks.forEach((block, index) => visit(block, null, [index]))
  return tasks
}
