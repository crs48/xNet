import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const child = vi.hoisted(() => ({
  handlers: new Map<string, (value: unknown) => void>(),
  postMessage: vi.fn(),
  on: vi.fn((event: string, handler: (value: unknown) => void) => {
    child.handlers.set(event, handler)
  })
}))
vi.mock('electron', () => ({
  utilityProcess: { fork: () => child },
  app: { getAppPath: () => '/test/app' },
  ipcMain: { handle: vi.fn() },
  MessageChannelMain: vi.fn()
}))

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  child.handlers.clear()
  child.postMessage.mockClear()
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

const ready = () => child.handlers.get('message')!({ type: 'ready' })
const respond = (error?: string) =>
  child.handlers.get('message')!({
    type: 'response',
    requestId: child.postMessage.mock.lastCall![0].requestId,
    error
  })

it('waits for a large workspace inspection beyond the ordinary request deadline', async () => {
  const manager = await import('./data-process-manager')
  let state = 'waiting'
  const opened = manager.spawnDataProcess('/test/data.db').then(
    () => {
      state = 'ready'
    },
    (error: Error) => {
      state = error.message
    }
  )
  ready()
  await vi.advanceTimersByTimeAsync(360_000)
  expect(state).toBe('waiting')
  respond()
  await opened
  expect(state).toBe('ready')

  const request = expect(manager.sendDataProcessRequest('query', {})).rejects.toThrow(
    'Request query timed out'
  )
  await vi.advanceTimersByTimeAsync(30_000)
  await request
})

it('still fails an initialization that never replies within ten minutes', async () => {
  const manager = await import('./data-process-manager')
  const opened = expect(manager.spawnDataProcess('/test/data.db')).rejects.toThrow(
    'Request init timed out'
  )
  ready()
  await vi.advanceTimersByTimeAsync(600_000)
  await opened
})

it('propagates an integrity-check failure immediately', async () => {
  const manager = await import('./data-process-manager')
  const opened = expect(manager.spawnDataProcess('/test/data.db')).rejects.toThrow(
    'SQLite integrity check failed'
  )
  ready()
  respond('SQLite integrity check failed')
  await opened
})
