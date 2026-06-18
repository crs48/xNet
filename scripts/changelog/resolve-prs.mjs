#!/usr/bin/env node
/**
 * Resolve the `pr` number for changelog fragments that don't have one baked in
 * (explorations 0197/0202/0203). Two modes:
 *
 *   • default (deploy): runs on `main` after the merge and WRITES the resolved
 *     number into each fragment's workspace copy. This is the safety net — most
 *     fragments now arrive already numbered (baked by `new.mjs --pr auto`, or
 *     stamped into source at merge by `.github/workflows/stamp-pr-number.yml`),
 *     so this typically no-ops. Edits the build workspace only; nothing is
 *     committed here.
 *
 *   • `--check` (PR CI): a DRY RUN. Resolves but never writes. Prints the number
 *     each entry will get, and EXITS NON-ZERO if a fragment *introduced by this
 *     PR* can't be resolved — so an entry that would ship numberless fails the
 *     PR instead of silently rendering bare in production. Pre-existing
 *     unresolved fragments are warned about, not failed. Set `CHANGELOG_BASE_REF`
 *     (e.g. the PR base SHA) to scope "introduced by this PR"; without it, every
 *     unresolved fragment is a warning (used for local runs).
 *
 * Resolution uses two routes, in order:
 *   1. git subject (offline, fast): the adding commit's "(#N)" (squash), or the
 *      first merge commit's "#N" on the path to HEAD (merge commits).
 *   2. GitHub API (authoritative): `GET /repos/{repo}/commits/{addSha}/pulls`,
 *      which maps the adding commit to its PR regardless of merge method — so a
 *      rebase-merge (no "#N" anywhere) still resolves. Uses `GITHUB_TOKEN` when
 *      present; falls back to an unauthenticated call (fine at our volume).
 *
 * Needs full history (checkout fetch-depth: 0). Idempotent.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'site/src/data/changelog'
const CHECK = process.argv.includes('--check')
// When set (PR CI), only fragments NOT already on this ref are "introduced by
// this PR" and must resolve; anything else that's unresolved is just a warning.
const BASE_REF = process.env.CHANGELOG_BASE_REF || ''

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

/** The commit that ADDED a fragment file (its first appearance in history). */
function addShaFor(file) {
  return git('log', '--diff-filter=A', '--format=%H', '-1', '--', join(DIR, file))
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

async function resolvePr(addSha) {
  if (!addSha) return null
  return prFromGit(addSha) ?? (await prFromApi(addSha))
}

/** Was `addSha` introduced by this PR (i.e. not already reachable from base)? */
function isNewVsBase(addSha) {
  if (!BASE_REF || !addSha) return false
  // exit 0 ⇒ addSha is an ancestor of base ⇒ pre-existing ⇒ NOT new.
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', addSha, BASE_REF], { stdio: 'ignore' })
    return false
  } catch {
    return true
  }
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()

if (CHECK) {
  // ── Dry run (PR CI): resolve, never write, fail on PR-new unresolved. ──────
  let baked = 0
  let willResolve = 0
  const unresolvedNew = []
  const unresolvedOld = []
  for (const file of files) {
    const entry = JSON.parse(readFileSync(join(DIR, file), 'utf8'))
    const id = entry.id ?? file
    if (entry.pr) {
      baked++
      continue
    }
    const addSha = addShaFor(file)
    const pr = await resolvePr(addSha)
    if (pr) {
      willResolve++
      console.log(`would link "${id}" → PR #${pr}`)
      continue
    }
    ;(isNewVsBase(addSha) ? unresolvedNew : unresolvedOld).push(id)
  }
  for (const id of unresolvedNew) {
    console.log(
      `::error title=changelog::"${id}" is added in this PR but cannot be resolved to a PR number. ` +
        `Bake it with \`node scripts/changelog/new.mjs --pr <N>\` or open the PR first so \`--pr auto\` can.`
    )
  }
  for (const id of unresolvedOld) {
    console.log(
      `::warning title=changelog::Pre-existing fragment "${id}" has no resolvable PR number (it renders bare).`
    )
  }
  console.log(
    `resolve-prs --check: ${baked} baked, ${willResolve} will resolve` +
      (unresolvedNew.length ? `, ${unresolvedNew.length} NEW unresolved` : '') +
      (unresolvedOld.length ? `, ${unresolvedOld.length} pre-existing unresolved` : '')
  )
  if (unresolvedNew.length) process.exit(1)
} else {
  // ── Deploy: write resolved numbers into the workspace (safety net). ────────
  let resolved = 0
  const unresolved = []
  for (const file of files) {
    const path = join(DIR, file)
    const entry = JSON.parse(readFileSync(path, 'utf8'))
    if (entry.pr) continue
    const pr = await resolvePr(addShaFor(file))
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
}
