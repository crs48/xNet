/**
 * Community hosting primitives (exploration 0359).
 *
 * Scoped sub-barrel per the repo's barrel policy — the root `@xnetjs/social`
 * barrel re-exports this area as one grouped block.
 */

export {
  isAnswered,
  markFirstPosts,
  welcomeQueue,
  type WelcomeCandidate,
  type WelcomeEntry
} from './welcome'
