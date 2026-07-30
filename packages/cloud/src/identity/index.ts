/**
 * @xnetjs/cloud/identity — public API.
 *
 * Two-identity model for xNet Cloud: a custodial billing identity (WorkOS AuthKit)
 * bound to a non-custodial data DID, with billing-only account recovery
 * (explorations 0174/0175).
 */

export {
  MemoryBindingStore,
  bindIdentities,
  recoverPaidAccount,
  completeRebind,
  accountSubjectForDid,
  bindingAccount,
  type TenantBinding,
  type BindingStore,
  type BindArgs,
  type DidChallenge,
  type DidChallengeVerifier
} from './binding'

export {
  MemoryBillingIdentityProvider,
  type BillingIdentityProvider,
  type BillingUser,
  type AuthenticationResult,
  type AuthorizationUrlOptions
} from './provider'

export { WorkOSAuthKitProvider, type WorkOSAuthKitConfig } from './workos'

// Recovery anchor (0243/0322/0338): WorkOS as a RecoveryAnchorProvider sibling
// of the ATProto anchor, both writing the same escrow envelope.
export { WorkOSRecoveryAnchor } from './workos-anchor'
