import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  SecurityLogger,
  logSecurityEvent,
  configureSecurityLogger,
  getSecurityLogger
} from '../src/security/logging'

describe('SecurityLogger', () => {
  it('should format events in canonical format', () => {
    const logger = new SecurityLogger({ console: false })

    const formatted = logger.format({
      eventType: 'invalid_signature',
      severity: 'high',
      peerId: 'test-peer-id-12345',
      ip: '192.168.1.1',
      actionTaken: 'blocked'
    })

    expect(formatted).toContain('XNET_SECURITY:')
    expect(formatted).toContain('type=invalid_signature')
    expect(formatted).toContain('severity=high')
    expect(formatted).toContain('ip=192.168.1.1')
    expect(formatted).toContain('action=blocked')
    // Peer ID should be hashed (not raw)
    expect(formatted).not.toContain('test-peer-id-12345')
    expect(formatted).toMatch(/peer=[a-f0-9]+/)
  })

  it('should include ISO timestamp', () => {
    const logger = new SecurityLogger({ console: false })
    const formatted = logger.format({
      eventType: 'rate_limit_exceeded',
      severity: 'low',
      actionTaken: 'throttled'
    })

    // ISO 8601 format
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('should include details when provided', () => {
    const logger = new SecurityLogger({ console: false })
    const formatted = logger.format({
      eventType: 'anomaly_detected',
      severity: 'medium',
      details: { protocol: '/xnet/sync/1.0.0', count: 42 },
      actionTaken: 'logged'
    })

    expect(formatted).toContain('details=')
    expect(formatted).toContain('/xnet/sync/1.0.0')
    expect(formatted).toContain('42')
  })

  it('should truncate long details', () => {
    const logger = new SecurityLogger({ console: false })
    const formatted = logger.format({
      eventType: 'anomaly_detected',
      severity: 'medium',
      details: { data: 'x'.repeat(500) },
      actionTaken: 'logged'
    })

    // Details portion should be truncated to 200 chars
    const detailsPart = formatted.split('details=')[1]
    expect(detailsPart.length).toBeLessThanOrEqual(200)
  })

  it('should use "unknown" for missing peerId and ip', () => {
    const logger = new SecurityLogger({ console: false })
    const formatted = logger.format({
      eventType: 'rate_limit_exceeded',
      severity: 'low',
      actionTaken: 'throttled'
    })

    expect(formatted).toContain('peer=unknown')
    expect(formatted).toContain('ip=unknown')
  })

  it('should call custom handler', () => {
    const handler = vi.fn()
    const logger = new SecurityLogger({ console: false, handler })

    const event = {
      eventType: 'peer_blocked' as const,
      severity: 'medium' as const,
      peerId: 'peer-123',
      actionTaken: 'blocked' as const
    }
    logger.log(event)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toEqual(event)
    expect(handler.mock.calls[0][1]).toContain('XNET_SECURITY:')
  })

  it('should log to console by severity', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const logger = new SecurityLogger({ console: true })

    logger.log({ eventType: 'invalid_signature', severity: 'critical', actionTaken: 'blocked' })
    expect(errorSpy).toHaveBeenCalledTimes(1)

    logger.log({ eventType: 'invalid_signature', severity: 'high', actionTaken: 'blocked' })
    expect(errorSpy).toHaveBeenCalledTimes(2)

    logger.log({ eventType: 'connection_flood', severity: 'medium', actionTaken: 'warned' })
    expect(warnSpy).toHaveBeenCalledTimes(1)

    logger.log({ eventType: 'rate_limit_exceeded', severity: 'low', actionTaken: 'throttled' })
    expect(logSpy).toHaveBeenCalledTimes(1)

    errorSpy.mockRestore()
    warnSpy.mockRestore()
    logSpy.mockRestore()
  })
})

describe('Singleton logger', () => {
  beforeEach(() => {
    // Reset singleton
    configureSecurityLogger({ console: false })
  })

  it('should return same instance', () => {
    const logger1 = getSecurityLogger()
    const logger2 = getSecurityLogger()
    expect(logger1).toBe(logger2)
  })

  it('should allow reconfiguration', () => {
    const handler = vi.fn()
    configureSecurityLogger({ console: false, handler })

    logSecurityEvent({
      eventType: 'peer_blocked',
      severity: 'medium',
      actionTaken: 'blocked'
    })

    expect(handler).toHaveBeenCalledTimes(1)
  })
})
