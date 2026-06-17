#!/usr/bin/env node
/**
 * Build a changelog fragment from a merged PR (exploration 0197). Run by
 * .github/workflows/changelog.yml on `pull_request: closed`. Reads PR metadata
 * from the environment, writes site/src/data/changelog/<date>-pr<N>.json, and
 * reports `written=true|false` via $GITHUB_OUTPUT.
 *
 * Content comes from a `## Changelog` block in the PR body; if absent and
 * ANTHROPIC_API_KEY is set, it is drafted by Claude. Authoritative metadata
 * (id, date, pr, author) is stamped here from the event payload, never guessed
 * by the author. Idempotent: a fragment that already exists is left untouched.
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { KNOWN_TAGS, cleanTags, extractChangelogBlock, parseChangelogBlock } from './lib.mjs'

const DIR = 'site/src/data/changelog'
const MODEL = process.env.CHANGELOG_MODEL || 'claude-haiku-4-5'

function out(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
  else console.log(`${key}=${value}`)
}

function monthLabel(iso) {
  const d = iso ? new Date(iso) : new Date()
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Ask Claude for a structured entry. Fail-open: returns null on any error. */
async function aiDraft(prTitle, prBody) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const system =
    'You write one xNet changelog entry for end users from a merged PR. Reply with ONLY a JSON object: ' +
    '{"title": string, "summary": string (one benefit-focused sentence), "highlights": string[] (0-4 user-visible points), ' +
    `"tags": string[] (from: ${[...KNOWN_TAGS].join(', ')})}. ` +
    'No commit jargon. If the PR is purely internal, reply {"skip": true}.'
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system,
        messages: [{ role: 'user', content: `Title: ${prTitle}\n\nBody:\n${(prBody || '').slice(0, 6000)}` }]
      })
    })
    if (!res.ok) return null
    const json = await res.json()
    const text = json?.content?.find((b) => b.type === 'text')?.text ?? ''
    const obj = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    if (obj.skip || !obj.title) return null
    return {
      title: String(obj.title),
      summary: String(obj.summary || obj.title),
      highlights: Array.isArray(obj.highlights) ? obj.highlights.map(String) : [],
      tags: cleanTags(obj.tags)
    }
  } catch {
    return null
  }
}

async function main() {
  const pr = Number(process.env.PR_NUMBER)
  if (!pr) return out('written', 'false')

  const date = (process.env.MERGED_AT || new Date().toISOString()).slice(0, 10)
  const id = `${date}-pr${pr}`
  const file = join(DIR, `${id}.json`)
  if (existsSync(file)) {
    console.log(`changelog fragment ${id} already exists — skipping`)
    return out('written', 'false')
  }

  const block = extractChangelogBlock(process.env.PR_BODY)
  let parsed = block ? parseChangelogBlock(block, process.env.PR_TITLE) : null
  if (!parsed || !parsed.summary) parsed = await aiDraft(process.env.PR_TITLE, process.env.PR_BODY)
  if (!parsed || !parsed.title || !parsed.summary) {
    console.log('no changelog block and no AI draft — nothing written')
    return out('written', 'false')
  }

  mkdirSync(DIR, { recursive: true })
  const entry = {
    id,
    date: monthLabel(process.env.MERGED_AT),
    title: parsed.title,
    summary: parsed.summary,
    highlights: parsed.highlights,
    tags: parsed.tags,
    author: { login: process.env.PR_AUTHOR || 'github' },
    pr
  }
  writeFileSync(file, JSON.stringify(entry, null, 2) + '\n')
  console.log(`wrote ${file}`)
  out('written', 'true')
  out('id', id)
}

await main()
