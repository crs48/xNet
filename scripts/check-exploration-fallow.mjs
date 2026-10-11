#!/usr/bin/env node
/**
 * Report exploration age (exploration 0421).
 *
 * Drafts become stale after their explicit review date, or 90 days after
 * first appearing in git. Age is informational: stale drafts can remain open
 * without blocking CI or requiring a new date. This report never rewrites,
 * renames, or withdraws the source documents.
 *
 * Consumers: `docs/explorations/STALE.md`, `/mvp-followup`, and the CI job
 * summary. Generation succeeds when the report can be read and written;
 * the number of stale drafts does not affect the exit status.
 *
 * Run: `node scripts/check-exploration-fallow.mjs` (or `pnpm check:exploration-fallow`).
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { dayDiff, dueDay, formatDay, isOverdue, overdueDays } from './exploration-fallow/dates.mjs'

const root = resolve(process.cwd())
const DIR = join(root, 'docs/explorations')
const STALE_INDEX = join(DIR, 'STALE.md')
const DEFAULT_WINDOW_DAYS = 90

if (process.argv.includes('--write-baseline')) {
  throw new Error('Exploration age is report-only; --write-baseline is no longer supported.')
}

/**
 * Git hooks export GIT_DIR / GIT_WORK_TREE, which hijack any `git` subprocess
 * started underneath them and silently point it at the wrong tree — a worktree
 * hazard this repo has already been bitten by (exploration 0413).
 */
function git(args) {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k]
  return execFileSync('git', args, {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
}

/**
 * How little date coverage makes this check vacuous rather than merely partial.
 *
 * `git rev-parse --is-shallow-repository` looked like the guard to use and is
 * the wrong one: this repo reports shallow (there is a `.git/shallow` graft)
 * while still holding all 4,984 commits back to January, so the proxy fails a
 * checkout that can answer the question perfectly well. What the script
 * actually needs is dates for the documents it judges — so measure that, below,
 * and treat undated documents as their own reported category. A document whose
 * age is *unreadable* must never be silently folded in with one that is *not
 * yet due* (AGENTS.md).
 */
const MIN_DATE_COVERAGE = 0.5

/**
 * Earliest ADD timestamp per exploration number, in epoch ms, from one
 * `git log` pass. `match` selects which filenames count.
 *
 * Identity is the 4-digit number, not the filename: checking a doc off renames
 * it, so filename identity would reset the clock on every status change — the
 * one event that most reliably means work IS happening.
 */
function addedByNumber({ noRenames, match }) {
  const out = git([
    'log',
    ...(noRenames ? ['--no-renames'] : []),
    '--diff-filter=A',
    '--format=@%ct',
    '--name-only',
    '--',
    'docs/explorations/'
  ])
  const seen = new Map()
  let ts = null
  for (const line of out.split('\n')) {
    if (line.startsWith('@')) {
      ts = Number(line.slice(1)) * 1000
      continue
    }
    const m = match.exec(line)
    if (!m || ts === null) continue
    const prev = seen.get(m[1])
    if (prev === undefined || ts < prev) seen.set(m[1], ts)
  }
  return seen
}

/**
 * When each exploration first appeared. Rename detection stays ON (git's
 * default) so only TRUE adds count: a document whose birth predates this
 * checkout's history must stay undated rather than acquire the date of a later
 * status flip, which would be younger than the truth and silently wrong.
 *
 * This drives staleness, and its behaviour is deliberately unchanged.
 */
const firstSeenByNumber = () =>
  addedByNumber({ noRenames: false, match: /explorations\/(\d{4})_\[.\]_/ })

/**
 * Births and check-offs for the retirement curve — both with `--no-renames`.
 *
 * That flag is load-bearing twice over.
 *
 * For check-offs it is the difference between a measurement and nothing: a
 * status flip IS a rename, so under default detection the arrival of the `[x]`
 * filename is recorded as R, not A. Detection ON finds 6 check-offs where OFF
 * finds 195 — a 97% undercount that still looks like data.
 *
 * For births it removes a bias that points the wrong way. Detection ON drops
 * the original add of any document later absorbed into a rename chain, and the
 * documents that get renamed are exactly the ones that get CHECKED OFF: 51 of
 * the 195 shipped documents have no birth date under ON. Measuring retirement
 * against a birth map that preferentially forgets the retirements would report
 * the backlog as more hopeless than it is.
 *
 * These stay separate from `firstSeenByNumber()` rather than replacing it,
 * because turning detection off there hands a (too-late) birth date to every
 * previously-undated document and moves the stale count — measured, 41 → 75.
 * The curve is a display; a display must not move the pass condition.
 */
const curveHistory = () => ({
  born: addedByNumber({ noRenames: true, match: /explorations\/(\d{4})_\[.\]_/ }),
  done: addedByNumber({ noRenames: true, match: /explorations\/(\d{4})_\[x\]_/ })
})

/** Day thresholds the retirement curve is sampled at. */
const SURVIVAL_BUCKETS = [1, 7, 14, 30, 60, 90, 120]

/**
 * The retirement curve for the backlog (exploration 0430, after Bouk's account
 * of Winfrey's industrial type curves).
 *
 * Decay is only manageable once it has a shape. Measured today: every one of
 * the 195 check-offs happened within 30 days, 96% of them within a single day,
 * and the unshipped share never falls — 54% at day 1, 55% at day 120. So an old
 * `[_]` is not a decision pending, it is a decision already made by inaction.
 * Publishing the curve is what lets a reader of this index attach a prior to an
 * age instead of guessing at one.
 *
 * Right-censoring matters: a document written yesterday cannot have "failed" to
 * ship within 30 days, so each bucket only counts documents old enough to have
 * had the chance. Without that the recent bulge would drag every bucket down and
 * the curve would report despair instead of a hazard rate.
 *
 * Ages are whole UTC days, like every other number in this report — measuring
 * them as elapsed milliseconds since a commit instant made each bucket tick
 * over at whatever time of day the document happened to be committed at, so the
 * table moved between two runs an hour apart on the same date.
 */
function survivalTable(born, done, nowMs) {
  const docs = [...born.entries()].map(([number, bornAt]) => ({
    ageDays: dayDiff(nowMs, bornAt),
    lagDays: done.has(number) ? dayDiff(done.get(number), bornAt) : null
  }))

  return SURVIVAL_BUCKETS.map((day) => {
    const cohort = docs.filter((d) => d.ageDays >= day)
    const shipped = cohort.filter((d) => d.lagDays !== null && d.lagDays <= day)
    return {
      day,
      n: cohort.length,
      openPct:
        cohort.length === 0
          ? null
          : Math.round((100 * (cohort.length - shipped.length)) / cohort.length)
    }
  })
}

/**
 * The leading `---` frontmatter block, or '' when a document has none (most of
 * the older corpus does not).
 *
 * Scoping to this block is load-bearing, not tidiness. A whole-file scan reads
 * any line-initial `status:` — including the ones inside the YAML examples in
 * exploration 0421, which documents this very mechanism and would therefore
 * have reported *itself* as withdrawn.
 */
const frontmatter = (src) => {
  if (!src.startsWith('---\n')) return ''
  const end = src.indexOf('\n---', 4)
  return end === -1 ? '' : src.slice(4, end)
}

/** A frontmatter scalar, or null. Absent is not an error — it means "default". */
const field = (fm, key) => {
  const m = new RegExp(`^${key}:[ \\t]*(\\S+)`, 'm').exec(fm)
  return m ? m[1].replace(/^["']|["']$/g, '') : null
}

const firstSeen = firstSeenByNumber()
const curve = curveHistory()
const now = Date.now()
const stale = []
const undated = []
let considered = 0

for (const file of readdirSync(DIR).sort()) {
  const m = /^(\d{4})_\[(.)\]_.*\.md$/.exec(file)
  if (!m) continue
  const [, number, status] = m
  if (status === 'x') continue // built; nothing left to decide

  const fm = frontmatter(readFileSync(join(DIR, file), 'utf8'))
  if (field(fm, 'status') === 'withdrawn') continue // decided against, on purpose

  considered++
  const review = field(fm, 'review')
  const born = firstSeen.get(number)
  const due = dueDay({ review, bornMs: born, windowDays: DEFAULT_WINDOW_DAYS })

  if (due === null) {
    // No creation date and no explicit review date. NOT "not yet due" — its age
    // is simply unknown, and the two must stay distinguishable. Reported, never
    // counted as stale, and fixable by giving the document a `review:` date.
    undated.push({ file, number })
    continue
  }

  if (isOverdue(due, now)) {
    stale.push({
      file,
      number,
      status,
      // Printed and counted off the same UTC day, so the two columns can never
      // disagree — the whole reason this arithmetic lives in `dates.mjs`.
      due: formatDay(due),
      // Whether the date was *used*, not merely present: a malformed `review:`
      // falls through to the birth window, and labelling that row explicit
      // would hide the one thing its author needs to fix.
      explicit: formatDay(due) === review,
      decider: field(fm, 'decider'),
      days: overdueDays(due, now)
    })
  }
}

// Deterministic order: the index must be byte-identical on unchanged input, or
// it churns the diff on every run and nobody reads it.
stale.sort((a, b) => a.file.localeCompare(b.file))
undated.sort((a, b) => a.file.localeCompare(b.file))

const coverage = considered === 0 ? 1 : (considered - undated.length) / considered
if (coverage < MIN_DATE_COVERAGE) {
  console.error(
    `✗ creation dates unavailable for ${undated.length} of ${considered} explorations ` +
      `(${Math.round(coverage * 100)}% coverage).\n` +
      '  Below this the result is vacuous — nearly everything would look new and\n' +
      '  the check would pass without checking anything.\n' +
      '  → set `fetch-depth: 0` on the job running this script.'
  )
  process.exit(1)
}

const survival = survivalTable(curve.born, curve.done, now)

/**
 * The curve's endpoints, which are the whole finding: it does not fall.
 *
 * An earlier version reported "flattens around day N" by scanning for the first
 * bucket every later one sits within 5 points of. On this data that answers
 * "day 1" — technically true, and misleading, because it implies a burn-down
 * that then plateaus. There is no burn-down. Stating both endpoints says the
 * same thing without inventing a threshold to say it.
 */
const measured = survival.filter((row) => row.openPct !== null)
const shape =
  measured.length >= 2
    ? {
        first: measured[0].openPct,
        last: measured[measured.length - 1].openPct,
        lastDay: measured[measured.length - 1].day
      }
    : null

const index = [
  '<!-- Generated by scripts/check-exploration-fallow.mjs — do not edit by hand. -->',
  '',
  '# Stale explorations',
  '',
  'Drafts are classified as stale after their `review:` date, or after the',
  'default 90-day window. This is an age report, not a CI failure or a deadline',
  'to build, renew, or close anything. Stale drafts can remain open until useful.',
  '',
  `**${stale.length}** stale of ${considered} undecided.`,
  '',
  '## How this backlog retires',
  '',
  'Measured from git history, not assumed (exploration 0430). Each row counts',
  'only documents old enough to have had that many days, so a recent bulge',
  'cannot drag the curve down.',
  '',
  '| Days since written | Cohort | Still unshipped |',
  '| --- | --- | --- |',
  ...survival
    .filter((row) => row.openPct !== null)
    .map((row) => `| ${row.day} | ${row.n} | ${row.openPct}% |`),
  '',
  ...(shape
    ? [
        `${shape.first}% of documents at least a day old remain unshipped,`,
        `compared with ${shape.last}% of those at least ${shape.lastDay} days old.`,
        'These are age cohorts, not requirements to retire drafts.',
        ''
      ]
    : []),
  '## Past review date',
  '',
  '| Exploration | Due | Overdue | Decider |',
  '| --- | --- | --- | --- |',
  ...stale.map(
    (s) =>
      `| [${s.file}](${encodeURI(s.file)}) | ${s.due}${s.explicit ? '' : ' *(default)*'} | ${s.days}d | ${s.decider ?? '—'} |`
  ),
  '',
  ...(undated.length > 0
    ? [
        '## Undated',
        '',
        `${undated.length} exploration(s) predate this checkout's history and carry no`,
        '`review:` date, so their age is unknown. They are **not** counted as stale —',
        'unknown age and not-yet-due are different facts. Give one a `review:` date to',
        'move it out of this list.',
        '',
        ...undated.map((u) => `- [${u.file}](${encodeURI(u.file)})`),
        ''
      ]
    : [])
].join('\n')

writeFileSync(STALE_INDEX, index)

console.log(`Exploration age report: ${stale.length} stale of ${considered} undecided.`)
console.log('Staleness is informational and does not block CI. See docs/explorations/STALE.md.')
