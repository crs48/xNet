/**
 * Pure reaction grouping for chat messages (0198). Reactions are individual
 * Reaction nodes targeting a message; this folds them into per-emoji pills with
 * a count, the set of reactors, and whether the viewer is among them. A reactor
 * is counted once per emoji (last write wins upstream; we just dedupe here).
 */

export interface ReactionLike {
  id: string
  emoji?: string
  reactor: string
  reactionType: string
}

export interface ReactionGroup {
  emoji: string
  count: number
  /** The viewer has this reaction (drives the highlighted pill + toggle). */
  mine: boolean
  /** Reaction node id of the viewer's own reaction, for removal on toggle. */
  myReactionId?: string
  reactors: string[]
}

/** Fold emoji reactions into ordered pills (first-seen emoji order). */
export function groupReactions(reactions: ReactionLike[], me: string): ReactionGroup[] {
  const byEmoji = new Map<string, ReactionGroup>()
  for (const r of reactions) {
    if (r.reactionType !== 'emoji' || !r.emoji) continue
    let group = byEmoji.get(r.emoji)
    if (!group) {
      group = { emoji: r.emoji, count: 0, mine: false, reactors: [] }
      byEmoji.set(r.emoji, group)
    }
    if (group.reactors.includes(r.reactor)) continue
    group.reactors.push(r.reactor)
    group.count += 1
    if (r.reactor === me) {
      group.mine = true
      group.myReactionId = r.id
    }
  }
  return [...byEmoji.values()]
}
