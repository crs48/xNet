/**
 * Types for `dev-scope.mjs` (0413).
 *
 * The resolver is plain `.mjs` because it has to run from a package script,
 * before any build step, and be importable by the Vite config and the dev
 * launcher alike. This declares its surface so `dev-scope.test.ts` — and any
 * future TypeScript consumer — types it instead of falling back to `any`.
 *
 * `DevScopePorts` / `DevScope` here mirror `src/main/dev-scope.ts`, which is
 * the *reader* for the same JSON. The two differ deliberately: the reader's
 * fields are nullable because it may be handed nothing at all, whereas the
 * resolver always produces a concrete answer.
 */

export interface ResolvedPorts {
  renderer: number
  cdp: number
  hub: number
  localApi: number
}

export interface ResolvedDevScope {
  profile: string
  /** False in the main checkout, where nothing relocates. */
  scoped: boolean
  worktree: string | null
  branch: string | null
  commit: string | null
  ports: ResolvedPorts
}

export declare const LEGACY_PORTS: Readonly<ResolvedPorts>
export declare const BLOCK_BASE: number
export declare const BLOCK_SIZE: number
export declare const BLOCK_COUNT: number

export declare function hashOffset(value: string, buckets?: number): number
export declare function linkedWorktreeRoot(cwd?: string): string | null
export declare function resolveDevScope(
  cwd?: string,
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
): ResolvedDevScope
export declare function scopeEnv(scope: ResolvedDevScope): Record<string, string>
