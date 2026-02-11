# 07: DX, DevTools & Validation

> React hooks, DevTools AuthZ panel with 5 sub-tabs (including grant timeline, delegation tree, and revocation propagation), AI/agent validation API, and developer recipes.

**Duration:** 5 days
**Dependencies:** [06-hub-and-peer-filtering.md](./06-hub-and-peer-filtering.md)
**Packages:** `packages/react`, `packages/devtools`, `packages/data`
**Review issues addressed:** E4 (operational debugging), C1 (useNodeStore is internal, not public)

## Why This Step Exists

Authorization is only useful if developers can easily use it, debug it, and validate it. This step provides React hooks, a comprehensive DevTools panel, and AI-friendly APIs.

**New in V2:** The DevTools AuthZ panel has 5 sub-tabs (not 4) covering grant timeline, delegation tree, and revocation propagation status — addressing the observability gaps identified in the review.

## Implementation

### 1. React Hooks (`packages/react`)

#### `useCan` Hook

```typescript
export interface UseCanResult {
  canRead: boolean
  canWrite: boolean
  canDelete: boolean
  canShare: boolean
  loading: boolean
  error: Error | null
  isFresh: boolean
  evaluatedAt: number
}

export function useCan(nodeId: string): UseCanResult {
  // NOTE: uses internal useNodeStore() hook (not public useStore())
  // useNodeStore is exported via @xnet/react/internal for devtools only
  const { store } = useNodeStoreInternal()
  const [state, setState] = useState<UseCanResult>({
    canRead: false,
    canWrite: false,
    canDelete: false,
    canShare: false,
    loading: true,
    error: null,
    isFresh: false,
    evaluatedAt: 0
  })

  useEffect(() => {
    if (!store) return
    let cancelled = false

    async function check() {
      try {
        const [read, write, del, share] = await Promise.all([
          store.auth.can({ action: 'read', nodeId }),
          store.auth.can({ action: 'write', nodeId }),
          store.auth.can({ action: 'delete', nodeId }),
          store.auth.can({ action: 'share', nodeId })
        ])

        if (!cancelled) {
          setState({
            canRead: read.allowed,
            canWrite: write.allowed,
            canDelete: del.allowed,
            canShare: share.allowed,
            loading: false,
            error: null,
            isFresh: !read.cached,
            evaluatedAt: read.evaluatedAt
          })
        }
      } catch (err) {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false, error: err as Error }))
        }
      }
    }

    check()

    // Re-check on any node change (store.subscribe is global)
    const unsub = store.subscribe((event) => {
      if (event.change?.payload?.nodeId === nodeId) check()
      // Also re-check if a Grant node for this resource changed
      if (
        event.node?.schemaId === 'xnet://xnet.fyi/Grant' &&
        event.node?.properties?.resource === nodeId
      ) {
        check()
      }
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [store, nodeId])

  return state
}
```

#### `useGrants` Hook

```typescript
export interface UseGrantsResult {
  grants: Grant[]
  loading: boolean
  error: Error | null
  grant: (input: GrantInput) => Promise<Grant>
  revoke: (grantId: string) => Promise<void>
}

export function useGrants(nodeId: string): UseGrantsResult {
  const { store } = useNodeStoreInternal()
  const [grants, setGrants] = useState<Grant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!store) return
    let cancelled = false

    async function load() {
      try {
        const result = await store.auth.listGrants({ nodeId })
        if (!cancelled) {
          setGrants(result)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) setError(err as Error)
      }
    }

    load()

    // Re-load when grant nodes change
    const unsub = store.subscribe((event) => {
      if (
        event.node?.schemaId === 'xnet://xnet.fyi/Grant' &&
        event.node?.properties?.resource === nodeId
      ) {
        load()
      }
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [store, nodeId])

  const grantFn = useCallback(
    (input: GrantInput) => store!.auth.grant({ ...input, resource: nodeId }),
    [store, nodeId]
  )

  const revokeFn = useCallback((grantId: string) => store!.auth.revoke({ grantId }), [store])

  return { grants, loading, error, grant: grantFn, revoke: revokeFn }
}
```

### 2. DevTools AuthZ Panel (`packages/devtools`)

Register as the 15th panel in the existing DevTools shell:

```typescript
export const DEVTOOLS_PANELS = [
  // ... existing 14 panels ...
  { id: 'authz', label: 'AuthZ', icon: ShieldIcon }
] as const
```

#### 5 Sub-Tabs

```tsx
export function AuthZPanel() {
  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="playground">
        <TabsList>
          <TabsTrigger value="playground">Playground</TabsTrigger>
          <TabsTrigger value="grants">Grants</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="delegation">Delegation</TabsTrigger>
          <TabsTrigger value="propagation">Propagation</TabsTrigger>
        </TabsList>

        <TabsContent value="playground">
          <PermissionPlayground />
        </TabsContent>

        <TabsContent value="grants">
          <GrantManager />
        </TabsContent>

        <TabsContent value="timeline">
          <GrantTimeline />
        </TabsContent>

        <TabsContent value="delegation">
          <DelegationTreeExplorer />
        </TabsContent>

        <TabsContent value="propagation">
          <RevocationPropagation />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

#### Permission Playground

Interactive tool for testing authorization checks:

```tsx
function PermissionPlayground() {
  const [subject, setSubject] = useState('')
  const [action, setAction] = useState<AuthAction>('read')
  const [nodeId, setNodeId] = useState('')
  const [result, setResult] = useState<AuthTrace | null>(null)

  const handleCheck = async () => {
    const trace = await store.auth.explain({ action, nodeId })
    setResult(trace)
  }

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-3 gap-2">
        <Input label="Subject DID" value={subject} onChange={setSubject} />
        <Select label="Action" value={action} options={AUTH_ACTIONS} onChange={setAction} />
        <Input label="Node ID" value={nodeId} onChange={setNodeId} />
      </div>
      <Button onClick={handleCheck}>Check Permission</Button>

      {result && (
        <div className="mt-4">
          <Badge variant={result.allowed ? 'success' : 'destructive'}>
            {result.allowed ? 'ALLOWED' : 'DENIED'}
          </Badge>
          <div className="mt-2 text-sm">
            <p>Roles: {result.roles.join(', ') || 'none'}</p>
            <p>Grants: {result.grants.join(', ') || 'none'}</p>
            <p>Duration: {result.duration.toFixed(2)}ms</p>
            {result.reasons.length > 0 && (
              <p className="text-red-500">Reasons: {result.reasons.join(', ')}</p>
            )}
          </div>
          <h4 className="mt-4 font-semibold">Evaluation Steps</h4>
          {result.steps.map((step, i) => (
            <TraceStepRow key={i} step={step} />
          ))}
        </div>
      )}
    </div>
  )
}
```

#### Grant Timeline (NEW in V2)

Shows grant creation, revocation, and expiration events on a visual timeline — similar to the existing Change Timeline panel:

```tsx
function GrantTimeline() {
  const events = useGrantEvents()

  return (
    <div className="space-y-1 p-4 font-mono text-xs">
      {events.map((event, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-muted-foreground w-20">{formatTime(event.timestamp)}</span>
          <Badge
            variant={
              event.type === 'created'
                ? 'outline'
                : event.type === 'revoked'
                  ? 'destructive'
                  : 'secondary'
            }
            className="text-xs w-16"
          >
            {event.type}
          </Badge>
          <span>{event.grantee?.slice(0, 16)}...</span>
          <span className="text-muted-foreground">{event.actions?.join(', ')}</span>
          <span className="text-muted-foreground">on {event.resource?.slice(0, 8)}...</span>
        </div>
      ))}
    </div>
  )
}
```

#### Delegation Tree Explorer (NEW in V2)

Interactive tree showing who delegated to whom, chain depth, and which links are active/revoked:

```tsx
function DelegationTreeExplorer() {
  const [selectedNode, setSelectedNode] = useState<string>('')
  const tree = useDelegationTree(selectedNode)

  return (
    <div className="p-4">
      <Input label="Node ID" value={selectedNode} onChange={setSelectedNode} />
      {tree && (
        <div className="mt-4">
          <TreeView
            data={tree}
            renderNode={(node) => (
              <div className="flex items-center gap-2">
                <Badge variant={node.active ? 'outline' : 'destructive'}>
                  {node.active ? 'active' : 'revoked'}
                </Badge>
                <span>{node.grantee?.slice(0, 16)}...</span>
                <span className="text-muted-foreground text-xs">
                  depth: {node.depth}/{DELEGATION_LIMITS.maxProofDepth}
                </span>
              </div>
            )}
          />
        </div>
      )}
    </div>
  )
}
```

#### Revocation Propagation Status (NEW in V2)

Shows which peers have received a revocation update and which haven't:

```tsx
function RevocationPropagation() {
  const recentRevocations = useRecentRevocations()

  return (
    <div className="p-4 space-y-4">
      {recentRevocations.map((rev) => (
        <div key={rev.grantId} className="border rounded p-3">
          <div className="flex items-center justify-between">
            <span>Grant {rev.grantId.slice(0, 8)}... revoked</span>
            <span className="text-muted-foreground text-xs">
              {formatDuration(Date.now() - rev.revokedAt)} ago
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {rev.peers.map((peer) => (
              <div key={peer.did} className="flex items-center gap-2 text-sm">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full',
                    peer.synced ? 'bg-green-500' : 'bg-yellow-500'
                  )}
                />
                <span>{peer.did.slice(0, 16)}...</span>
                <span className="text-muted-foreground">
                  {peer.synced ? 'synced' : `lag: ${formatDuration(peer.lag)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

### 3. AI/Agent Validation API

```typescript
// AI agents can validate authorization rules programmatically
const trace = await store.auth.explain({ action: 'write', nodeId: taskId })

// Structured output for AI consumption
// {
//   "allowed": true,
//   "action": "write",
//   "subject": "did:key:z6Mk...",
//   "resource": "abc123",
//   "roles": ["editor"],
//   "grants": [],
//   "reasons": [],
//   "steps": [
//     { "phase": "node-deny", "output": { "denied": false }, "duration": 0.1 },
//     { "phase": "role-resolve", "output": { "roles": ["editor"] }, "duration": 1.5 },
//     { "phase": "schema-eval", "output": { "match": true }, "duration": 0.3 }
//   ]
// }
```

### 4. Developer Recipes

#### Gated Button

```tsx
function EditButton({ nodeId }: { nodeId: string }) {
  const { canWrite } = useCan(nodeId)
  return canWrite ? <Button>Edit</Button> : null
}
```

#### Share Dialog

```tsx
function ShareDialog({ nodeId }: { nodeId: string }) {
  const { canShare } = useCan(nodeId)
  const { grants, grant, revoke } = useGrants(nodeId)

  if (!canShare) return null

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Share</Button>
      </DialogTrigger>
      <DialogContent>
        <h3>Shared with</h3>
        {grants.map((g) => (
          <div key={g.id} className="flex items-center justify-between">
            <span>{g.grantee}</span>
            <span>{g.actions.join(', ')}</span>
            <Button variant="ghost" onClick={() => revoke(g.id)}>
              Revoke
            </Button>
          </div>
        ))}
        <ShareForm onShare={(did, actions) => grant({ to: did, actions, resource: nodeId })} />
      </DialogContent>
    </Dialog>
  )
}
```

## Tests

- `useCan`: returns correct booleans for authorized/unauthorized user.
- `useCan`: re-evaluates when node changes via `store.subscribe()`.
- `useCan`: re-evaluates when Grant node changes.
- `useGrants`: lists active grants.
- `useGrants`: grant function creates grant.
- `useGrants`: revoke function revokes grant.
- DevTools: AuthZ panel renders with all 5 sub-tabs.
- DevTools: Playground produces correct trace output.
- DevTools: Grant timeline shows grant lifecycle events.
- DevTools: Delegation tree renders chain correctly.
- `explain()`: returns structured trace with all phases.

## Checklist

- [ ] `useCan` hook with loading/error/freshness state.
- [ ] `useGrants` hook with grant/revoke callbacks.
- [ ] Both hooks use `store.subscribe()` (global listener, filter in callback).
- [ ] DevTools `AuthZ` tab registered as 15th panel.
- [ ] Permission Playground sub-tab.
- [ ] Grant Manager sub-tab.
- [ ] **Grant Timeline** sub-tab (NEW).
- [ ] **Delegation Tree Explorer** sub-tab (NEW).
- [ ] **Revocation Propagation** sub-tab (NEW).
- [ ] `explain()` API returns AI-friendly structured traces.
- [ ] Developer recipes documented.
- [ ] All tests passing.

---

[Back to README](./README.md) | [Previous: Hub and Peer Filtering](./06-hub-and-peer-filtering.md) | [Next: Performance, Security & Migration ->](./08-performance-security-and-migration.md)
