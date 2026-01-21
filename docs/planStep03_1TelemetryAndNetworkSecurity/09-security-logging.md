# 09: Security Logging

> Canonical security event logging for monitoring and fail2ban integration

**Duration:** 1 day  
**Dependencies:** [07-connection-limits.md](./07-connection-limits.md)

## Overview

Security events are logged in a canonical format that:

1. Is human-readable for debugging
2. Is machine-parseable for fail2ban
3. Can be stored as telemetry (if user consents)
4. Includes anonymized peer info for privacy

## Implementation

### Security Logger

```typescript
// packages/network/src/security/logging.ts

import type { SecurityEvent } from '@xnet/telemetry/schemas'
import { createHash } from '@xnet/crypto'

/**
 * Security event types.
 */
export type SecurityEventType =
  | 'invalid_signature'
  | 'rate_limit_exceeded'
  | 'connection_flood'
  | 'stream_exhaustion'
  | 'invalid_data'
  | 'peer_score_drop'
  | 'peer_blocked'
  | 'peer_unblocked'
  | 'anomaly_detected'

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical'

export type SecurityAction = 'none' | 'logged' | 'warned' | 'throttled' | 'blocked' | 'reported'

export interface SecurityEventData {
  eventType: SecurityEventType
  severity: SecuritySeverity
  peerId?: string
  ip?: string
  details?: Record<string, unknown>
  actionTaken: SecurityAction
}

/**
 * Logger configuration.
 */
export interface SecurityLoggerConfig {
  /** Enable console logging */
  console?: boolean

  /** Enable file logging (Node.js only) */
  file?: string

  /** Enable telemetry reporting */
  telemetry?: boolean

  /** Telemetry collector instance */
  telemetryCollector?: any // TelemetryCollector

  /** Custom log handler */
  handler?: (event: SecurityEventData, formatted: string) => void
}

/**
 * Security event logger.
 */
export class SecurityLogger {
  private config: SecurityLoggerConfig

  constructor(config: SecurityLoggerConfig = {}) {
    this.config = {
      console: true,
      telemetry: false,
      ...config
    }
  }

  /**
   * Log a security event.
   */
  log(event: SecurityEventData): void {
    const formatted = this.format(event)

    // Console output
    if (this.config.console) {
      this.logToConsole(event, formatted)
    }

    // Custom handler
    if (this.config.handler) {
      this.config.handler(event, formatted)
    }

    // Telemetry (async, non-blocking)
    if (this.config.telemetry && this.config.telemetryCollector) {
      this.logToTelemetry(event).catch(console.error)
    }
  }

  /**
   * Format event for logging.
   * Uses canonical format compatible with fail2ban.
   */
  format(event: SecurityEventData): string {
    const timestamp = new Date().toISOString()
    const peerHash = event.peerId ? hashPeerId(event.peerId) : 'unknown'
    const ip = event.ip ?? 'unknown'

    // Canonical format: XNET_SECURITY: key=value key=value ...
    const parts = [
      `type=${event.eventType}`,
      `severity=${event.severity}`,
      `peer=${peerHash}`,
      `ip=${ip}`,
      `action=${event.actionTaken}`
    ]

    if (event.details) {
      // Escape and truncate details
      const detailsStr = JSON.stringify(event.details).replace(/\s+/g, ' ').slice(0, 200)
      parts.push(`details=${detailsStr}`)
    }

    return `${timestamp} XNET_SECURITY: ${parts.join(' ')}`
  }

  private logToConsole(event: SecurityEventData, formatted: string): void {
    // Color code by severity for terminal
    const colors = {
      low: '\x1b[34m', // Blue
      medium: '\x1b[33m', // Yellow
      high: '\x1b[31m', // Red
      critical: '\x1b[35m' // Magenta
    }
    const reset = '\x1b[0m'

    const color = colors[event.severity] ?? reset
    console.log(`${color}${formatted}${reset}`)
  }

  private async logToTelemetry(event: SecurityEventData): Promise<void> {
    if (!this.config.telemetryCollector) return

    await this.config.telemetryCollector.report('xnet://xnet.dev/telemetry/SecurityEvent', {
      eventType: event.eventType,
      severity: event.severity,
      peerIdHash: event.peerId ? hashPeerId(event.peerId) : undefined,
      peerScoreBucket: undefined, // Would be filled by peer scorer
      details: event.details ? JSON.stringify(event.details) : undefined,
      actionTaken: event.actionTaken,
      occurredAt: new Date()
    })
  }
}

// ============ Helpers ============

/**
 * Hash a peer ID for privacy in logs.
 */
function hashPeerId(peerId: string): string {
  // Simple hash for logging (not cryptographically secure, just for privacy)
  let hash = 0
  for (let i = 0; i < peerId.length; i++) {
    const char = peerId.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

// ============ Singleton Logger ============

let defaultLogger: SecurityLogger | null = null

/**
 * Get or create default security logger.
 */
export function getSecurityLogger(): SecurityLogger {
  if (!defaultLogger) {
    defaultLogger = new SecurityLogger()
  }
  return defaultLogger
}

/**
 * Configure the default security logger.
 */
export function configureSecurityLogger(config: SecurityLoggerConfig): void {
  defaultLogger = new SecurityLogger(config)
}

/**
 * Convenience function to log security events.
 */
export function logSecurityEvent(event: SecurityEventData): void {
  getSecurityLogger().log(event)
}
```

### fail2ban Configuration

```bash
# /etc/fail2ban/filter.d/xnet-security.conf

[Definition]
# Match XNET_SECURITY log lines and extract IP
failregex = ^.* XNET_SECURITY: type=(?:invalid_signature|rate_limit_exceeded|connection_flood|stream_exhaustion|invalid_data).* ip=<HOST>
ignoreregex =

# Date pattern (ISO 8601)
datepattern = ^%%Y-%%m-%%dT%%H:%%M:%%S
```

```bash
# /etc/fail2ban/jail.d/xnet.conf

[xnet-security]
enabled = true
filter = xnet-security
action = iptables-allports[name=xnet, protocol=all]
logpath = /var/log/xnet/security.log
maxretry = 5
findtime = 300
bantime = 3600

# Stricter for critical events
[xnet-critical]
enabled = true
filter = xnet-security
failregex = ^.* XNET_SECURITY: type=.* severity=critical.* ip=<HOST>
action = iptables-allports[name=xnet-critical, protocol=all]
logpath = /var/log/xnet/security.log
maxretry = 1
findtime = 60
bantime = 86400
```

### Log Rotation

```bash
# /etc/logrotate.d/xnet

/var/log/xnet/security.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 640 xnet xnet
}
```

## Usage Examples

### Basic Usage

```typescript
import { logSecurityEvent, configureSecurityLogger } from '@xnet/network/security'

// Configure logger (once at startup)
configureSecurityLogger({
  console: true,
  telemetry: true,
  telemetryCollector: telemetryCollector
})

// Log events
logSecurityEvent({
  eventType: 'invalid_signature',
  severity: 'high',
  peerId: '12D3KooWExample...',
  ip: '192.168.1.100',
  details: { changeId: 'abc123' },
  actionTaken: 'blocked'
})

// Output:
// 2026-01-21T12:34:56.789Z XNET_SECURITY: type=invalid_signature severity=high peer=a3f2c1b8 ip=192.168.1.100 action=blocked details={"changeId":"abc123"}
```

### Integration with Rate Limiter

```typescript
import { SyncRateLimiter, logSecurityEvent } from '@xnet/network/security'

const rateLimiter = new SyncRateLimiter()

function handleRequest(peerId: string, ip: string) {
  if (!rateLimiter.canSync(peerId)) {
    logSecurityEvent({
      eventType: 'rate_limit_exceeded',
      severity: 'low',
      peerId,
      ip,
      details: { waitTime: rateLimiter.timeUntilSync(peerId) },
      actionTaken: 'throttled'
    })
    throw new RateLimitError()
  }
}
```

## Tests

```typescript
// packages/network/test/security-logging.test.ts

import { describe, it, expect, vi } from 'vitest'
import { SecurityLogger, logSecurityEvent, configureSecurityLogger } from '../src/security/logging'

describe('SecurityLogger', () => {
  it('should format events in canonical format', () => {
    const logger = new SecurityLogger({ console: false })

    const formatted = logger.format({
      eventType: 'invalid_signature',
      severity: 'high',
      peerId: 'test-peer-id',
      ip: '192.168.1.1',
      actionTaken: 'blocked'
    })

    expect(formatted).toContain('XNET_SECURITY:')
    expect(formatted).toContain('type=invalid_signature')
    expect(formatted).toContain('severity=high')
    expect(formatted).toContain('ip=192.168.1.1')
    expect(formatted).toContain('action=blocked')
    // Peer ID should be hashed
    expect(formatted).not.toContain('test-peer-id')
    expect(formatted).toMatch(/peer=[a-f0-9]+/)
  })

  it('should call custom handler', () => {
    const handler = vi.fn()
    const logger = new SecurityLogger({ console: false, handler })

    logger.log({
      eventType: 'rate_limit_exceeded',
      severity: 'low',
      actionTaken: 'throttled'
    })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].eventType).toBe('rate_limit_exceeded')
  })

  it('should truncate long details', () => {
    const logger = new SecurityLogger({ console: false })

    const formatted = logger.format({
      eventType: 'anomaly_detected',
      severity: 'medium',
      details: { data: 'x'.repeat(500) },
      actionTaken: 'logged'
    })

    // Details should be truncated
    expect(formatted.length).toBeLessThan(400)
  })
})
```

## Checklist

- [ ] Create SecurityLogger class
- [ ] Implement canonical log format
- [ ] Add peer ID hashing for privacy
- [ ] Add console logging with colors
- [ ] Add telemetry integration
- [ ] Create fail2ban filter configuration
- [ ] Create fail2ban jail configuration
- [ ] Document log rotation setup
- [ ] Write tests
- [ ] Tests pass

---

[Back to README](./README.md) | [Previous: Rate Limiting](./08-rate-limiting.md) | [Next: Peer Scoring](./10-peer-scoring.md)
