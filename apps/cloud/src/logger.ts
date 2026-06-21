/**
 * Tiny zero-dependency structured logger (exploration 0210).
 *
 * The control plane had exactly one `console.log` and no global error handling,
 * so a failing request or a thrown handler left no diagnosable trace. This emits
 * one JSON line per event ({ ts, level, msg, ...fields }) to stdout/stderr —
 * enough for Cloud Run log-based metrics and for an optional Sentry bridge —
 * without adding pino (which would be the app's first logging dependency and
 * pull transitive deps into the image).
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
  /** Minimum level to emit (default `info`, or `LOG_LEVEL` env). */
  level?: LogLevel
  /** Fields merged into every line (e.g. `{ service: 'xnet-cloud' }`). */
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
  const configured = options.level ?? (process.env.LOG_LEVEL as LogLevel | undefined)
  const min = LEVEL_ORDER[configured ?? 'info'] ?? LEVEL_ORDER.info
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
