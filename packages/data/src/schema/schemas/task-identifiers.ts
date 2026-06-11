/**
 * Short task identifiers (XN-142 style).
 *
 * The human-readable identifier is the hinge of the GitHub integration:
 * it appears in branch names, commit messages, and PR bodies, and the hub
 * pattern-matches it back to Task nodes (exploration 0161, phase 4).
 *
 * Numbers are allocated in per-device blocks handed out by the hub so
 * identifiers minted offline never collide: each client requests a block
 * (e.g. 100 numbers) and assigns locally from it.
 */

/** `XN-142` — 1-5 letter workspace prefix + number */
export const TASK_SHORT_ID_PATTERN = /\b([A-Za-z]{1,5})-(\d{1,8})\b/

export interface ParsedTaskShortId {
  prefix: string
  number: number
}

export function formatTaskShortId(prefix: string, number: number): string {
  return `${prefix.toUpperCase()}-${number}`
}

export function parseTaskShortId(value: string): ParsedTaskShortId | null {
  const match = TASK_SHORT_ID_PATTERN.exec(value.trim())
  if (!match) return null

  const number = Number(match[2])
  if (!Number.isSafeInteger(number) || number <= 0) return null

  return { prefix: match[1].toUpperCase(), number }
}

/**
 * Branch name for a task: `username/xn-142-fix-the-grid`.
 * Mirrors Linear's copy-branch-name mechanic — pushing a branch with the
 * identifier auto-links it to the task.
 */
export function taskBranchName(shortId: string, title: string, username?: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')

  const base = `${shortId.toLowerCase()}${slug ? `-${slug}` : ''}`
  return username ? `${username}/${base}` : base
}

/**
 * A contiguous block of identifier numbers allocated by the hub to one
 * device. Assign locally from `next` until `end` (inclusive), then request
 * a new block.
 */
export interface TaskShortIdBlock {
  prefix: string
  /** First number in the block */
  start: number
  /** Last number in the block (inclusive) */
  end: number
}

export function* shortIdsFromBlock(block: TaskShortIdBlock): Generator<string> {
  for (let n = block.start; n <= block.end; n += 1) {
    yield formatTaskShortId(block.prefix, n)
  }
}
