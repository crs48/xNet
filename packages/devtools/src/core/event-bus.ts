/**
 * DevToolsEventBus - A typed, memory-bounded ring buffer event bus
 *
 * Receives typed events from instrumentation wrappers and stores them in a
 * fixed-size ring buffer. Panels subscribe to live events and replay history.
 */

import type { DevToolsEvent, DevToolsEventInput, DevToolsEventType, EventOfType } from './types'

export interface DevToolsEventBusOptions {
  /** Ring buffer capacity (default: 10_000) */
  maxEvents?: number
  /** Start paused (default: false) */
  paused?: boolean
}

type EventListener = (event: DevToolsEvent) => void
type TypedListener<T extends DevToolsEventType> = (event: EventOfType<T>) => void

export class DevToolsEventBus {
  private buffer: (DevToolsEvent | undefined)[]
  private head = 0
  private count = 0
  private nextId = 0
  private _paused: boolean

  private globalListeners = new Set<EventListener>()
  private typedListeners = new Map<DevToolsEventType, Set<EventListener>>()

  constructor(private options: DevToolsEventBusOptions = {}) {
    const capacity = options.maxEvents ?? 10_000
    this.buffer = new Array(capacity)
    this._paused = options.paused ?? false
  }

  // ─── Emitting ──────────────────────────────────────────

  /**
   * Emit an event into the bus. The id, timestamp, and wallTime fields
   * are automatically populated.
   */
  emit(event: DevToolsEventInput): void {
    if (this._paused) return

    const fullEvent: DevToolsEvent = {
      ...event,
      id: String(this.nextId++),
      timestamp: performance.now(),
      wallTime: Date.now()
    } as DevToolsEvent

    // Write to ring buffer
    const capacity = this.buffer.length
    this.buffer[this.head] = fullEvent
    this.head = (this.head + 1) % capacity
    this.count = Math.min(this.count + 1, capacity)

    // Notify global listeners
    this.globalListeners.forEach((fn) => {
      try {
        fn(fullEvent)
      } catch (e) {
        console.error('[DevTools] Listener error:', e)
      }
    })

    // Notify typed listeners
    const typed = this.typedListeners.get(fullEvent.type as DevToolsEventType)
    typed?.forEach((fn) => {
      try {
        fn(fullEvent)
      } catch (e) {
        console.error('[DevTools] Listener error:', e)
      }
    })
  }

  // ─── Subscribing ───────────────────────────────────────

  /** Subscribe to all events. Returns an unsubscribe function. */
  subscribe(listener: EventListener): () => void {
    this.globalListeners.add(listener)
    return () => {
      this.globalListeners.delete(listener)
    }
  }

  /** Subscribe to a specific event type. Returns an unsubscribe function. */
  on<T extends DevToolsEventType>(type: T, listener: TypedListener<T>): () => void {
    if (!this.typedListeners.has(type)) {
      this.typedListeners.set(type, new Set())
    }
    this.typedListeners.get(type)!.add(listener as EventListener)
    return () => {
      this.typedListeners.get(type)?.delete(listener as EventListener)
    }
  }

  // ─── Querying ──────────────────────────────────────────

  /** Get all events in chronological order */
  getEvents(): DevToolsEvent[] {
    if (this.count === 0) return []
    const capacity = this.buffer.length

    if (this.count < capacity) {
      return this.buffer.slice(0, this.count) as DevToolsEvent[]
    }

    // Buffer is full - read from head (oldest) wrapping around
    return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)] as DevToolsEvent[]
  }

  /** Get events of a specific type */
  getEventsByType<T extends DevToolsEventType>(type: T): EventOfType<T>[] {
    return this.getEvents().filter((e) => e.type === type) as EventOfType<T>[]
  }

  /** Get events for a specific node */
  getEventsForNode(nodeId: string): DevToolsEvent[] {
    return this.getEvents().filter(
      (e) => ('nodeId' in e && e.nodeId === nodeId) || ('docId' in e && e.docId === nodeId)
    )
  }

  /** Get the last N events */
  getRecent(n: number): DevToolsEvent[] {
    const all = this.getEvents()
    return all.slice(-n)
  }

  // ─── Control ───────────────────────────────────────────

  pause(): void {
    this._paused = true
  }

  resume(): void {
    this._paused = false
  }

  get isPaused(): boolean {
    return this._paused
  }

  clear(): void {
    this.buffer = new Array(this.buffer.length)
    this.head = 0
    this.count = 0
  }

  get size(): number {
    return this.count
  }

  get capacity(): number {
    return this.buffer.length
  }
}
