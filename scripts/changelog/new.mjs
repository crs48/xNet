#!/usr/bin/env node
/**
 * Scaffold a changelog fragment (exploration 0197). Commit the result in your
 * PR — that's the whole changelog step. The PR number is filled in at deploy
 * time, so you don't provide it.
 *
 *   node scripts/changelog/new.mjs --title "Deals now sync after import" \
 *     --summary "Importing contacts no longer creates duplicate deals." \
 *     --tags crm,sync --highlight "Dedup on email" --highlight "Faster import"
 *
 * --title and --tags are required. Repeat --highlight for each bullet.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'site/src/data/changelog'
const KNOWN_TAGS = new Set([
  'app', 'crm', 'finance', 'tasks', 'ai', 'plugins', 'editor',
  'sync', 'identity', 'platform', 'performance', 'devtools', 'ci'
])

function parseArgs(argv) {
  const out = { highlight: [] }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '')
    const val = argv[++i]
    if (key === 'highlight') out.highlight.push(val)
    else out[key] = val
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
if (!args.title || !args.tags) {
  console.error('Usage: node scripts/changelog/new.mjs --title "…" --tags app,ai [--summary "…"] [--highlight "…"]')
  process.exit(1)
}

const tags = args.tags.split(',').map((t) => t.trim().toLowerCase()).filter((t) => KNOWN_TAGS.has(t))
if (!tags.length) {
  console.error(`No valid tags. Choose from: ${[...KNOWN_TAGS].join(', ')}`)
  process.exit(1)
}

const now = new Date()
const ymd = now.toISOString().slice(0, 10)
const slug = args.title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40)
const id = `${ymd}-${slug}`

mkdirSync(DIR, { recursive: true })
const file = join(DIR, `${id}.json`)
if (existsSync(file)) {
  console.error(`${file} already exists — pick a more distinct title or edit it directly.`)
  process.exit(1)
}

const entry = {
  id,
  date: now.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
  title: args.title,
  summary: args.summary || args.title,
  highlights: args.highlight,
  tags
}
writeFileSync(file, JSON.stringify(entry, null, 2) + '\n')
console.log(`Created ${file} — commit it in your PR. (The PR number is filled in at deploy.)`)
