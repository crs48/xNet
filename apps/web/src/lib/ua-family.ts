/**
 * Coarse browser + OS family for diagnostics (exploration 0315).
 *
 * "Chrome 137 / macOS" — deliberately no full UA string, no versioned OS, no
 * device model: enough to reproduce a crash, not enough to fingerprint (the
 * KDE no-unique-identifiers rule).
 */

const BROWSERS: Array<[name: string, pattern: RegExp]> = [
  // Order matters: Edge/Opera embed "Chrome", Chrome embeds "Safari".
  ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/],
  ['Opera', /OPR\/(\d+)/],
  ['Firefox', /Firefox\/(\d+)/],
  ['Chrome', /Chrome\/(\d+)/],
  ['Safari', /Version\/(\d+).*Safari/]
]

const OSES: Array<[name: string, pattern: RegExp]> = [
  ['iOS', /iPhone|iPad|iPod/],
  ['Android', /Android/],
  ['macOS', /Macintosh|Mac OS X/],
  ['Windows', /Windows/],
  ['Linux', /Linux|X11/]
]

/** e.g. `Chrome 137 / macOS`; unknown parts render as `Unknown`. */
export function uaFamilyOnly(userAgent: string): string {
  let browser = 'Unknown'
  for (const [name, pattern] of BROWSERS) {
    const match = pattern.exec(userAgent)
    if (match) {
      browser = `${name} ${match[1]}`
      break
    }
  }
  const os = OSES.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? 'Unknown'
  return `${browser} / ${os}`
}
