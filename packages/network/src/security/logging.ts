/**
 * SecurityLogger - canonical security event logging.
 *
 * Format: "{ISO} XNET_SECURITY: type=X severity=X peer=HASH ip=X action=X details=JSON"
 * Compatible with fail2ban for automated blocking.
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

export interface SecurityLoggerConfig {
  /** Enable console logging (default: true) */
  console?: boolean
  /** Custom log handler (e.g., file writer, telemetry) */
  handler?: (event: SecurityEventData, formatted: string) => void
}

export class SecurityLogger {
  private config: Required<Pick<SecurityLoggerConfig, 'console'>> & SecurityLoggerConfig

  constructor(config: SecurityLoggerConfig = {}) {
    this.config = { console: true, ...config }
  }

  /** Log a security event. */
  log(event: SecurityEventData): void {
    const formatted = this.format(event)

    if (this.config.console) {
      this.logToConsole(event, formatted)
    }

    if (this.config.handler) {
      this.config.handler(event, formatted)
    }
  }

  /** Format event in canonical fail2ban-compatible format. */
  format(event: SecurityEventData): string {
    const timestamp = new Date().toISOString()
    const peerHash = event.peerId ? hashPeerId(event.peerId) : 'unknown'
    const ip = event.ip ?? 'unknown'

    const parts = [
      `type=${event.eventType}`,
      `severity=${event.severity}`,
      `peer=${peerHash}`,
      `ip=${ip}`,
      `action=${event.actionTaken}`
    ]

    if (event.details) {
      const detailsStr = JSON.stringify(event.details).replace(/\s+/g, ' ').slice(0, 200)
      parts.push(`details=${detailsStr}`)
    }

    return `${timestamp} XNET_SECURITY: ${parts.join(' ')}`
  }

  private logToConsole(event: SecurityEventData, formatted: string): void {
    switch (event.severity) {
      case 'critical':
      case 'high':
        console.error(formatted)
        break
      case 'medium':
        console.warn(formatted)
        break
      default:
        console.log(formatted)
    }
  }
}

// ============ Singleton ============

let defaultLogger: SecurityLogger | null = null

/** Get or create default security logger. */
export function getSecurityLogger(): SecurityLogger {
  if (!defaultLogger) {
    defaultLogger = new SecurityLogger()
  }
  return defaultLogger
}

/** Configure the default security logger. */
export function configureSecurityLogger(config: SecurityLoggerConfig): void {
  defaultLogger = new SecurityLogger(config)
}

/** Convenience function to log security events. */
export function logSecurityEvent(event: SecurityEventData): void {
  getSecurityLogger().log(event)
}

// ============ Helpers ============

/** Hash a peer ID for privacy in logs (not cryptographic, just obfuscation). */
function hashPeerId(peerId: string): string {
  let hash = 0
  for (let i = 0; i < peerId.length; i++) {
    const char = peerId.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}
