/**
 * Shared, dependency-free utility helpers.
 *
 * Re-exported from the package root so consumers can `import { clamp } from
 * '@xnetjs/core'`.
 */
export { clamp, clamp01 } from './math'
export { formatBytes } from './format'
export { SsrfError, assertPublicUrl, validateExternalUrl } from './ssrf'
