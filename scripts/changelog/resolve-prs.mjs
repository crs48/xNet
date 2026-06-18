#!/usr/bin/env node
/**
 * Fill in the `pr` number for changelog fragments that don't have one
 * (exploration 0197). Authors commit a fragment in their PR without knowing the
 * PR number; this runs at deploy time on `main`, after the merge, and recovers
 * the number from git history — the merge commit that introduced the fragment
 * (this repo uses merge commits: "Merge pull request #N …"), or a squash
 * commit's "(#N)" suffix.
 *
 * It edits the fragments in the build workspace only — nothing is committed, so
 * there's no write back to `main`. Needs full history (checkout fetch-depth: 0).
 * Idempotent and fail-open: fragments that already have a `pr`, or that can't be
 * resolved (shallow clone, direct-to-main commit), are left untouched.
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

function prFor(file) {
  const path = join(DIR, file)
  const addSha = git('log', '--diff-filter=A', '--format=%H', '-1', '--', path)
  if (!addSha) return null

  // Squash merge: the adding commit itself carries "(#N)".
  const addSubject = git('show', '-s', '--format=%s', addSha)
  const squash = addSubject.match(/\(#(\d+)\)/)
  if (squash) return Number(squash[1])

  // Merge commit: the first merge on the path from the add commit to HEAD.
  const merges = git('rev-list', '--ancestry-path', '--merges', '--reverse', `${addSha}..HEAD`)
  const mergeSha = merges.split('\n').filter(Boolean)[0]
  if (mergeSha) {
    const subject = git('show', '-s', '--format=%s', mergeSha)
    const m = subject.match(/#(\d+)/)
    if (m) return Number(m[1])
  }
  return null
}

let resolved = 0
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const path = join(DIR, file)
  const entry = JSON.parse(readFileSync(path, 'utf8'))
  if (entry.pr) continue
  const pr = prFor(file)
  if (!pr) continue
  entry.pr = pr
  writeFileSync(path, JSON.stringify(entry, null, 2) + '\n')
  resolved++
  console.log(`resolved ${file} → PR #${pr}`)
}
console.log(`resolve-prs: filled ${resolved} fragment PR number(s)`)
