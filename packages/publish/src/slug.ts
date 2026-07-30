/**
 * Slug generation and per-publication uniqueness (exploration 0362).
 *
 * A slug is part of a post's public URL, so it is a promise: once published,
 * changing it breaks every inbound link. These helpers therefore only ever
 * *propose* a slug — assigning one is a deliberate write by the caller.
 */

/** Derive a URL-safe slug from a title. Empty/symbol-only titles → `untitled`. */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['\u2019`]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/, '') || 'untitled'
  )
}

/**
 * A slug unique within `taken`, suffixing `-2`, `-3`, … on collision.
 *
 * Numbering starts at 2 so the first collision reads as "the second post with
 * this title", which is how every other CMS numbers them.
 */
export function uniqueSlug(title: string, taken: Iterable<string>): string {
  const used = taken instanceof Set ? taken : new Set(taken)
  const base = slugify(title)
  if (!used.has(base)) return base
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`
    if (!used.has(candidate)) return candidate
  }
}

/** True when a slug is safe to put in a URL path segment. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80
}
