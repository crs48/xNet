#!/usr/bin/env node
/**
 * Fill in the `pr` number for changelog fragments that don't have one
 * (explorations 0197/0202). Authors commit a fragment in their PR without knowing
 * the PR number; this runs at deploy time on `main`, after the merge, and recovers
 * the number for each fragment from the commit that ADDED it. Two routes:
 *
 *   1. git subject (offline, fast): the adding commit's "(#N)" (squash), or the
 *      first merge commit's "#N" on the path to HEAD (merge commits).
 *   2. GitHub API (authoritative): `GET /repos/{repo}/commits/{addSha}/pulls`,
 *      which maps the adding commit to its PR regardless of merge method — so a
 *      rebase-merge (no "#N" anywhere) still resolves. Uses `GITHUB_TOKEN` when
 *      present; falls back to an unauthenticated call (fine at our volume).
 *
 * Edits the fragments in the build workspace only — nothing is committed, so there
 * is no write back to `main`. Needs full history (checkout fetch-depth: 0).
 * Idempotent. **Fail-loud, not fail-open:** a fragment that can't be resolved is
 * left untouched (it still renders) but is reported with a `::warning` annotation
 * and a summary line, so a silently-numberless entry never ships unnoticed.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'site/src/data/changelog'

function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

/** `owner/repo` from the Actions env, else the git remote, else the known repo. */
function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  const url = git('config', '--get', 'remote.origin.url')
  const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
  return m ? m[1] : 'crs48/xNet'
}

/** PR number from a commit subject: "(#N)" (squash) or a merge commit's "#N". */
function prFromGit(addSha) {
  const addSubject = git('show', '-s', '--format=%s', addSha)
  const squash = addSubject.match(/\(#(\d+)\)/)
  if (squash) return Number(squash[1])

  const merges = git('rev-list', '--ancestry-path', '--merges', '--reverse', `${addSha}..HEAD`)
  const mergeSha = merges.split('\n').filter(Boolean)[0]
  if (mergeSha) {
    const m = git('show', '-s', '--format=%s', mergeSha).match(/#(\d+)/)
    if (m) return Number(m[1])
  }
  return null
}

/** PR number via the GitHub API, keyed by the adding commit. Null on any failure. */
async function prFromApi(addSha) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  try {
    const res = await fetch(`https://api.github.com/repos/${repoSlug()}/commits/${addSha}/pulls`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'xnet-changelog-resolve',
        'x-github-api-version': '2022-11-28',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      }
    })
    if (!res.ok) return null
    const pulls = await res.json()
    if (!Array.isArray(pulls) || pulls.length === 0) return null
    // Prefer the merged PR; fall back to the first associated PR.
    const pick = pulls.find((p) => p.merged_at) ?? pulls[0]
    return typeof pick?.number === 'number' ? pick.number : null
  } catch {
    return null
  }
}

async function prFor(file) {
  const addSha = git('log', '--diff-filter=A', '--format=%H', '-1', '--', join(DIR, file))
  if (!addSha) return null
  return prFromGit(addSha) ?? (await prFromApi(addSha))
}

let resolved = 0
const unresolved = []
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const path = join(DIR, file)
  const entry = JSON.parse(readFileSync(path, 'utf8'))
  if (entry.pr) continue
  const pr = await prFor(file)
  if (!pr) {
    unresolved.push(entry.id ?? file)
    continue
  }
  entry.pr = pr
  writeFileSync(path, JSON.stringify(entry, null, 2) + '\n')
  resolved++
  console.log(`resolved ${file} → PR #${pr}`)
}

// Fail-loud: surface unresolved fragments as warnings (GitHub annotates these),
// but never block the deploy — a numberless entry still renders, just bare.
for (const id of unresolved) {
  console.log(
    `::warning title=changelog::Could not resolve a PR number for "${id}" — it will render without a PR link or gallery.`
  )
}
console.log(
  `resolve-prs: filled ${resolved} PR number(s)` +
    (unresolved.length ? `, ${unresolved.length} unresolved: ${unresolved.join(', ')}` : '')
)
