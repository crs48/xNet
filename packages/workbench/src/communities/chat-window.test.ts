import { describe, expect, it } from 'vitest'
import { CHAT_WINDOW_SIZE, chronologicalWindow, moveChatWindow } from './chat-window'

describe('bounded chat history', () => {
  const database = Array.from({ length: 10_001 }, (_, index) => `message-${index}`)
  const read = (offset: number) =>
    chronologicalWindow(database.slice(offset, offset + CHAT_WINDOW_SIZE))

  it('reaches every message in both directions without growing the loaded window', () => {
    let offset = 0
    let previous = read(offset)
    const seen = new Set(previous)
    while (offset + CHAT_WINDOW_SIZE < database.length) {
      offset = moveChatWindow(offset, 'older')
      const next = read(offset)
      expect(next.length).toBeLessThanOrEqual(CHAT_WINDOW_SIZE)
      // The oldest visible anchor survives replacing the newer half of the window.
      expect(next).toContain(previous[0])
      next.forEach((id) => seen.add(id))
      previous = next
    }
    expect(seen.size).toBe(database.length)
    while (offset > 0) {
      offset = moveChatWindow(offset, 'newer')
      const next = read(offset)
      expect(next).toContain(previous[previous.length - 1])
      expect(next.length).toBeLessThanOrEqual(CHAT_WINDOW_SIZE)
      previous = next
    }
    expect(read(offset)).toEqual(read(0))
    expect(moveChatWindow(offset, 'newer')).toBe(0)
  })

  it('preserves the database tiebreak across overlapping windows with equal timestamps', () => {
    const tied = database.map((id) => ({ id, createdAt: 123 }))
    const first = chronologicalWindow(tied.slice(0, CHAT_WINDOW_SIZE))
    const second = chronologicalWindow(
      tied.slice(moveChatWindow(0, 'older'), moveChatWindow(0, 'older') + CHAT_WINDOW_SIZE)
    )
    const common = new Set(first.map((message) => message.id))
    expect(second.filter((message) => common.has(message.id))).toEqual(
      first.filter((message) => second.includes(message))
    )
    expect(tied[0].id).toBe(database[0])
  })
})
