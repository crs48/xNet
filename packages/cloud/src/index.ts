/**
 * @xnetjs/cloud — public API (barrel).
 *
 * xNet Cloud's server-only managed-hosting library, consolidated from the former
 * seven `@xnetjs/cloud-*` packages into one FSL package with module seams
 * (exploration 0181). Prefer the subpath entry points — `@xnetjs/cloud/provisioner`,
 * `/identity`, `/billing`, `/ai`, `/storage`, `/litestream`, `/cost` — which keep
 * the ports-and-adapters boundaries crisp and tree-shakeable. This barrel re-exports
 * them for convenience.
 *
 * The plan/entitlement contract the self-hostable hub also reads lives in the
 * separate, permissively-licensed `@xnetjs/entitlements` — NOT here.
 */

export * from './provisioner'
export * from './identity'
export * from './billing'
export * from './ai'
export * from './storage'
export * from './litestream'
export * from './cost'
