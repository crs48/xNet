/**
 * Lenient statement-date parsing for imports (exploration 0187).
 *
 * Bank exports use a zoo of date formats. We parse the common ones into a Unix
 * ms timestamp anchored at UTC midnight (statement dates have no meaningful
 * time-of-day). Returns null when nothing parses.
 */

/** Parse "YYYYMMDD" (+ optional trailing time), as used by OFX DTPOSTED. */
export function parseOfxDate(value: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim())
  if (!m) return null
  const [, y, mo, d] = m
  return Date.UTC(Number(y), Number(mo) - 1, Number(d))
}

/**
 * Parse a free-form statement date. Handles ISO (YYYY-MM-DD), US (MM/DD/YYYY),
 * D/M/YYYY when unambiguous, QIF apostrophe years (M/D'YY), and 2-digit years.
 * `dayFirst` disambiguates DD/MM vs MM/DD when both are ≤ 12.
 */
export function parseStatementDate(value: string, dayFirst = false): number | null {
  const s = value.trim()
  if (s === '') return null

  // ISO 8601 (YYYY-MM-DD)
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  }

  // Compact YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    return parseOfxDate(s)
  }

  // Separated numeric: parts split on / . - or QIF apostrophe.
  const parts = s.split(/['/.\-]/).filter((p) => p !== '')
  if (parts.length >= 3 && parts.every((p) => /^\d+$/.test(p))) {
    let [a, b, c] = parts.map(Number)
    // If the first chunk is a 4-digit year, it's Y M D.
    if (parts[0].length === 4) {
      return Date.UTC(a, b - 1, c)
    }
    // Otherwise it's (M D Y) or (D M Y); c is the year.
    let month: number
    let day: number
    if (dayFirst || a > 12) {
      day = a
      month = b
    } else {
      month = a
      day = b
    }
    let year = c
    if (year < 100) year += year < 70 ? 2000 : 1900
    return Date.UTC(year, month - 1, day)
  }

  // Fall back to the engine (e.g. "Jan 5, 2026"); normalize to UTC midnight.
  const parsed = Date.parse(s)
  if (!isNaN(parsed)) {
    const d = new Date(parsed)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  return null
}
