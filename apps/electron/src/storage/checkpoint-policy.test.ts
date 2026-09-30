import { expect, it, vi } from 'vitest'
import {
  CHECKPOINT_INTERVAL_MS,
  createCheckpointSchedule,
  retainedCheckpointIds
} from './checkpoint-policy'

const now = Date.parse('2026-09-29T12:00:00Z')
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()

it('keeps recent, daily, weekly, pinned, and future-dated points', () => {
  const points = [
    { id: 'newest', createdAt: at(1) },
    { id: 'second', createdAt: at(2) },
    { id: 'duplicate', createdAt: at(3) },
    { id: 'previous-quarter', createdAt: at(16) },
    { id: 'daily', createdAt: at(2 * 1440) },
    { id: 'same-day', createdAt: at(2 * 1440 + 1) },
    { id: 'weekly', createdAt: at(14 * 1440) },
    { id: 'expired', createdAt: at(40 * 1440) },
    { id: 'pinned', createdAt: at(50 * 1440), pinned: true }
  ]
  expect([...retainedCheckpointIds(points, now)].sort()).toEqual([
    'daily',
    'newest',
    'pinned',
    'previous-quarter',
    'second',
    'weekly'
  ])
  expect(retainedCheckpointIds([{ id: 'future', createdAt: at(-5) }], now).has('future')).toBe(true)
})

it('checks changed data only when overdue and retries failed copies', async () => {
  const latest = { createdAt: at(5), sourceFingerprint: 'old' }
  const fingerprint = vi.fn(async () => 'changed')
  const create = vi.fn(async () => {})
  const failed = vi.fn()
  const tick = createCheckpointSchedule({
    now: () => now,
    busy: () => false,
    latest: async () => latest,
    fingerprint,
    create,
    failed
  })
  await tick()
  expect(fingerprint).not.toHaveBeenCalled()
  latest.createdAt = at(16)
  latest.sourceFingerprint = 'changed'
  await tick()
  expect(create).not.toHaveBeenCalled()
  latest.sourceFingerprint = 'old'
  create.mockRejectedValueOnce(new Error('disk full'))
  await tick()
  expect(failed).toHaveBeenCalledWith(expect.objectContaining({ message: 'disk full' }))
  await tick()
  expect(create).toHaveBeenCalledTimes(2)
})

it('does not overlap checks or run while import or recovery is busy', async () => {
  let release!: () => void
  let busy = true
  const create = vi.fn(async () => {})
  const latest = vi.fn(
    () =>
      new Promise<null>((resolve) => {
        release = () => resolve(null)
      })
  )
  const tick = createCheckpointSchedule({
    now: () => now,
    busy: () => busy,
    latest,
    fingerprint: async () => 'first',
    create,
    failed: vi.fn()
  })
  await tick()
  expect(latest).not.toHaveBeenCalled()
  busy = false
  const checking = tick()
  await tick()
  expect(latest).toHaveBeenCalledTimes(1)
  busy = true
  release()
  await checking
  expect(create).not.toHaveBeenCalled()
  expect(CHECKPOINT_INTERVAL_MS).toBe(900_000)
})
