/**
 * Awareness/presence tracking for collaborative editing
 */
import { Awareness } from 'y-protocols/awareness'
import type { XDocument } from '../types'

/**
 * User presence information
 */
export interface UserPresence {
  did: string
  name: string
  color: string
  cursor?: CursorPosition
  selection?: SelectionRange
}

/**
 * Cursor position in a document
 */
export interface CursorPosition {
  blockId: string
  offset: number
}

/**
 * Selection range in a document
 */
export interface SelectionRange {
  anchor: CursorPosition
  head: CursorPosition
}

/**
 * Create an awareness instance for a document
 */
export function createAwareness(doc: XDocument): Awareness {
  return new Awareness(doc.ydoc)
}

/**
 * Set local user presence
 */
export function setLocalPresence(awareness: Awareness, presence: UserPresence): void {
  awareness.setLocalState(presence)
}

/**
 * Clear local user presence
 */
export function clearLocalPresence(awareness: Awareness): void {
  awareness.setLocalState(null)
}

/**
 * Get remote user presences
 */
export function getRemotePresences(awareness: Awareness): Map<number, UserPresence> {
  const states = awareness.getStates()
  const result = new Map<number, UserPresence>()
  states.forEach((state, clientId) => {
    if (state && clientId !== awareness.clientID) {
      result.set(clientId, state as UserPresence)
    }
  })
  return result
}

/**
 * Get all presences including local
 */
export function getAllPresences(awareness: Awareness): Map<number, UserPresence> {
  const states = awareness.getStates()
  const result = new Map<number, UserPresence>()
  states.forEach((state, clientId) => {
    if (state) {
      result.set(clientId, state as UserPresence)
    }
  })
  return result
}

/**
 * Subscribe to presence changes
 */
export function onPresenceChange(
  awareness: Awareness,
  callback: (changes: { added: number[]; updated: number[]; removed: number[] }) => void
): () => void {
  awareness.on('change', callback)
  return () => awareness.off('change', callback)
}

/**
 * Get local client ID
 */
export function getLocalClientId(awareness: Awareness): number {
  return awareness.clientID
}

/**
 * Generate a random color for user presence
 */
export function generateUserColor(): string {
  const colors = [
    '#F44336',
    '#E91E63',
    '#9C27B0',
    '#673AB7',
    '#3F51B5',
    '#2196F3',
    '#03A9F4',
    '#00BCD4',
    '#009688',
    '#4CAF50',
    '#8BC34A',
    '#CDDC39',
    '#FFC107',
    '#FF9800',
    '#FF5722'
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}
