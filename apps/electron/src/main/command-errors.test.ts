import { describe, expect, it } from 'vitest'
import { formatCommandFailure } from './command-errors'

describe('command-errors', () => {
  it('formats missing command failures with recovery guidance', () => {
    const error = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' })

    expect(formatCommandFailure('git', ['status'], '/tmp/xnet', error)).toContain('Install Git')
  })

  it('preserves the original failure message for non-ENOENT errors', () => {
    const error = new Error('fatal: not a git repository')

    expect(formatCommandFailure('git', ['status'], '/tmp/xnet', error)).toContain(
      'fatal: not a git repository'
    )
  })
})
