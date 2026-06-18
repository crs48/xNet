#!/usr/bin/env node
/**
 * Scaffold a changelog fragment (explorations 0197/0202). Commit the result in
 * your PR — that's the whole changelog step.
 *
 *   node scripts/changelog/new.mjs --title "Deals now sync after import" \
 *     --summary "Importing contacts no longer creates duplicate deals." \
 *     --tags crm,sync --highlight "Dedup on email" --highlight "Faster import"
 *
 * --title and --tags are required. Repeat --highlight for each bullet.
 *
 * The PR number: by default (`--pr auto`) we ask `gh` for the current branch's PR
 * and bake it in if one already exists — so it's visible in the repo, previews,
 * and local builds, with no extra commit. If there's no PR yet (the common case —
 * you write the fragment before opening the PR), it's omitted and the deploy fills
 * it in (resolve-prs.mjs). Force a number with `--pr 123`, or skip with `--pr none`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'site/src/data/changelog'
const KNOWN_TAGS = new Set([
  'app',
  'crm',
  'finance',
  'tasks',
  'ai',
  'plugins',
  'editor',
  'sync',
  'identity',
  'platform',
  'performance',
  'devtools',
  'ci'
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
  console.error(
    'Usage: node scripts/changelog/new.mjs --title "…" --tags app,ai [--summary "…"] [--highlight "…"]'
  )
  process.exit(1)
}

const tags = args.tags
  .split(',')
  .map((t) => t.trim().toLowerCase())
  .filter((t) => KNOWN_TAGS.has(t))
if (!tags.length) {
  console.error(`No valid tags. Choose from: ${[...KNOWN_TAGS].join(', ')}`)
  process.exit(1)
}

// Stamp the LOCAL day (not UTC), so an evening-local author doesn't get tomorrow.
const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const ymd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
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

/** The current branch's PR number via `gh`, or undefined (best-effort, never throws). */
function currentPr() {
  try {
    const out = execFileSync('gh', ['pr', 'view', '--json', 'number', '--jq', '.number'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    const n = Number(out)
    return Number.isInteger(n) && n > 0 ? n : undefined
  } catch {
    return undefined
  }
}

const prArg = args.pr ?? 'auto'
const pr =
  prArg === 'auto' ? currentPr() : prArg === 'none' ? undefined : Number(prArg) || undefined

const entry = {
  id,
  date: now.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  title: args.title,
  summary: args.summary || args.title,
  highlights: args.highlight,
  tags,
  ...(pr ? { pr } : {})
}
writeFileSync(file, JSON.stringify(entry, null, 2) + '\n')
console.log(
  `Created ${file} — commit it in your PR.` +
    (pr ? ` (Linked to PR #${pr}.)` : ' (The PR number is filled in at deploy.)')
)
