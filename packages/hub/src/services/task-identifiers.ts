/**
 * @xnetjs/hub - Short task identifier allocation.
 *
 * Hands out contiguous per-device number blocks for `XN-142`-style task
 * identifiers. Clients assign locally from their block, so identifiers
 * minted offline never collide across devices (exploration 0161,
 * phase 4 / risk: identifier collisions in a multi-writer world).
 */

export interface TaskShortIdBlock {
  prefix: string
  /** First number in the block */
  start: number
  /** Last number in the block (inclusive) */
  end: number
}

export interface AllocateBlockInput {
  /** Workspace the counter belongs to */
  workspaceId: string
  /** Identifier prefix, e.g. "XN" (1-5 letters) */
  prefix: string
  /** Numbers requested (clamped to [1, 1000]) */
  size?: number
}

const DEFAULT_BLOCK_SIZE = 100
const MAX_BLOCK_SIZE = 1000
const PREFIX_PATTERN = /^[A-Za-z]{1,5}$/

export class TaskIdentifierError extends Error {
  readonly code: 'INVALID_PREFIX' | 'INVALID_WORKSPACE'

  constructor(code: 'INVALID_PREFIX' | 'INVALID_WORKSPACE', message: string) {
    super(message)
    this.name = 'TaskIdentifierError'
    this.code = code
  }
}

/**
 * In-memory allocator backing `/tasks/short-ids` endpoints. Counters are
 * keyed by workspace + prefix; allocation is strictly monotonic so a block
 * is never handed out twice.
 */
export class TaskIdentifierService {
  private readonly counters = new Map<string, number>()

  allocateBlock(input: AllocateBlockInput): TaskShortIdBlock {
    const workspaceId = input.workspaceId?.trim()
    if (!workspaceId) {
      throw new TaskIdentifierError('INVALID_WORKSPACE', 'workspaceId is required')
    }

    const prefix = input.prefix?.trim().toUpperCase()
    if (!prefix || !PREFIX_PATTERN.test(prefix)) {
      throw new TaskIdentifierError('INVALID_PREFIX', 'prefix must be 1-5 letters')
    }

    const size = Math.max(1, Math.min(Math.floor(input.size ?? DEFAULT_BLOCK_SIZE), MAX_BLOCK_SIZE))
    const key = `${workspaceId}::${prefix}`
    const start = (this.counters.get(key) ?? 0) + 1
    const end = start + size - 1

    this.counters.set(key, end)

    return { prefix, start, end }
  }

  /** Highest allocated number for a workspace prefix (0 = none) */
  highestAllocated(workspaceId: string, prefix: string): number {
    return this.counters.get(`${workspaceId.trim()}::${prefix.trim().toUpperCase()}`) ?? 0
  }
}
