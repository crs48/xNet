/**
 * Signed-replication policy helpers.
 */

export type ReplicationNamespaceKind = 'system' | 'user'

export type SyncFederationHub = {
  /**
   * Stable hub identifier used by policy nodes. Fallback hubs use their URL.
   */
  id: string
  /** WebSocket URL for this hub. */
  url: string
  /** Lower values are selected first when maxHubs prunes a plan. */
  priority?: number
  /** Namespace kinds this hub accepts. Omit to accept both. */
  kinds?: readonly ReplicationNamespaceKind[]
  /** Disabled hubs stay in config for traceability but are not selected. */
  disabled?: boolean
}

export type SyncFederationNamespacePolicy = {
  /** Exact namespace, namespace prefix, or `*`. */
  namespace: string
  /** Optional override when namespace syntax is ambiguous. */
  kind?: ReplicationNamespaceKind
  /** Restrict replication to these hub IDs. */
  includeHubIds?: readonly string[]
  /** Remove these hub IDs after includes/defaults are applied. */
  excludeHubIds?: readonly string[]
  /** Minimum destination count expected for this namespace. */
  minHubs?: number
  /** Maximum destination count. Pruning is priority/id deterministic. */
  maxHubs?: number
}

export type SyncFederationConfig = {
  /** Federated hub inventory. */
  hubs?: readonly SyncFederationHub[]
  /** Namespace-specific destination policies. */
  namespacePolicies?: readonly SyncFederationNamespacePolicy[]
  /** Default destinations for `sys/*` namespaces when no policy include list exists. */
  defaultSystemHubIds?: readonly string[]
  /** Default destinations for user namespaces when no policy include list exists. */
  defaultUserHubIds?: readonly string[]
}

export interface SyncCompatibilityConfig {
  /**
   * Temporary compatibility mode for legacy peers that still send unsigned
   * Yjs replication payloads.
   */
  allowUnsignedReplication?: boolean
}

export interface SyncReplicationConfig {
  /**
   * Compatibility toggles for older replication paths.
   */
  compatibility?: SyncCompatibilityConfig
  /**
   * Multi-hub federation routing policy.
   */
  federation?: SyncFederationConfig
}

export interface ResolvedSyncReplicationPolicy {
  /**
   * Whether unsigned replication payloads are accepted.
   */
  allowUnsignedReplication: boolean
  /**
   * Whether replication payloads must be signed.
   */
  requireSignedReplication: boolean
}

export type ReplicationPlanDestination = {
  hubId: string
  url: string
  priority: number
  reason: string
}

export type ReplicationPlanDiagnostic = {
  code:
    | 'no_hubs_configured'
    | 'policy_hub_not_found'
    | 'minimum_hubs_not_satisfied'
    | 'hub_kind_mismatch'
    | 'hub_disabled'
  message: string
  hubId?: string
}

export type ReplicationPlanTraceStep = {
  step: string
  message: string
  hubId?: string
  namespace?: string
}

export type ReplicationPlan = {
  namespace: string
  kind: ReplicationNamespaceKind
  policy: SyncFederationNamespacePolicy | null
  destinations: ReplicationPlanDestination[]
  diagnostics: ReplicationPlanDiagnostic[]
  trace: ReplicationPlanTraceStep[]
}

export type PolicyRevisionSimulation = {
  before: ReplicationPlan
  after: ReplicationPlan
  addedHubIds: string[]
  removedHubIds: string[]
  retainedHubIds: string[]
  changed: boolean
}

export function resolveSyncReplicationPolicy(
  config: SyncReplicationConfig | undefined
): ResolvedSyncReplicationPolicy {
  const allowUnsignedReplication = config?.compatibility?.allowUnsignedReplication === true

  return {
    allowUnsignedReplication,
    requireSignedReplication: !allowUnsignedReplication
  }
}

export function inferReplicationNamespaceKind(namespace: string): ReplicationNamespaceKind {
  const normalized = namespace.trim().toLowerCase()

  return normalized.startsWith('sys/') || normalized.includes('/sys/') ? 'system' : 'user'
}

export function normalizeSyncFederationHubs(
  config: SyncReplicationConfig | undefined,
  fallbackUrls: string[] = []
): SyncFederationHub[] {
  const configured = config?.federation?.hubs ?? []
  const fallback = fallbackUrls.map((url, index) => ({
    id: url,
    url,
    priority: configured.length + index
  }))

  const seen = new Set<string>()
  return [...configured, ...fallback]
    .map((hub, index) => ({
      ...hub,
      id: hub.id.trim(),
      url: hub.url.trim(),
      priority: hub.priority ?? index
    }))
    .filter((hub) => {
      if (!hub.id || !hub.url || seen.has(hub.id)) return false
      seen.add(hub.id)
      return true
    })
}

export function planReplicationDestinations(input: {
  namespace: string
  config?: SyncReplicationConfig
  fallbackHubUrls?: string[]
}): ReplicationPlan {
  const namespace = input.namespace.trim()
  const hubs = normalizeSyncFederationHubs(input.config, input.fallbackHubUrls)
  const policy = selectNamespacePolicy(input.config?.federation?.namespacePolicies ?? [], namespace)
  const kind = policy?.kind ?? inferReplicationNamespaceKind(namespace)
  const defaultHubIds =
    kind === 'system'
      ? input.config?.federation?.defaultSystemHubIds
      : input.config?.federation?.defaultUserHubIds
  const includeHubIds = policy?.includeHubIds ?? defaultHubIds
  const excludeHubIds = new Set(policy?.excludeHubIds ?? [])
  const diagnostics: ReplicationPlanDiagnostic[] = []
  const trace: ReplicationPlanTraceStep[] = [
    {
      step: 'classify',
      namespace,
      message: `Classified namespace as ${kind}.`
    }
  ]

  if (hubs.length === 0) {
    diagnostics.push({
      code: 'no_hubs_configured',
      message: 'No federation hubs were configured.'
    })
  }

  const byId = new Map(hubs.map((hub) => [hub.id, hub]))

  if (includeHubIds) {
    for (const hubId of includeHubIds) {
      if (!byId.has(hubId)) {
        diagnostics.push({
          code: 'policy_hub_not_found',
          hubId,
          message: `Policy references unknown hub "${hubId}".`
        })
      }
    }
  }

  const candidateHubs = includeHubIds
    ? includeHubIds.flatMap((hubId) => {
        const hub = byId.get(hubId)
        return hub ? [hub] : []
      })
    : hubs

  const destinations = candidateHubs
    .flatMap((hub): ReplicationPlanDestination[] => {
      if (hub.disabled) {
        diagnostics.push({
          code: 'hub_disabled',
          hubId: hub.id,
          message: `Hub "${hub.id}" is disabled.`
        })
        trace.push({
          step: 'reject-hub',
          hubId: hub.id,
          namespace,
          message: 'Rejected disabled hub.'
        })
        return []
      }

      if (excludeHubIds.has(hub.id)) {
        trace.push({
          step: 'exclude-hub',
          hubId: hub.id,
          namespace,
          message: 'Excluded by namespace policy.'
        })
        return []
      }

      if (hub.kinds && !hub.kinds.includes(kind)) {
        diagnostics.push({
          code: 'hub_kind_mismatch',
          hubId: hub.id,
          message: `Hub "${hub.id}" does not accept ${kind} namespaces.`
        })
        trace.push({
          step: 'reject-hub',
          hubId: hub.id,
          namespace,
          message: `Rejected because hub does not accept ${kind} namespaces.`
        })
        return []
      }

      return [
        {
          hubId: hub.id,
          url: hub.url,
          priority: hub.priority ?? 0,
          reason: policy ? `matched ${policy.namespace}` : 'default federation policy'
        }
      ]
    })
    .sort(compareDestinations)

  const maxHubs = policy?.maxHubs
  const selected = maxHubs && maxHubs >= 0 ? destinations.slice(0, maxHubs) : destinations
  const minHubs = policy?.minHubs

  if (minHubs && selected.length < minHubs) {
    diagnostics.push({
      code: 'minimum_hubs_not_satisfied',
      message: `Policy requires ${minHubs} hub(s), but only ${selected.length} matched.`
    })
  }

  trace.push({
    step: 'select',
    namespace,
    message: `Selected ${selected.length} destination hub(s).`
  })

  return {
    namespace,
    kind,
    policy: policy ?? null,
    destinations: selected,
    diagnostics,
    trace
  }
}

export function simulateSyncPolicyRevision(input: {
  namespace: string
  current?: SyncReplicationConfig
  revision?: SyncReplicationConfig
  fallbackHubUrls?: string[]
}): PolicyRevisionSimulation {
  const before = planReplicationDestinations({
    namespace: input.namespace,
    config: input.current,
    fallbackHubUrls: input.fallbackHubUrls
  })
  const after = planReplicationDestinations({
    namespace: input.namespace,
    config: input.revision,
    fallbackHubUrls: input.fallbackHubUrls
  })
  const beforeIds = new Set(before.destinations.map((destination) => destination.hubId))
  const afterIds = new Set(after.destinations.map((destination) => destination.hubId))
  const addedHubIds = after.destinations
    .map((destination) => destination.hubId)
    .filter((hubId) => !beforeIds.has(hubId))
  const removedHubIds = before.destinations
    .map((destination) => destination.hubId)
    .filter((hubId) => !afterIds.has(hubId))
  const retainedHubIds = after.destinations
    .map((destination) => destination.hubId)
    .filter((hubId) => beforeIds.has(hubId))

  return {
    before,
    after,
    addedHubIds,
    removedHubIds,
    retainedHubIds,
    changed: addedHubIds.length > 0 || removedHubIds.length > 0
  }
}

function selectNamespacePolicy(
  policies: readonly SyncFederationNamespacePolicy[],
  namespace: string
): SyncFederationNamespacePolicy | undefined {
  return policies
    .filter((policy) => namespaceMatches(policy.namespace, namespace))
    .sort(
      (left, right) =>
        right.namespace.length - left.namespace.length ||
        compareText(left.namespace, right.namespace)
    )[0]
}

function namespaceMatches(policyNamespace: string, namespace: string): boolean {
  return (
    policyNamespace === '*' ||
    namespace === policyNamespace ||
    namespace.startsWith(policyNamespace)
  )
}

function compareDestinations(
  left: ReplicationPlanDestination,
  right: ReplicationPlanDestination
): number {
  return left.priority - right.priority || compareText(left.hubId, right.hubId)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
