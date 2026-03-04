/**
 * @xnetjs/hub - FTS5 query sanitization.
 */

/**
 * Sanitize a user-provided query string for SQLite FTS5.
 * Strips dangerous syntax that could cause injection or unexpected behavior.
 */
export const sanitizeFtsQuery = (query: string): string =>
  query
    .replace(/[;{}[\]\\'"*()^]/g, '')
    .replace(/\b(NEAR|COLUMN)\b/gi, '')
    .trim()
    .slice(0, 500)
