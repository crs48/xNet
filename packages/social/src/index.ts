/**
 * @xnetjs/social - Social graph import and query primitives.
 */

export * from './import'
export * from './importers'
export * from './feeds'
export * from './lenses'
export * from './patterns'
export * from './projection'
export * from './schemas'
export * from './connect'
export * from './views'
export * from './workspace'

// Community hosting (0359) — named re-exports per the sub-barrel policy.
export {
  isAnswered,
  markFirstPosts,
  welcomeQueue,
  type WelcomeCandidate,
  type WelcomeEntry
} from './community'

export type { SocialImportJobPhase, SocialImportJobStatus } from './import'
