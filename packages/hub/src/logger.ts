/**
 * Tiny zero-dependency structured logger for the hub (exploration 0315 P0).
 *
 * Same shape as the cloud control plane's logger (exploration 0210): one JSON
 * line per event ({ ts, level, msg, ...fields }) to stdout/stderr, honouring
 * the hub's existing `logLevel` config. Zero deps on purpose — self-hosters
 * run this image, and pino would be the package's first logging dependency.
 *
 * Internal module: not exported from the package barrel.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface LoggerOptions {
  /** Minimum level to emit (default `info`; pass `config.logLevel`). */
  level?: LogLevel
  /** Fields merged into every line (e.g. `{ service: 'xnet-hub' }`). */
  base?: Record<string, unknown>
  /** Sink for one finished JSON line; defaults to console. Injectable for tests. */
  sink?: (level: LogLevel, line: string) => void
}

function defaultSink(level: LogLevel, line: string): void {
  const out = level === 'error' || level === 'warn' ? console.error : console.log
  // eslint-disable-next-line no-console
  out(line)
}

/** Build a structured logger. Lines below `level` are dropped cheaply. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const min = LEVEL_ORDER[options.level ?? 'info'] ?? LEVEL_ORDER.info
  const sink = options.sink ?? defaultSink
  const emit = (level: LogLevel, msg: string, fields?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[level] < min) return
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...options.base,
      ...fields
    })
    sink(level, line)
  }
  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields)
  }
}
