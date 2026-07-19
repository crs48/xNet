/**
 * HTML/XML escaping and small emit helpers (exploration 0362).
 *
 * Deliberately dependency-free: the renderer must run in plain Node with no
 * DOM shim, so everything here is string work over a Yjs tree.
 */

/** Escape a string for use in an HTML/XML text node. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape a string for use inside a double-quoted attribute. */
export function escapeAttr(value: string): string {
  return escapeHtml(value)
}

/**
 * A URL safe to emit into `href`/`src`.
 *
 * Blocks `javascript:`, `data:` and `vbscript:` so authored content can never
 * inject script through a link — published pages are read by strangers, so the
 * renderer is the last line of defence.
 */
export function safeUrl(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  // Strip control characters that can hide a scheme (e.g. `java\nscript:`).
  const collapsed = trimmed.replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase()
  if (/^(javascript|vbscript|data):/.test(collapsed)) return ''
  return trimmed
}

/** Emit `<tag attrs>` with empty attributes dropped. */
export function openTag(tag: string, attrs: Record<string, string | undefined> = {}): string {
  const parts = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}="${escapeAttr(v as string)}"`)
    .join('')
  return `<${tag}${parts}>`
}

/** Slugify a heading's text into a stable, URL-safe anchor id. */
export function headingId(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      // Strip combining marks so "café" and "cafe" agree.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'section'
  )
}
