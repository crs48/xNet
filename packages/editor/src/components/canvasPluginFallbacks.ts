/**
 * Canvas plugin fallback descriptors.
 */

export type CanvasMissingPluginFallbackReason =
  | 'plugin-not-installed'
  | 'plugin-disabled'
  | 'contribution-missing'
  | 'renderer-missing'
  | 'renderer-blocked'
  | 'permission-required'
  | 'sandbox-blocked'
  | 'unsupported-version'
  | 'plugin-error'

export type CanvasMissingPluginFallbackTone = 'neutral' | 'warning' | 'danger'

export type CanvasMissingPluginFallbackActionKind =
  | 'install-plugin'
  | 'enable-plugin'
  | 'request-permission'
  | 'retry-renderer'
  | 'open-source'
  | 'view-json'

export type CanvasMissingPluginFallbackAction = {
  kind: CanvasMissingPluginFallbackActionKind
  label: string
  ariaLabel: string
}

export type CanvasMissingPluginFallback = {
  reason: CanvasMissingPluginFallbackReason
  label: string
  description: string
  tone: CanvasMissingPluginFallbackTone
  pluginId: string | null
  pluginName: string | null
  contributionId: string | null
  contributionName: string | null
  sourceLabel: string | null
  sourceUrl: string | null
  requiredPermissions: readonly string[]
  actions: readonly CanvasMissingPluginFallbackAction[]
  preservesSource: true
}

export type CreateCanvasMissingPluginFallbackInput = {
  reason: CanvasMissingPluginFallbackReason
  pluginId?: string | null
  pluginName?: string | null
  contributionId?: string | null
  contributionName?: string | null
  sourceLabel?: string | null
  sourceUrl?: string | null
  requiredPermissions?: readonly string[] | null
}

const ACTION_LABELS: Record<
  CanvasMissingPluginFallbackActionKind,
  { label: string; ariaLabel: string }
> = {
  'install-plugin': { label: 'Install', ariaLabel: 'Install required plugin' },
  'enable-plugin': { label: 'Enable', ariaLabel: 'Enable plugin' },
  'request-permission': { label: 'Allow', ariaLabel: 'Request plugin permission' },
  'retry-renderer': { label: 'Retry', ariaLabel: 'Retry plugin renderer' },
  'open-source': { label: 'Open', ariaLabel: 'Open preserved source' },
  'view-json': { label: 'JSON', ariaLabel: 'View preserved object JSON' }
}

function normalizeValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeValues(values: readonly string[] | null | undefined): readonly string[] {
  if (!values) {
    return []
  }

  return values.map((value) => value.trim()).filter((value) => value.length > 0)
}

function createAction(
  kind: CanvasMissingPluginFallbackActionKind
): CanvasMissingPluginFallbackAction {
  return {
    kind,
    label: ACTION_LABELS[kind].label,
    ariaLabel: ACTION_LABELS[kind].ariaLabel
  }
}

function describePermissions(requiredPermissions: readonly string[]): string {
  if (requiredPermissions.length === 0) {
    return 'additional plugin permissions'
  }

  if (requiredPermissions.length === 1) {
    return requiredPermissions[0] ?? 'additional plugin permissions'
  }

  return `${requiredPermissions.slice(0, -1).join(', ')} and ${
    requiredPermissions[requiredPermissions.length - 1]
  }`
}

function createReasonConfig(input: {
  reason: CanvasMissingPluginFallbackReason
  pluginLabel: string
  contributionLabel: string
  requiredPermissions: readonly string[]
}): {
  label: string
  description: string
  tone: CanvasMissingPluginFallbackTone
  primaryActions: readonly CanvasMissingPluginFallbackActionKind[]
} {
  switch (input.reason) {
    case 'plugin-not-installed':
      return {
        label: 'Plugin required',
        description: `${input.pluginLabel} is needed to render this ${input.contributionLabel}. The original canvas object is preserved and can be restored after installing the plugin.`,
        tone: 'warning',
        primaryActions: ['install-plugin']
      }
    case 'plugin-disabled':
      return {
        label: 'Plugin disabled',
        description: `${input.pluginLabel} is installed but disabled for this workspace. Enable it to render the ${input.contributionLabel} card again.`,
        tone: 'warning',
        primaryActions: ['enable-plugin']
      }
    case 'contribution-missing':
    case 'renderer-missing':
      return {
        label: 'Renderer missing',
        description: `${input.pluginLabel} does not provide the ${input.contributionLabel} renderer expected by this object. The saved object data is still available.`,
        tone: 'warning',
        primaryActions: ['retry-renderer']
      }
    case 'renderer-blocked':
      return {
        label: 'Renderer blocked',
        description: `Workspace policy blocked ${input.pluginLabel} from rendering this ${input.contributionLabel} card.`,
        tone: 'danger',
        primaryActions: ['request-permission', 'retry-renderer']
      }
    case 'permission-required':
      return {
        label: 'Permission required',
        description: `${input.pluginLabel} needs ${describePermissions(
          input.requiredPermissions
        )} before it can render this ${input.contributionLabel} card.`,
        tone: 'warning',
        primaryActions: ['request-permission']
      }
    case 'sandbox-blocked':
      return {
        label: 'Sandbox blocked',
        description: `The canvas sandbox blocked ${input.pluginLabel} while rendering this ${input.contributionLabel} card. The object remains recoverable from its preserved data.`,
        tone: 'danger',
        primaryActions: ['request-permission', 'retry-renderer']
      }
    case 'unsupported-version':
      return {
        label: 'Plugin update required',
        description: `${input.pluginLabel} cannot render this ${input.contributionLabel} card until the plugin or card contribution is updated.`,
        tone: 'warning',
        primaryActions: ['install-plugin']
      }
    case 'plugin-error':
      return {
        label: 'Plugin render failed',
        description: `${input.pluginLabel} failed while rendering this ${input.contributionLabel} card. The source data is preserved so the card can be retried or inspected.`,
        tone: 'danger',
        primaryActions: ['retry-renderer']
      }
  }
}

function createActions(input: {
  primaryActions: readonly CanvasMissingPluginFallbackActionKind[]
  hasSourceUrl: boolean
}): readonly CanvasMissingPluginFallbackAction[] {
  const orderedActions: CanvasMissingPluginFallbackActionKind[] = []

  for (const action of input.primaryActions) {
    if (!orderedActions.includes(action)) {
      orderedActions.push(action)
    }
  }

  if (input.hasSourceUrl && !orderedActions.includes('open-source')) {
    orderedActions.push('open-source')
  }

  orderedActions.push('view-json')

  return orderedActions.map(createAction)
}

export function createCanvasMissingPluginFallback(
  input: CreateCanvasMissingPluginFallbackInput
): CanvasMissingPluginFallback {
  const pluginId = normalizeValue(input.pluginId)
  const pluginName = normalizeValue(input.pluginName)
  const contributionId = normalizeValue(input.contributionId)
  const contributionName = normalizeValue(input.contributionName)
  const sourceLabel = normalizeValue(input.sourceLabel)
  const sourceUrl = normalizeValue(input.sourceUrl)
  const requiredPermissions = normalizeValues(input.requiredPermissions)
  const pluginLabel = pluginName ?? pluginId ?? 'The required plugin'
  const contributionLabel = contributionName ?? contributionId ?? 'canvas card'
  const config = createReasonConfig({
    reason: input.reason,
    pluginLabel,
    contributionLabel,
    requiredPermissions
  })

  return {
    reason: input.reason,
    label: config.label,
    description: config.description,
    tone: config.tone,
    pluginId,
    pluginName,
    contributionId,
    contributionName,
    sourceLabel,
    sourceUrl,
    requiredPermissions,
    actions: createActions({
      primaryActions: config.primaryActions,
      hasSourceUrl: Boolean(sourceUrl)
    }),
    preservesSource: true
  }
}
