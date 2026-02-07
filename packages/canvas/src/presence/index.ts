/**
 * Presence Module
 *
 * Real-time presence management for canvas collaboration.
 */

export {
  CanvasPresenceManager,
  createCanvasPresenceManager,
  USER_COLORS,
  getUserColor,
  type CanvasPresence,
  type AwarenessLike,
  type PresenceChangeCallback
} from './canvas-presence'

export {
  SelectionLockManager,
  createSelectionLockManager,
  type SelectionLock
} from './selection-lock'
