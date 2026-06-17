/**
 * A small curated emoji set for the chat picker (0198) — dependency-free so we
 * avoid bundling a ~700KB emoji dataset. Each entry carries search keywords.
 * The first six double as the hover toolbar's quick reactions.
 */
export interface EmojiEntry {
  emoji: string
  name: string
  keywords: string[]
}

export const QUICK_REACTIONS = ['👍', '🎉', '❤️', '😄', '👀', '🚀'] as const

export const EMOJI_SET: EmojiEntry[] = [
  { emoji: '👍', name: 'thumbs up', keywords: ['+1', 'yes', 'approve', 'like'] },
  { emoji: '👎', name: 'thumbs down', keywords: ['-1', 'no', 'dislike'] },
  { emoji: '🎉', name: 'party', keywords: ['tada', 'celebrate', 'ship'] },
  { emoji: '❤️', name: 'heart', keywords: ['love', 'like'] },
  { emoji: '😄', name: 'smile', keywords: ['happy', 'joy', 'haha'] },
  { emoji: '😂', name: 'laughing', keywords: ['lol', 'funny', 'haha'] },
  { emoji: '😊', name: 'blush', keywords: ['happy', 'smile'] },
  { emoji: '😍', name: 'heart eyes', keywords: ['love', 'wow'] },
  { emoji: '🤔', name: 'thinking', keywords: ['hmm', 'consider'] },
  { emoji: '👀', name: 'eyes', keywords: ['looking', 'watch', 'see'] },
  { emoji: '🚀', name: 'rocket', keywords: ['ship', 'launch', 'fast'] },
  { emoji: '🔥', name: 'fire', keywords: ['lit', 'hot', 'great'] },
  { emoji: '✅', name: 'check', keywords: ['done', 'yes', 'complete'] },
  { emoji: '❌', name: 'cross', keywords: ['no', 'wrong', 'fail'] },
  { emoji: '🙏', name: 'pray', keywords: ['thanks', 'please', 'hope'] },
  { emoji: '👏', name: 'clap', keywords: ['applause', 'bravo'] },
  { emoji: '💯', name: 'hundred', keywords: ['100', 'perfect', 'agree'] },
  { emoji: '🙌', name: 'raised hands', keywords: ['celebrate', 'praise'] },
  { emoji: '🤝', name: 'handshake', keywords: ['deal', 'agree'] },
  { emoji: '💪', name: 'muscle', keywords: ['strong', 'power'] },
  { emoji: '🎯', name: 'target', keywords: ['goal', 'bullseye', 'exact'] },
  { emoji: '⭐', name: 'star', keywords: ['favorite', 'great'] },
  { emoji: '💡', name: 'idea', keywords: ['lightbulb', 'thought'] },
  { emoji: '⚡', name: 'zap', keywords: ['fast', 'energy', 'bolt'] },
  { emoji: '✨', name: 'sparkles', keywords: ['shiny', 'magic', 'new'] },
  { emoji: '🎊', name: 'confetti', keywords: ['celebrate', 'party'] },
  { emoji: '😅', name: 'sweat smile', keywords: ['phew', 'nervous'] },
  { emoji: '😬', name: 'grimace', keywords: ['yikes', 'awkward'] },
  { emoji: '😢', name: 'cry', keywords: ['sad', 'tear'] },
  { emoji: '😡', name: 'angry', keywords: ['mad', 'rage'] },
  { emoji: '🤯', name: 'mind blown', keywords: ['wow', 'shocked'] },
  { emoji: '🥳', name: 'partying face', keywords: ['celebrate', 'birthday'] },
  { emoji: '😎', name: 'cool', keywords: ['sunglasses', 'awesome'] },
  { emoji: '🙃', name: 'upside down', keywords: ['silly', 'irony'] },
  { emoji: '👋', name: 'wave', keywords: ['hi', 'hello', 'bye'] },
  { emoji: '🤷', name: 'shrug', keywords: ['idk', 'dunno', 'whatever'] },
  { emoji: '🫡', name: 'salute', keywords: ['yes', 'ok', 'respect'] },
  { emoji: '🤩', name: 'star struck', keywords: ['wow', 'amazing'] },
  { emoji: '😴', name: 'sleeping', keywords: ['tired', 'zzz'] },
  { emoji: '🤓', name: 'nerd', keywords: ['smart', 'glasses'] },
  { emoji: '🥺', name: 'pleading', keywords: ['please', 'puppy'] },
  { emoji: '😱', name: 'scream', keywords: ['shocked', 'fear'] },
  { emoji: '🤡', name: 'clown', keywords: ['joke', 'silly'] },
  { emoji: '💀', name: 'skull', keywords: ['dead', 'lol', 'rip'] },
  { emoji: '👻', name: 'ghost', keywords: ['boo', 'spooky'] },
  { emoji: '🐛', name: 'bug', keywords: ['issue', 'defect'] },
  { emoji: '📌', name: 'pin', keywords: ['important', 'save'] },
  { emoji: '📈', name: 'chart up', keywords: ['growth', 'metrics'] },
  { emoji: '🍕', name: 'pizza', keywords: ['food', 'lunch'] },
  { emoji: '☕', name: 'coffee', keywords: ['drink', 'morning'] },
  { emoji: '🎁', name: 'gift', keywords: ['present', 'reward'] },
  { emoji: '🏆', name: 'trophy', keywords: ['win', 'award', 'best'] }
]

/** Filter the set by a query against name + keywords (empty → everything). */
export function filterEmoji(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return EMOJI_SET
  return EMOJI_SET.filter(
    (entry) => entry.name.includes(q) || entry.keywords.some((keyword) => keyword.includes(q))
  )
}
