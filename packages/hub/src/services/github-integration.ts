/**
 * @xnetjs/hub - GitHub integration: magic words, branch links, and status
 * automation for tasks (exploration 0161, phase 4).
 *
 * The mechanics mirror Linear's: a task's short identifier (`XN-142`)
 * appearing in a branch name, commit message, or PR title/body creates a
 * structured link, and PR lifecycle events drive workflow status:
 *
 * - PR opened (non-draft) referencing a task → status `in-review`
 * - PR merged with a closing magic word (`Fixes XN-142`) → status `done`
 * - PR closed without merging → revert to `in-progress`
 * - Draft PRs are inert until marked ready
 *
 * The service is pure: webhook payloads in, `TaskAutomationAction[]` out.
 * The caller (webhook route → workspace mutation pipeline) resolves short
 * ids to Task nodes, attaches ExternalReference nodes, and applies status
 * changes through the normal node-mutation path so every surface updates.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

// ─── Identifier parsing ──────────────────────────────────────────────────────

const CLOSES_PATTERN = /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)[:\s]+([A-Za-z]{1,5}-\d{1,8})/gi
const REFS_PATTERN = /\b(?:ref(?:s|erences)?)[:\s]+([A-Za-z]{1,5}-\d{1,8})/gi
const BARE_ID_PATTERN = /\b([A-Za-z]{1,5}-\d{1,8})\b/g
/** `user/xn-142-fix-grid` or `xn-142-fix-grid` */
const BRANCH_PATTERN = /(?:^|\/)([A-Za-z]{1,5}-\d{1,8})(?:-|$)/

export interface ParsedTaskLinks {
  /** Identifiers with closing magic words (auto-close on merge) */
  closes: string[]
  /** Identifiers referenced without closing semantics */
  refs: string[]
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.toUpperCase()))]
}

/** Parse closing/reference magic words from commit or PR text. */
export function parseTaskLinks(text: string): ParsedTaskLinks {
  const closes = unique([...text.matchAll(CLOSES_PATTERN)].map((match) => match[1]))
  const closed = new Set(closes)
  const refs = unique(
    [
      ...[...text.matchAll(REFS_PATTERN)].map((match) => match[1]),
      ...[...text.matchAll(BARE_ID_PATTERN)].map((match) => match[1])
    ].filter((id) => !closed.has(id.toUpperCase()))
  )

  return { closes, refs }
}

/** Extract a task identifier from a branch name. */
export function parseBranchTaskId(branch: string): string | null {
  const match = BRANCH_PATTERN.exec(branch)
  return match ? match[1].toUpperCase() : null
}

// ─── Webhook signature ───────────────────────────────────────────────────────

/** Verify a GitHub `X-Hub-Signature-256` header against the raw body. */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | undefined
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const provided = signatureHeader.slice('sha256='.length)

  if (provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'))
}

// ─── Webhook → actions ───────────────────────────────────────────────────────

/** Kinds align with ExternalReferenceSchema (branches/commits are 'link') */
export interface TaskExternalReference {
  url: string
  provider: 'github'
  kind: 'pull-request' | 'issue' | 'link'
  refId: string
  title: string
}

/** Mirrored PR/review/CI display state stored in reference metadata */
export interface TaskReferenceState {
  prState?: 'open' | 'draft' | 'merged' | 'closed'
  reviewState?: 'approved' | 'changes-requested'
  ciState?: 'pending' | 'passing' | 'failing'
}

export type TaskAutomationAction =
  | { type: 'link'; shortId: string; reference: TaskExternalReference }
  | { type: 'set-status'; shortId: string; status: 'in-review' | 'in-progress' | 'done' }
  | {
      /** Merge `state` into the linked reference's metadata so TaskCard /
       * TaskRow badges render live PR/review/CI state
       * (githubStateFromReferences in @xnetjs/ui). */
      type: 'set-reference-state'
      shortId: string
      /** Reference refId the state belongs to (repo#number) */
      refId: string
      state: TaskReferenceState
    }

interface PullRequestPayload {
  action?: string
  pull_request?: {
    number?: number
    title?: string
    body?: string | null
    draft?: boolean
    merged?: boolean
    html_url?: string
    head?: { ref?: string }
    base?: { repo?: { full_name?: string } }
  }
}

interface PushPayload {
  ref?: string
  commits?: Array<{ message?: string; url?: string; id?: string }>
  repository?: { full_name?: string }
}

interface PullRequestReviewPayload {
  action?: string
  review?: { state?: string }
  pull_request?: PullRequestPayload['pull_request']
}

interface CheckSuitePayload {
  action?: string
  check_suite?: {
    status?: string
    conclusion?: string | null
    head_branch?: string | null
    pull_requests?: Array<{ number?: number }>
  }
  repository?: { full_name?: string }
}

function pullRequestText(payload: PullRequestPayload): string {
  const pr = payload.pull_request
  return [pr?.title ?? '', pr?.body ?? '', pr?.head?.ref ?? ''].join('\n')
}

function pullRequestIds(payload: PullRequestPayload): ParsedTaskLinks {
  const pr = payload.pull_request
  const links = parseTaskLinks(pullRequestText(payload))
  const branchId = pr?.head?.ref ? parseBranchTaskId(pr.head.ref) : null

  if (branchId && !links.closes.includes(branchId) && !links.refs.includes(branchId)) {
    links.refs = [...links.refs, branchId]
  }

  return links
}

function pullRequestReference(payload: PullRequestPayload): TaskExternalReference | null {
  const pr = payload.pull_request
  if (!pr?.html_url) return null

  const repo = pr.base?.repo?.full_name ?? ''
  return {
    url: pr.html_url,
    provider: 'github',
    kind: 'pull-request',
    refId: repo && pr.number != null ? `${repo}#${pr.number}` : String(pr.number ?? ''),
    title: pr.title ?? `PR ${pr.number ?? ''}`
  }
}

/**
 * Map a GitHub webhook event to task automation actions. Pure — callers
 * resolve short ids to nodes and apply through the mutation pipeline.
 */
export function processGithubEvent(eventType: string, payload: unknown): TaskAutomationAction[] {
  if (eventType === 'pull_request') {
    return processPullRequestEvent(payload as PullRequestPayload)
  }

  if (eventType === 'push') {
    return processPushEvent(payload as PushPayload)
  }

  if (eventType === 'pull_request_review') {
    return processReviewEvent(payload as PullRequestReviewPayload)
  }

  if (eventType === 'check_suite') {
    return processCheckSuiteEvent(payload as CheckSuitePayload)
  }

  return []
}

function processPullRequestEvent(payload: PullRequestPayload): TaskAutomationAction[] {
  const pr = payload.pull_request
  if (!pr) return []

  const { closes, refs } = pullRequestIds(payload)
  const allIds = [...closes, ...refs]
  if (allIds.length === 0) return []

  const reference = pullRequestReference(payload)
  const actions: TaskAutomationAction[] = []

  const prState: TaskReferenceState['prState'] =
    payload.action === 'closed' ? (pr.merged ? 'merged' : 'closed') : pr.draft ? 'draft' : 'open'

  for (const shortId of allIds) {
    if (reference) {
      actions.push({ type: 'link', shortId, reference })
      actions.push({
        type: 'set-reference-state',
        shortId,
        refId: reference.refId,
        state: { prState }
      })
    }
  }

  // Draft PRs link but never move status until marked ready.
  if (pr.draft && payload.action !== 'ready_for_review') {
    return actions
  }

  switch (payload.action) {
    case 'opened':
    case 'reopened':
    case 'ready_for_review':
      for (const shortId of allIds) {
        actions.push({ type: 'set-status', shortId, status: 'in-review' })
      }
      break
    case 'closed':
      if (pr.merged) {
        for (const shortId of closes) {
          actions.push({ type: 'set-status', shortId, status: 'done' })
        }
      } else {
        for (const shortId of allIds) {
          actions.push({ type: 'set-status', shortId, status: 'in-progress' })
        }
      }
      break
    default:
      break
  }

  return actions
}

function processPushEvent(payload: PushPayload): TaskAutomationAction[] {
  const actions: TaskAutomationAction[] = []
  const repo = payload.repository?.full_name ?? ''
  const branch = payload.ref?.replace(/^refs\/heads\//, '') ?? ''
  const branchId = branch ? parseBranchTaskId(branch) : null

  if (branchId) {
    actions.push({
      type: 'link',
      shortId: branchId,
      reference: {
        url: repo ? `https://github.com/${repo}/tree/${branch}` : branch,
        provider: 'github',
        kind: 'link',
        refId: repo ? `${repo}:${branch}` : branch,
        title: branch
      }
    })
  }

  for (const commit of payload.commits ?? []) {
    const { closes, refs } = parseTaskLinks(commit.message ?? '')
    for (const shortId of [...closes, ...refs]) {
      if (!commit.url) continue
      actions.push({
        type: 'link',
        shortId,
        reference: {
          url: commit.url,
          provider: 'github',
          kind: 'link',
          refId: commit.id?.slice(0, 7) ?? commit.url,
          title: (commit.message ?? '').split('\n')[0]
        }
      })
    }
  }

  return actions
}

function processReviewEvent(payload: PullRequestReviewPayload): TaskAutomationAction[] {
  if (payload.action !== 'submitted') return []

  const reviewState =
    payload.review?.state === 'approved'
      ? ('approved' as const)
      : payload.review?.state === 'changes_requested'
        ? ('changes-requested' as const)
        : null
  if (!reviewState) return []

  const prPayload: PullRequestPayload = { pull_request: payload.pull_request }
  const reference = pullRequestReference(prPayload)
  if (!reference) return []

  const { closes, refs } = pullRequestIds(prPayload)

  return [...closes, ...refs].map((shortId) => ({
    type: 'set-reference-state',
    shortId,
    refId: reference.refId,
    state: { reviewState }
  }))
}

function processCheckSuiteEvent(payload: CheckSuitePayload): TaskAutomationAction[] {
  const suite = payload.check_suite
  if (!suite) return []

  const ciState: TaskReferenceState['ciState'] =
    suite.status !== 'completed'
      ? 'pending'
      : suite.conclusion === 'success'
        ? 'passing'
        : 'failing'

  // Check suites carry no PR body — the branch name is the identifier link.
  const shortId = suite.head_branch ? parseBranchTaskId(suite.head_branch) : null
  if (!shortId) return []

  const repo = payload.repository?.full_name ?? ''
  const prNumber = suite.pull_requests?.[0]?.number

  return [
    {
      type: 'set-reference-state',
      shortId,
      refId:
        repo && prNumber != null ? `${repo}#${prNumber}` : `${repo}:${suite.head_branch ?? ''}`,
      state: { ciState }
    }
  ]
}
