/**
 * Collaboration-cursor presence helpers (ported from RichTextEditor).
 */

/** Shorten a DID for cursor labels when no profile label is available. */
export function truncateDidLabel(did: string): string {
  return did.startsWith('did:') ? `${did.slice(0, 14)}...${did.slice(-6)}` : did
}

/**
 * Deterministic 6-digit hex cursor color from a DID string (y-prosemirror's
 * cursor plugin requires hex).
 */
export function generateCursorColor(did: string): string {
  let hash = 0
  for (let i = 0; i < did.length; i++) {
    hash = did.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  const s = 0.7
  const l = 0.5
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (hue < 60) {
    r = c
    g = x
  } else if (hue < 120) {
    r = x
    g = c
  } else if (hue < 180) {
    g = c
    b = x
  } else if (hue < 240) {
    g = x
    b = c
  } else if (hue < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
