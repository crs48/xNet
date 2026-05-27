/**
 * Canvas plugin permission policy helpers.
 */

import type { CanvasContributionPermission } from './contributions'

export type CanvasPluginPermissionDecisionStatus = 'allowed' | 'prompt-required' | 'blocked'

export type CanvasPluginPromptMode = 'allow-once' | 'allow-workspace' | 'deny'

export type CanvasPluginWorkspacePolicy = {
  allowUnknownPlugins?: boolean
  trustedPluginIds?: string[]
  blockedPluginIds?: string[]
  allowedPermissions?: CanvasContributionPermission[] | '*'
  blockedPermissions?: CanvasContributionPermission[]
  promptPermissions?: CanvasContributionPermission[]
  allowedNetworkDomains?: string[]
  blockedNetworkDomains?: string[]
}

export type CanvasPluginPermissionGateInput = {
  pluginId: string
  contributionId: string
  contributionName?: string
  requestedPermissions?: CanvasContributionPermission[]
  requestedNetworkDomains?: string[]
  policy?: CanvasPluginWorkspacePolicy | null
}

export type CanvasPluginPermissionPromptOption = {
  mode: CanvasPluginPromptMode
  label: string
  description: string
  persistsDecision: boolean
}

export type CanvasPluginPermissionPrompt = {
  pluginId: string
  contributionId: string
  title: string
  message: string
  requestedPermissions: CanvasContributionPermission[]
  requestedNetworkDomains: string[]
  options: CanvasPluginPermissionPromptOption[]
}

export type CanvasPluginPermissionGateDecision = {
  status: CanvasPluginPermissionDecisionStatus
  allowed: boolean
  prompt: CanvasPluginPermissionPrompt | null
  grantedPermissions: CanvasContributionPermission[]
  pendingPermissions: CanvasContributionPermission[]
  blockedPermissions: CanvasContributionPermission[]
  blockedNetworkDomains: string[]
  pendingNetworkDomains: string[]
  issues: string[]
}

const DEFAULT_ALLOWED_PERMISSIONS: CanvasContributionPermission[] = ['canvas.read', 'canvas.render']

const DEFAULT_PROMPT_PERMISSIONS: CanvasContributionPermission[] = [
  'canvas.write',
  'canvas.ingest',
  'canvas.layout',
  'network',
  'storage',
  'clipboard'
]

const DEFAULT_PROMPT_OPTIONS: CanvasPluginPermissionPromptOption[] = [
  {
    mode: 'allow-once',
    label: 'Allow once',
    description: 'Grant this request for the current action only.',
    persistsDecision: false
  },
  {
    mode: 'allow-workspace',
    label: 'Allow in workspace',
    description: 'Remember this grant for this plugin in the current workspace.',
    persistsDecision: true
  },
  {
    mode: 'deny',
    label: 'Deny',
    description: 'Block this plugin request.',
    persistsDecision: false
  }
]

export function evaluateCanvasPluginPermissionGate(
  input: CanvasPluginPermissionGateInput
): CanvasPluginPermissionGateDecision {
  const policy = normalizeCanvasPluginWorkspacePolicy(input.policy)
  const requestedPermissions = uniquePermissions(input.requestedPermissions ?? [])
  const requestedNetworkDomains = normalizeDomains(input.requestedNetworkDomains ?? [])
  const issues: string[] = []

  if (policy.blockedPluginIds.includes(input.pluginId)) {
    issues.push(`Plugin '${input.pluginId}' is blocked by workspace policy`)
  }

  const blockedPermissions = requestedPermissions.filter((permission) =>
    policy.blockedPermissions.includes(permission)
  )
  for (const permission of blockedPermissions) {
    issues.push(`Permission '${permission}' is blocked by workspace policy`)
  }

  const blockedNetworkDomains = requestedNetworkDomains.filter((domain) =>
    policy.blockedNetworkDomains.includes(domain)
  )
  for (const domain of blockedNetworkDomains) {
    issues.push(`Network domain '${domain}' is blocked by workspace policy`)
  }

  if (issues.length > 0) {
    return {
      status: 'blocked',
      allowed: false,
      prompt: null,
      grantedPermissions: [],
      pendingPermissions: [],
      blockedPermissions,
      blockedNetworkDomains,
      pendingNetworkDomains: [],
      issues
    }
  }

  const pluginTrusted = policy.trustedPluginIds.includes(input.pluginId)
  const grantedPermissions = requestedPermissions.filter((permission) =>
    isPermissionGranted({ permission, policy, pluginTrusted })
  )
  const pendingPermissions = requestedPermissions.filter(
    (permission) => !grantedPermissions.includes(permission)
  )
  const pendingNetworkDomains = requestedNetworkDomains.filter(
    (domain) => !policy.allowedNetworkDomains.includes(domain)
  )
  const unknownPluginNeedsPrompt = !policy.allowUnknownPlugins && !pluginTrusted
  const requiresPrompt =
    unknownPluginNeedsPrompt ||
    pendingPermissions.length > 0 ||
    (requestedPermissions.includes('network') && pendingNetworkDomains.length > 0)

  if (!requiresPrompt) {
    return {
      status: 'allowed',
      allowed: true,
      prompt: null,
      grantedPermissions,
      pendingPermissions: [],
      blockedPermissions: [],
      blockedNetworkDomains: [],
      pendingNetworkDomains: [],
      issues: []
    }
  }

  return {
    status: 'prompt-required',
    allowed: false,
    prompt: createCanvasPluginPermissionPrompt({
      ...input,
      requestedPermissions,
      requestedNetworkDomains
    }),
    grantedPermissions,
    pendingPermissions,
    blockedPermissions: [],
    blockedNetworkDomains: [],
    pendingNetworkDomains,
    issues: unknownPluginNeedsPrompt
      ? [`Plugin '${input.pluginId}' requires workspace approval`]
      : []
  }
}

export function createCanvasPluginPermissionPrompt(input: {
  pluginId: string
  contributionId: string
  contributionName?: string
  requestedPermissions: CanvasContributionPermission[]
  requestedNetworkDomains: string[]
}): CanvasPluginPermissionPrompt {
  const label = input.contributionName ?? input.contributionId
  const permissionText =
    input.requestedPermissions.length > 0
      ? input.requestedPermissions.join(', ')
      : 'no extra permissions'
  const domainText =
    input.requestedNetworkDomains.length > 0
      ? ` Network domains: ${input.requestedNetworkDomains.join(', ')}.`
      : ''

  return {
    pluginId: input.pluginId,
    contributionId: input.contributionId,
    title: `Allow ${label}?`,
    message: `This canvas plugin contribution requests ${permissionText}.${domainText}`,
    requestedPermissions: uniquePermissions(input.requestedPermissions),
    requestedNetworkDomains: normalizeDomains(input.requestedNetworkDomains),
    options: DEFAULT_PROMPT_OPTIONS.map((option) => ({ ...option }))
  }
}

export function normalizeCanvasPluginWorkspacePolicy(
  policy?: CanvasPluginWorkspacePolicy | null
): Required<CanvasPluginWorkspacePolicy> {
  return {
    allowUnknownPlugins: policy?.allowUnknownPlugins ?? true,
    trustedPluginIds: [...(policy?.trustedPluginIds ?? [])],
    blockedPluginIds: [...(policy?.blockedPluginIds ?? [])],
    allowedPermissions: policy?.allowedPermissions ?? DEFAULT_ALLOWED_PERMISSIONS,
    blockedPermissions: [...(policy?.blockedPermissions ?? [])],
    promptPermissions: policy?.promptPermissions ?? DEFAULT_PROMPT_PERMISSIONS,
    allowedNetworkDomains: normalizeDomains(policy?.allowedNetworkDomains ?? []),
    blockedNetworkDomains: normalizeDomains(policy?.blockedNetworkDomains ?? [])
  }
}

function isPermissionGranted(input: {
  permission: CanvasContributionPermission
  policy: Required<CanvasPluginWorkspacePolicy>
  pluginTrusted: boolean
}): boolean {
  const { permission, policy, pluginTrusted } = input

  if (pluginTrusted) return true
  if (policy.allowedPermissions === '*') return true
  if (policy.allowedPermissions.includes(permission)) return true
  if (!policy.promptPermissions.includes(permission)) return true

  return false
}

function uniquePermissions(
  permissions: CanvasContributionPermission[]
): CanvasContributionPermission[] {
  return [...new Set(permissions)]
}

function normalizeDomains(domains: string[]): string[] {
  return [...new Set(domains.map(normalizeDomain).filter(Boolean))]
}

function normalizeDomain(domain: string): string {
  try {
    return new URL(domain.includes('://') ? domain : `https://${domain}`).hostname.toLowerCase()
  } catch {
    return domain.trim().toLowerCase()
  }
}
