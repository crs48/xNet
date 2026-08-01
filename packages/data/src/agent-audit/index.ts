/**
 * Agent audit bundles — export and offline-verify what an agent did
 * (exploration 0416). See `types.ts` for the bundle layout.
 */

export {
  AGENT_AUDIT_BUNDLE_VERSION,
  type AgentAuditBundle,
  type AuditVerifyCode,
  type AuditVerifyProblem,
  type AuditVerifyReport,
  type BundleAction,
  type BundleApproval,
  type BundlePassport
} from './types'
export {
  buildAgentAuditBundle,
  parseAgentAuditBundle,
  serializeAgentAuditBundle,
  type AgentAuditSource,
  type BuildAgentAuditOptions
} from './build'
export { verifyAgentAudit, type VerifyAgentAuditOptions } from './verify'
