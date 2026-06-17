/**
 * Shared changelog-from-PR parsing (exploration 0197). Used by both the writer
 * (from-pr.mjs, on merge) and the gate (check.mjs, on every PR) so "does this PR
 * have a changelog?" is decided by exactly the same logic that produces the entry.
 */

export const KNOWN_TAGS = new Set([
  'app', 'crm', 'finance', 'tasks', 'ai', 'plugins', 'editor',
  'sync', 'identity', 'platform', 'performance', 'devtools', 'ci'
])

export function cleanTags(raw) {
  const tags = (raw || []).map((t) => String(t).trim().toLowerCase()).filter((t) => KNOWN_TAGS.has(t))
  return tags.length ? [...new Set(tags)] : ['app']
}

/** Pull the text under a `## Changelog` heading, up to the next heading, comments stripped. */
export function extractChangelogBlock(body) {
  if (!body) return ''
  const lines = body.split(/\r?\n/)
  const start = lines.findIndex((l) => /^#{1,4}\s*changelog\s*$/i.test(l.trim()))
  if (start === -1) return ''
  const rest = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,4}\s+\S/.test(lines[i])) break
    rest.push(lines[i])
  }
  return rest.join('\n').replace(/<!--[\s\S]*?-->/g, '').trim()
}

/** Parse the block: first line = title, `-`/`*` lines = highlights, `tags:` line = tags, rest = summary. */
export function parseChangelogBlock(block, fallbackTitle) {
  const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let title = ''
  const summary = []
  const highlights = []
  let tags = []
  for (const line of lines) {
    const tagsMatch = line.match(/^tags?:\s*(.+)$/i)
    if (tagsMatch) { tags = tagsMatch[1].split(','); continue }
    if (/^[-*]\s+/.test(line)) { highlights.push(line.replace(/^[-*]\s+/, '')); continue }
    if (!title) { title = line; continue }
    summary.push(line)
  }
  title = title || fallbackTitle || ''
  return { title, summary: summary.join(' ') || title, highlights, tags: cleanTags(tags) }
}

/**
 * True if the PR body has a `## Changelog` section with real, user-authored
 * content (not just the template comment or a lone `tags:` line). This is the
 * merge gate's pass condition.
 */
export function hasChangelogContent(body) {
  const block = extractChangelogBlock(body)
  const substantive = block
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^tags?:/i.test(l))
    .join('')
  return substantive.length >= 8
}
