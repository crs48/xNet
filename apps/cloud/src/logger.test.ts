import { describe, expect, it } from 'vitest'
import { createLogger, type LogLevel } from './logger'

function capture(level?: LogLevel, base?: Record<string, unknown>) {
  const lines: { level: LogLevel; obj: Record<string, unknown> }[] = []
  const logger = createLogger({
    level,
    base,
    sink: (lvl, line) => lines.push({ level: lvl, obj: JSON.parse(line) })
  })
  return { logger, lines }
}

describe('createLogger', () => {
  it('emits one JSON line per event with ts/level/msg and merged base fields', () => {
    const { logger, lines } = capture('debug', { service: 'xnet-cloud' })
    logger.info('request', { path: '/health', status: 200 })

    expect(lines).toHaveLength(1)
    expect(lines[0]?.obj).toMatchObject({
      level: 'info',
      msg: 'request',
      service: 'xnet-cloud',
      path: '/health',
      status: 200
    })
    expect(typeof lines[0]?.obj.ts).toBe('string')
  })

  it('drops lines below the configured level', () => {
    const { logger, lines } = capture('warn')
    logger.debug('noisy')
    logger.info('also noisy')
    logger.warn('kept')
    logger.error('kept too')

    expect(lines.map((l) => l.level)).toEqual(['warn', 'error'])
  })

  it('routes warn/error to the error channel and info/debug to the log channel', () => {
    const channels: string[] = []
    const logger = createLogger({
      level: 'debug',
      sink: (level) => channels.push(level === 'error' || level === 'warn' ? 'err' : 'out')
    })
    logger.debug('a')
    logger.info('b')
    logger.warn('c')
    logger.error('d')
    expect(channels).toEqual(['out', 'out', 'err', 'err'])
  })
})
