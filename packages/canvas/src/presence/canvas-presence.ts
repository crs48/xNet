/**
 * Canvas Presence Manager
 *
 * Manages real-time presence state for canvas collaboration via Yjs Awareness.
 * Handles cursor positions, selections, activity states, and user info.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * User presence state for canvas collaboration.
 */
export interface CanvasPresence {
  /** Cursor position in canvas coordinates (null if outside canvas) */
  cursor?: { x: number; y: number }
  /** Currently selected node IDs */
  selection?: string[]
  /** Current viewport state */
  viewport?: { x: number; y: number; zoom: number }
  /** User's current activity */
  activity?: 'idle' | 'dragging' | 'drawing' | 'editing' | 'selecting'
  /** User information */
  user?: {
    name: string
    color: string
    avatar?: string
  }
  /** Node currently being edited (edit lock) */
  editingNodeId?: string
  /** Timestamp of last update */
  lastUpdated?: number
}

/**
 * Minimal Awareness interface (compatible with Yjs y-protocols/awareness)
 */
export interface AwarenessLike {
  clientID: number
  getLocalState(): CanvasPresence | null
  setLocalState(state: CanvasPresence | null): void
  getStates(): Map<number, CanvasPresence>
  on(event: 'change', handler: () => void): void
  off(event: 'change', handler: () => void): void
}

/**
 * Callback for presence changes.
 */
export type PresenceChangeCallback = (states: Map<number, CanvasPresence>) => void

// ─── Throttle Utility ─────────────────────────────────────────────────────────

function throttle<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let lastCall = 0
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return ((...args: Parameters<T>) => {
    const now = Date.now()
    const timeSinceLastCall = now - lastCall

    if (timeSinceLastCall >= delay) {
      lastCall = now
      fn(...args)
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now()
        timeoutId = null
        fn(...args)
      }, delay - timeSinceLastCall)
    }
  }) as T
}

// ─── Canvas Presence Manager ──────────────────────────────────────────────────

/**
 * Manages presence state for canvas collaboration.
 * Broadcasts cursor positions at 30fps and handles selection/activity updates.
 */
export class CanvasPresenceManager {
  private awareness: AwarenessLike
  private localState: CanvasPresence = {}
  private pendingState: Partial<CanvasPresence> = {}
  private throttledBroadcast: () => void
  private disposed = false

  constructor(awareness: AwarenessLike, user?: CanvasPresence['user']) {
    this.awareness = awareness

    // Set initial user info
    if (user) {
      this.localState = { user, lastUpdated: Date.now() }
      this.awareness.setLocalState(this.localState)
    }

    // Throttle cursor broadcasts to ~30fps
    this.throttledBroadcast = throttle(() => {
      if (this.disposed) return

      this.localState = {
        ...this.localState,
        ...this.pendingState,
        lastUpdated: Date.now()
      }
      this.awareness.setLocalState(this.localState)
      this.pendingState = {}
    }, 33)
  }

  /**
   * Update local cursor position (throttled to 30fps).
   * Pass null to clear cursor (e.g., when mouse leaves canvas).
   */
  updateCursor(position: { x: number; y: number } | null): void {
    if (this.disposed) return
    this.pendingState.cursor = position ?? undefined
    this.throttledBroadcast()
  }

  /**
   * Update local selection (immediate, not throttled).
   */
  updateSelection(nodeIds: string[]): void {
    if (this.disposed) return
    this.localState = {
      ...this.localState,
      selection: nodeIds,
      lastUpdated: Date.now()
    }
    this.awareness.setLocalState(this.localState)
  }

  /**
   * Update activity state (throttled).
   */
  updateActivity(activity: CanvasPresence['activity']): void {
    if (this.disposed) return
    this.pendingState.activity = activity
    this.throttledBroadcast()
  }

  /**
   * Update viewport state (throttled).
   */
  updateViewport(viewport: { x: number; y: number; zoom: number }): void {
    if (this.disposed) return
    this.pendingState.viewport = viewport
    this.throttledBroadcast()
  }

  /**
   * Get the local client ID.
   */
  getClientId(): number {
    return this.awareness.clientID
  }

  /**
   * Get all remote presence states (excludes local user).
   */
  getRemotePresence(): Map<number, CanvasPresence> {
    const states = new Map<number, CanvasPresence>()
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId !== this.awareness.clientID && state) {
        states.set(clientId, state)
      }
    })
    return states
  }

  /**
   * Get all presence states including local user.
   */
  getAllPresence(): Map<number, CanvasPresence> {
    return new Map(this.awareness.getStates())
  }

  /**
   * Subscribe to presence changes.
   * Returns an unsubscribe function.
   */
  onPresenceChange(callback: PresenceChangeCallback): () => void {
    const handler = () => {
      if (!this.disposed) {
        callback(this.getRemotePresence())
      }
    }
    this.awareness.on('change', handler)
    return () => this.awareness.off('change', handler)
  }

  /**
   * Get the local state.
   */
  getLocalState(): CanvasPresence {
    return { ...this.localState }
  }

  /**
   * Clear local presence (e.g., on unmount).
   */
  clear(): void {
    if (this.disposed) return
    this.awareness.setLocalState(null)
  }

  /**
   * Dispose the manager.
   */
  dispose(): void {
    // Clear before setting disposed flag so clear() actually executes
    this.awareness.setLocalState(null)
    this.disposed = true
  }
}

/**
 * Create a canvas presence manager.
 */
export function createCanvasPresenceManager(
  awareness: AwarenessLike,
  user?: CanvasPresence['user']
): CanvasPresenceManager {
  return new CanvasPresenceManager(awareness, user)
}

// ─── User Color Utilities ─────────────────────────────────────────────────────

/**
 * Default colors for users.
 */
export const USER_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#84cc16', // Lime
  '#6366f1' // Indigo
]

/**
 * Get a consistent color for a user based on their ID.
 */
export function getUserColor(userId: string | number): string {
  const hash =
    typeof userId === 'string'
      ? userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      : userId
  return USER_COLORS[hash % USER_COLORS.length]
}
