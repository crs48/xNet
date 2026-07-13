import { describe, expect, it } from 'vitest'
import { createLogger, type LogLevel } from './logger'

const capture = () => {
  const lines: Array<{ level: LogLevel; parsed: Record<string, unknown> }> = []
  const sink = (level: LogLevel, line: string) =>
    lines.push({ level, parsed: JSON.parse(line) as Record<string, unknown> })
  return { lines, sink }
}

describe('hub createLogger', () => {
  it('emits one JSON line with ts/level/msg and merged base + fields', () => {
    const { lines, sink } = capture()
    const log = createLogger({ base: { service: 'xnet-hub' }, sink })

    log.error('unhandled', { path: '/relay', error: 'boom' })

    expect(lines).toHaveLength(1)
    expect(lines[0]?.level).toBe('error')
    expect(lines[0]?.parsed).toMatchObject({
      level: 'error',
      msg: 'unhandled',
      service: 'xnet-hub',
      path: '/relay',
      error: 'boom'
    })
    expect(typeof lines[0]?.parsed.ts).toBe('string')
  })

  it('drops lines below the configured level (config.logLevel passthrough)', () => {
    const { lines, sink } = capture()
    const log = createLogger({ level: 'warn', sink })

    log.debug('nope')
    log.info('nope')
    log.warn('kept')

    expect(lines.map((l) => l.parsed.msg)).toEqual(['kept'])
  })

  it('defaults to info when no level is given', () => {
    const { lines, sink } = capture()
    const log = createLogger({ sink })

    log.debug('dropped')
    log.info('kept')

    expect(lines).toHaveLength(1)
  })
})
