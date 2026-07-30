/**
 * The welcome queue — what a community surfaces instead of a leaderboard
 * (exploration 0359).
 *
 * ## Why this exists
 *
 * Skool's retention loop is points → levels → leaderboard. xNet refuses that
 * (Charter §3; `scripts/check-humane-patterns.mjs` bans the identifiers, and
 * `charter-calm-feeds.test.ts` asserts feeds order only by time). The refusal
 * costs less than it looks, because the ranked-standing mechanic is weaker
 * than its reputation and the alternative is better evidenced:
 *
 * - Gamification meta-analysis (35 interventions) finds it lifts relatedness
 *   and autonomy but has *minimal* effect on competence, with small overall
 *   effect sizes; Deci, Koestner & Ryan (128 studies) find performance-
 *   contingent rewards undermine intrinsic motivation at d = −0.28. A
 *   leaderboard is a performance-contingent reward.
 * - In newcomer research (~140k newcomers, the Kraut & Resnick tradition),
 *   newcomers who received a reply to their first post returned at **56%**
 *   versus **44%** for those who did not. Tenure dominates retention, and the
 *   first post is where tenure is won or lost.
 *
 * So: rank nobody, and instead make it impossible for a first post to go
 * unanswered. This module answers one question for a host — *who just
 * arrived and is still waiting to be spoken to?*
 *
 * ## Why it stays inside the Charter
 *
 * The queue orders by **how long someone has been waiting** — a time field,
 * exactly like every other calm feed. It scores nobody, ranks nobody, and is
 * visible to the people who can act on it (space admins), not to the
 * membership as standing. It is a *stewardship* surface in the sense of
 * `docs/VIBE.md`: it shows work to be done, never position in a hierarchy.
 *
 * Pure and I/O-free — the caller supplies the candidate rows.
 */

/** A post being considered for the welcome queue. */
export interface WelcomeCandidate {
  postId: string
  /** DID of the person who wrote it. */
  authorDid: string
  /** ms since epoch. */
  createdAt: number
  /** Replies from *anyone other than the author* (see `isAnswered`). */
  replyCount: number
  /**
   * Whether this is the author's first post in this community. Computed by
   * the caller from the author's post history — see {@link markFirstPosts}.
   */
  isFirstPost: boolean
}

/** A first post still waiting for a reply, with how long it has waited. */
export interface WelcomeEntry extends WelcomeCandidate {
  /** ms the newcomer has been waiting. Derived, never stored. */
  waitingMs: number
}

/**
 * A reply from the author themselves does not answer their own post — the
 * effect being reproduced is *someone else showed up*. Callers that count
 * replies indiscriminately will silently drain the queue, so the type asks
 * for other-authored replies and this predicate names the rule.
 */
export const isAnswered = (candidate: Pick<WelcomeCandidate, 'replyCount'>): boolean =>
  candidate.replyCount > 0

/**
 * Mark which posts are their author's first, given the full set in date order.
 *
 * Kept separate from {@link welcomeQueue} so the "first post" rule is testable
 * on its own and so callers can compute it once over a page of history.
 */
export const markFirstPosts = <T extends Omit<WelcomeCandidate, 'isFirstPost'>>(
  posts: readonly T[]
): (T & { isFirstPost: boolean })[] => {
  const earliestByAuthor = new Map<string, number>()
  for (const post of posts) {
    const seen = earliestByAuthor.get(post.authorDid)
    if (seen === undefined || post.createdAt < seen) {
      earliestByAuthor.set(post.authorDid, post.createdAt)
    }
  }
  return posts.map((post) => ({
    ...post,
    isFirstPost: earliestByAuthor.get(post.authorDid) === post.createdAt
  }))
}

/**
 * Unanswered first posts, longest-waiting first.
 *
 * Ordering is by `createdAt` ascending — oldest wait at the top, because the
 * person who has been ignored longest is the one most likely to leave. This
 * is a time ordering, not a ranking.
 *
 * @param now ms since epoch, injected so the function stays pure.
 */
export const welcomeQueue = (
  candidates: readonly WelcomeCandidate[],
  now: number
): WelcomeEntry[] =>
  candidates
    .filter((c) => c.isFirstPost && !isAnswered(c))
    .map((c) => ({ ...c, waitingMs: Math.max(0, now - c.createdAt) }))
    .sort((a, b) => a.createdAt - b.createdAt)
