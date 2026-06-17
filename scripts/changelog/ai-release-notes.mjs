#!/usr/bin/env node
/**
 * Turn a raw list of commit subjects (read from stdin) into user-facing
 * "What's New" prose for an Electron GitHub Release (exploration 0195).
 *
 *   git log --pretty=format:"- %s" | node scripts/changelog/ai-release-notes.mjs v1.2.3
 *
 * Design goals:
 *   - Self-contained: uses global fetch, no new dependency (cf. communique).
 *   - Fail-open: if ANTHROPIC_API_KEY is unset, or the API errors, it prints the
 *     input unchanged and exits 0 — the release workflow never breaks on this.
 *   - Cheap: one short Haiku call.
 */

const MODEL = process.env.CHANGELOG_MODEL || 'claude-haiku-4-5'
const API_URL = 'https://api.anthropic.com/v1/messages'

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    if (process.stdin.isTTY) resolve('')
  })
}

async function enrich(version, commits) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !commits.trim()) return commits

  const system =
    'You write release notes for xNet, a local-first data platform desktop app. ' +
    'Audience: developers and power users. Rewrite the raw commit list into clear, ' +
    'benefit-focused notes. Lead with the most impactful user-visible change. Group ' +
    'into "New", "Improved", and "Fixed" sections (omit empty ones). Skip pure internal ' +
    'refactors and chores unless they affect stability or performance. Use short bullet ' +
    'points. Output GitHub-flavored Markdown only, no preamble, max ~250 words.'

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: `Release ${version}. Commits:\n${commits}` }]
    })
  })

  if (!res.ok) throw new Error(`Anthropic API ${res.status}`)
  const json = await res.json()
  const text = json?.content?.find((b) => b.type === 'text')?.text
  return text?.trim() || commits
}

async function main() {
  const version = process.argv[2] || 'this release'
  const commits = await readStdin()
  try {
    process.stdout.write(await enrich(version, commits))
  } catch (err) {
    // Fail open: emit the raw commit list so the release still has notes.
    process.stderr.write(`ai-release-notes: ${err.message}; using raw commits\n`)
    process.stdout.write(commits)
  }
}

await main()
