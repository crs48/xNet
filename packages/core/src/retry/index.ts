/**
 * Retry/backoff policy vocabulary (exploration 0303).
 *
 * Re-exported from the package root so consumers can
 * `import { exponential } from '@xnetjs/core'`.
 */
export type { RetryPolicy } from './policy'
export { capped, exponential, fixed, jittered, limitAttempts } from './policy'
