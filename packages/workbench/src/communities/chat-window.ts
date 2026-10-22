// Overlapping windows keep the visible message available while either edge is replaced.
export const CHAT_WINDOW_SIZE = 300
export const CHAT_WINDOW_STEP = 150

export function moveChatWindow(offset: number, direction: 'older' | 'newer'): number {
  return direction === 'older' ? offset + CHAT_WINDOW_STEP : Math.max(0, offset - CHAT_WINDOW_STEP)
}

export function chronologicalWindow<T>(newestFirst: readonly T[]): T[] {
  // Reverse the database's complete ordering, including its ID tiebreak. Sorting
  // timestamps again would reorder equal-time messages at page boundaries.
  return [...newestFirst].reverse()
}
