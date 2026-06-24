import { describe, expect, it, vi } from 'vitest'
import {
  actionLabel,
  clearedMessage,
  createResetActions,
  disabledText,
  disarmState,
  formatError,
  reduceClick
} from './reset-actions'

describe('reduceClick (two-step confirm)', () => {
  it('first click arms and schedules a disarm, without firing', () => {
    expect(reduceClick('idle', false)).toEqual({ next: 'armed', action: 'disarm' })
  })

  it('second click (while armed) fires', () => {
    expect(reduceClick('armed', false)).toEqual({ next: 'running', action: 'fire' })
  })

  it('re-arms from a finished state instead of firing', () => {
    expect(reduceClick('done', false)).toEqual({ next: 'armed', action: 'disarm' })
    expect(reduceClick('error', false)).toEqual({ next: 'armed', action: 'disarm' })
  })

  it('is a no-op while running or disabled', () => {
    expect(reduceClick('running', false)).toEqual({ next: 'running', action: 'none' })
    expect(reduceClick('armed', true)).toEqual({ next: 'armed', action: 'none' })
  })
})

describe('disarmState', () => {
  it('returns to idle only when still armed', () => {
    expect(disarmState('armed')).toBe('idle')
    expect(disarmState('running')).toBe('running')
    expect(disarmState('done')).toBe('done')
  })
})

describe('disabledText', () => {
  it('shows the hint when disabled, else the description', () => {
    expect(disabledText(true, 'hint', 'desc')).toBe('hint')
    expect(disabledText(true, undefined, 'desc')).toBe('desc')
    expect(disabledText(false, 'hint', 'desc')).toBe('desc')
  })
})

describe('labels + messages', () => {
  it('actionLabel reflects the state and danger', () => {
    expect(actionLabel('idle', false)).toBe('Clear')
    expect(actionLabel('idle', true)).toBe('Clear all')
    expect(actionLabel('armed', false)).toBe('Confirm?')
    expect(actionLabel('running', true)).toBe('Working…')
  })

  it('clearedMessage pluralizes', () => {
    expect(clearedMessage(1)).toBe('Cleared 1 change from the hub.')
    expect(clearedMessage(0)).toBe('Cleared 0 changes from the hub.')
    expect(clearedMessage(42)).toBe('Cleared 42 changes from the hub.')
  })

  it('formatError handles Error and non-Error', () => {
    expect(formatError('Clear hub', new Error('boom'))).toBe('Clear hub failed: boom')
    expect(formatError('Clear hub', 'nope')).toBe('Clear hub failed: nope')
  })
})

describe('createResetActions', () => {
  it('runHub reports the hub count', async () => {
    const onResetHub = vi.fn(async () => 7)
    const { runHub } = createResetActions({ onResetLocalData: null, onResetHub })
    await expect(runHub()).resolves.toBe('Cleared 7 changes from the hub.')
    expect(onResetHub).toHaveBeenCalledOnce()
  })

  it('runHub is a no-op message when no hub callback is wired', async () => {
    const { runHub } = createResetActions({ onResetLocalData: null, onResetHub: null })
    await expect(runHub()).resolves.toMatch(/nothing to clear/i)
  })

  it('runLocal throws when no local reset is wired', async () => {
    const { runLocal } = createResetActions({ onResetLocalData: null, onResetHub: null })
    await expect(runLocal()).rejects.toThrow(/not wired/i)
  })

  it('runLocal invokes the host reset', async () => {
    const onResetLocalData = vi.fn(async () => undefined)
    const { runLocal } = createResetActions({ onResetLocalData, onResetHub: null })
    await expect(runLocal()).resolves.toBe('Reloading…')
    expect(onResetLocalData).toHaveBeenCalledOnce()
  })

  it('runEverything clears the hub before the local wipe', async () => {
    const order: string[] = []
    const onResetHub = vi.fn(async () => {
      order.push('hub')
      return 3
    })
    const onResetLocalData = vi.fn(async () => {
      order.push('local')
    })
    const messages: string[] = []
    const { runEverything } = createResetActions({ onResetLocalData, onResetHub })

    await runEverything((m) => messages.push(m))

    expect(order).toEqual(['hub', 'local']) // hub strictly before local
    expect(messages).toContain('Cleared 3 changes from the hub.')
  })

  it('runEverything still wipes local even if the hub clear fails', async () => {
    const onResetHub = vi.fn(async () => {
      throw new Error('offline')
    })
    const onResetLocalData = vi.fn(async () => undefined)
    const messages: string[] = []
    const { runEverything } = createResetActions({ onResetLocalData, onResetHub })

    await expect(runEverything((m) => messages.push(m))).resolves.toBe('Reloading…')
    expect(onResetLocalData).toHaveBeenCalledOnce()
    expect(messages.some((m) => /Hub clear failed: offline/.test(m))).toBe(true)
  })
})
