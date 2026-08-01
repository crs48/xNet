/**
 * In-turn permission broker for the bridge daemon (exploration 0416, closing
 * 0392's last panel item).
 *
 * A framed agent turn is a one-way SSE stream, so until now a
 * `permission_request` frame could only be *displayed* — the panel had no way
 * to answer it, and the agent's own consent flow made the decision. That is
 * exactly backwards for the accountability story: the whole point of ADR-29 is
 * that the human's decision must be xNet's to record, not the harness's to
 * report.
 *
 * This parks the agent's request mid-turn and hands the panel a correlation id
 * to settle it with. Two rules make it safe rather than merely convenient:
 *
 *   - **Default deny.** A request that expires, or that arrives while nothing
 *     is listening, is denied. Silence is never consent.
 *   - **The launch flag stays the ceiling.** Per-action approval can only ever
 *     narrow what `--allow-writes` already permits; approving in chat cannot
 *     grant a capability the daemon was not started with.
 */

export type PendingPermission = {
  id: string
  tool: string
  input?: unknown
  expiresAt: number
}

export type PermissionBrokerOptions = {
  /** How long a parked request waits before denying itself. Default 5 min. */
  ttlMs?: number
  clock?: () => number
  /** Called when a request parks, so the caller can emit the frame. */
  onPark?: (pending: PendingPermission) => void
  /**
   * The ceiling: whether the daemon was launched with writes allowed at all.
   * When false, every request is denied without ever reaching a human — asking
   * would imply the answer could be yes.
   */
  writesAllowed?: boolean
}

export type PermissionBroker = {
  /**
   * Park a request and resolve when it is settled, denied, or expires.
   * Never rejects — a permission question always has an answer.
   */
  request(tool: string, input?: unknown): Promise<boolean>
  /** Settle a parked request. Returns false if the id is unknown or expired. */
  settle(id: string, approved: boolean): boolean
  /** Currently parked requests (for a panel that reconnects mid-turn). */
  list(): PendingPermission[]
  /** Deny everything still parked — called when a turn ends or the client goes. */
  denyAll(): void
}

const DEFAULT_TTL_MS = 5 * 60 * 1000

export function createPermissionBroker(options: PermissionBrokerOptions = {}): PermissionBroker {
  const { ttlMs = DEFAULT_TTL_MS, clock = () => Date.now(), onPark, writesAllowed = true } = options

  type Entry = PendingPermission & {
    resolve: (approved: boolean) => void
    timer?: ReturnType<typeof setTimeout>
  }
  const parked = new Map<string, Entry>()
  let nextId = 1

  const finish = (id: string, approved: boolean): boolean => {
    const entry = parked.get(id)
    if (!entry) return false
    parked.delete(id)
    if (entry.timer) clearTimeout(entry.timer)
    entry.resolve(approved)
    return true
  }

  return {
    request(tool, input) {
      // The ceiling check happens before parking: never ask a question whose
      // only correct answer is no.
      if (!writesAllowed) return Promise.resolve(false)

      const id = `perm-${nextId++}`
      const expiresAt = clock() + ttlMs

      return new Promise<boolean>((resolve) => {
        const entry: Entry = { id, tool, input, expiresAt, resolve }
        // Deny on expiry — an unanswered prompt is not an approval.
        entry.timer = setTimeout(() => finish(id, false), ttlMs)
        // Node keeps the process alive for pending timers; this one must not.
        entry.timer.unref?.()
        parked.set(id, entry)
        onPark?.({ id, tool, input, expiresAt })
      })
    },

    settle(id, approved) {
      return finish(id, approved)
    },

    list() {
      return [...parked.values()].map(({ id, tool, input, expiresAt }) => ({
        id,
        tool,
        input,
        expiresAt
      }))
    },

    denyAll() {
      for (const id of [...parked.keys()]) finish(id, false)
    }
  }
}
