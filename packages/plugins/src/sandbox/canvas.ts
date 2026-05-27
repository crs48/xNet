/**
 * Canvas Plugin Sandbox
 *
 * Policy helpers for plugin-owned canvas renderers and preview generators.
 */

import type {
  CanvasCardContribution,
  CanvasContributionPermission,
  CanvasInspectorContribution,
  CanvasTemplateContribution
} from '../contributions'

export type CanvasPluginSandboxKind = 'renderer' | 'preview'

export type CanvasPluginSandboxDomAccess = 'none' | 'isolated-iframe'

export type CanvasPluginSandboxNetworkAccess = 'none' | 'workspace-approved'

export type CanvasPluginSandboxMutationAccess = 'none'

export type CanvasPluginSandboxOutputKind =
  | 'view-model'
  | 'html-fragment'
  | 'summary'
  | 'thumbnail'
  | 'template-draft'

export type CanvasPluginSandboxPolicy = {
  kind: CanvasPluginSandboxKind
  timeoutMs: number
  maxOutputBytes: number
  domAccess: CanvasPluginSandboxDomAccess
  networkAccess: CanvasPluginSandboxNetworkAccess
  mutationAccess: CanvasPluginSandboxMutationAccess
  allowedOutputKinds: CanvasPluginSandboxOutputKind[]
  blockedGlobals: string[]
}

export type CanvasPluginSandboxRequest = {
  pluginId: string
  contributionId: string
  kind: CanvasPluginSandboxKind
  entrypoint: string
  permissions?: CanvasContributionPermission[]
  requestedNetworkDomains?: string[]
}

export type CanvasPluginSandboxDecision = {
  allowed: boolean
  policy: CanvasPluginSandboxPolicy
  issues: string[]
}

export type CanvasPluginSandboxOutput = {
  kind: CanvasPluginSandboxOutputKind
  payload?: unknown
  html?: string
  bytes?: number
}

export type CanvasPluginSandboxOutputValidation = {
  valid: boolean
  issues: string[]
}

export type CanvasRendererSandboxContribution =
  | CanvasCardContribution
  | CanvasInspectorContribution
  | CanvasTemplateContribution

const CANVAS_SANDBOX_BLOCKED_GLOBALS = [
  'window.opener',
  'parent',
  'top',
  'document.cookie',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'eval',
  'Function',
  'Worker',
  'SharedWorker',
  'ServiceWorker',
  'WebAssembly'
]

const ENTRYPOINT_PATTERN = /^[a-z0-9][a-z0-9._/@:-]*(#[a-z0-9._:-]+)?$/i

const FORBIDDEN_HTML_PATTERNS = [
  /<\s*script\b/i,
  /\son[a-z]+\s*=/i,
  /javascript\s*:/i,
  /<\s*iframe\b/i,
  /<\s*object\b/i,
  /<\s*embed\b/i
]

export function createCanvasPluginSandboxPolicy(
  kind: CanvasPluginSandboxKind,
  permissions: CanvasContributionPermission[] = []
): CanvasPluginSandboxPolicy {
  const networkAccess =
    kind === 'renderer' && permissions.includes('network') ? 'workspace-approved' : 'none'

  return kind === 'renderer'
    ? {
        kind,
        timeoutMs: 750,
        maxOutputBytes: 64 * 1024,
        domAccess: 'isolated-iframe',
        networkAccess,
        mutationAccess: 'none',
        allowedOutputKinds: ['view-model', 'html-fragment'],
        blockedGlobals: [...CANVAS_SANDBOX_BLOCKED_GLOBALS]
      }
    : {
        kind,
        timeoutMs: 2_000,
        maxOutputBytes: 256 * 1024,
        domAccess: 'none',
        networkAccess: 'none',
        mutationAccess: 'none',
        allowedOutputKinds: ['summary', 'thumbnail', 'template-draft'],
        blockedGlobals: [...CANVAS_SANDBOX_BLOCKED_GLOBALS]
      }
}

export function evaluateCanvasPluginSandboxRequest(
  request: CanvasPluginSandboxRequest
): CanvasPluginSandboxDecision {
  const permissions = request.permissions ?? []
  const policy = createCanvasPluginSandboxPolicy(request.kind, permissions)
  const issues = [
    ...validateSandboxIdentity(request),
    ...validateSandboxPermissions(request, policy)
  ]

  return {
    allowed: issues.length === 0,
    policy,
    issues
  }
}

export function createCanvasRendererSandboxRequest(input: {
  pluginId: string
  contribution: CanvasRendererSandboxContribution
  entrypoint?: string
}): CanvasPluginSandboxRequest {
  return {
    pluginId: input.pluginId,
    contributionId: input.contribution.id,
    kind: 'renderer',
    entrypoint: input.entrypoint ?? getRendererEntrypoint(input.contribution),
    permissions: input.contribution.permissions
  }
}

export function createCanvasPreviewSandboxRequest(input: {
  pluginId: string
  contribution: CanvasCardContribution | CanvasTemplateContribution
  entrypoint?: string
}): CanvasPluginSandboxRequest {
  return {
    pluginId: input.pluginId,
    contributionId: input.contribution.id,
    kind: 'preview',
    entrypoint: input.entrypoint ?? getPreviewEntrypoint(input.contribution),
    permissions: input.contribution.permissions
  }
}

export function validateCanvasPluginSandboxOutput(
  output: CanvasPluginSandboxOutput,
  policy: CanvasPluginSandboxPolicy
): CanvasPluginSandboxOutputValidation {
  const issues: string[] = []

  if (!policy.allowedOutputKinds.includes(output.kind)) {
    issues.push(`Output kind '${output.kind}' is not allowed in ${policy.kind} sandbox`)
  }

  if (output.kind === 'html-fragment') {
    if (policy.domAccess !== 'isolated-iframe') {
      issues.push('HTML fragments require an isolated iframe renderer sandbox')
    }
    if (!isSafeHtmlFragment(output.html ?? '')) {
      issues.push('HTML fragment contains scriptable or nested browsing-context markup')
    }
  }

  const outputBytes = output.bytes ?? estimateOutputBytes(output)
  if (outputBytes > policy.maxOutputBytes) {
    issues.push(`Output is ${outputBytes} bytes, exceeding ${policy.maxOutputBytes} byte limit`)
  }

  return {
    valid: issues.length === 0,
    issues
  }
}

function validateSandboxIdentity(request: CanvasPluginSandboxRequest): string[] {
  const issues: string[] = []

  if (!request.pluginId) {
    issues.push('pluginId is required')
  }
  if (!request.contributionId) {
    issues.push('contributionId is required')
  }
  if (!ENTRYPOINT_PATTERN.test(request.entrypoint)) {
    issues.push(`Invalid canvas sandbox entrypoint: ${request.entrypoint}`)
  }

  return issues
}

function validateSandboxPermissions(
  request: CanvasPluginSandboxRequest,
  policy: CanvasPluginSandboxPolicy
): string[] {
  const permissions = request.permissions ?? []
  const issues: string[] = []

  if (permissions.includes('canvas.write')) {
    issues.push(`${request.kind} sandbox cannot request canvas.write`)
  }
  if (permissions.includes('clipboard')) {
    issues.push(`${request.kind} sandbox cannot request clipboard access`)
  }
  if (permissions.includes('storage') && request.kind === 'preview') {
    issues.push('preview sandbox cannot request storage access')
  }
  if (permissions.includes('network') && policy.networkAccess === 'none') {
    issues.push(`${request.kind} sandbox cannot request network access`)
  }
  if ((request.requestedNetworkDomains?.length ?? 0) > 0 && !permissions.includes('network')) {
    issues.push('requestedNetworkDomains requires network permission')
  }

  return issues
}

function getRendererEntrypoint(contribution: CanvasRendererSandboxContribution): string {
  if (contribution.type === 'canvas.inspector') {
    return contribution.panelEntrypoint
  }
  if (contribution.type === 'canvas.template') {
    return contribution.previewEntrypoint ?? contribution.instantiateEntrypoint
  }

  return contribution.rendererEntrypoint
}

function getPreviewEntrypoint(
  contribution: CanvasCardContribution | CanvasTemplateContribution
): string {
  if (contribution.type === 'canvas.template') {
    return contribution.previewEntrypoint ?? contribution.instantiateEntrypoint
  }

  return contribution.previewEntrypoint ?? contribution.rendererEntrypoint
}

function isSafeHtmlFragment(html: string): boolean {
  return FORBIDDEN_HTML_PATTERNS.every((pattern) => !pattern.test(html))
}

function estimateOutputBytes(output: CanvasPluginSandboxOutput): number {
  return new TextEncoder().encode(JSON.stringify(output)).byteLength
}
