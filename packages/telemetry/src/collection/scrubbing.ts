/**
 * PII Scrubbing - removes personally identifiable information from telemetry data.
 *
 * Patterns: file paths, emails, IPs, URL params, tokens, UUIDs, DIDs.
 */

export interface ScrubOptions {
  scrubPaths: boolean
  scrubEmails: boolean
  scrubIPs: boolean
  scrubUrlParams: boolean
  scrubCustom?: RegExp[]
  customReplacement?: string
}

export const DEFAULT_SCRUB_OPTIONS: ScrubOptions = {
  scrubPaths: true,
  scrubEmails: true,
  scrubIPs: true,
  scrubUrlParams: true
}

// Patterns
const MAC_PATH = /\/Users\/[^/\s]+/g
const LINUX_PATH = /\/home\/[^/\s]+/g
const WIN_PATH = /[A-Z]:\\Users\\[^\\\s]+/g
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const IPV4 = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
const IPV6 = /\b[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4}){7}\b/g
const URL_PARAMS = /\?[^\s#"']+/g
const TOKEN = /\b[a-zA-Z0-9_-]{32,}\b/g
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const DID = /did:[a-z]+:[^\s,"')}]+/g

function scrubString(str: string, options: ScrubOptions): string {
  let result = str

  if (options.scrubPaths) {
    result = result.replace(MAC_PATH, '/Users/[USER]')
    result = result.replace(LINUX_PATH, '/home/[USER]')
    result = result.replace(WIN_PATH, 'C:\\Users\\[USER]')
  }

  if (options.scrubEmails) {
    result = result.replace(EMAIL, '[EMAIL]')
  }

  if (options.scrubIPs) {
    result = result.replace(IPV4, '[IP]')
    result = result.replace(IPV6, '[IP]')
  }

  if (options.scrubUrlParams) {
    result = result.replace(URL_PARAMS, '?[PARAMS]')
  }

  // Always scrub tokens, UUIDs, DIDs
  result = result.replace(UUID, '[UUID]')
  result = result.replace(DID, 'did:method:[REDACTED]')
  result = result.replace(TOKEN, '[TOKEN]')

  if (options.scrubCustom) {
    const replacement = options.customReplacement ?? '[REDACTED]'
    for (const pattern of options.scrubCustom) {
      result = result.replace(pattern, replacement)
    }
  }

  return result
}

function scrubValue(value: unknown, options: ScrubOptions): unknown {
  if (typeof value === 'string') {
    return scrubString(value, options)
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubValue(v, options))
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      result[k] = scrubValue(v, options)
    }
    return result
  }
  return value
}

/**
 * Scrub PII from telemetry data.
 * Recursively processes all string values in the object.
 */
export function scrubTelemetryData<T extends Record<string, unknown>>(
  data: T,
  options: Partial<ScrubOptions> = {}
): T {
  const opts: ScrubOptions = { ...DEFAULT_SCRUB_OPTIONS, ...options }
  return scrubValue(data, opts) as T
}
