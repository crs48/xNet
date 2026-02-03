# Unified Query API: Datalog Power, TypeScript Ergonomics

> Designing a query API that feels like writing TypeScript but has the semantic power of Datalog — with joins, graph traversal, full-text search, aggregations, history queries, and real-time subscriptions unified into a single composable primitive.

## Context

[Exploration 0040](./0040_FIRST_CLASS_RELATIONS.md) established that first-class relations turn xNet's data into a navigable graph. But having a graph is useless without a way to **query** it. Today, `useQuery` supports flat `where` equality checks and client-side sorting — roughly equivalent to `SELECT * FROM table WHERE col = val ORDER BY col`. This is adequate for simple cases but falls apart for:

- Joins across relations ("tasks with their comments and assignees")
- Reverse lookups ("everything pointing at this node")
- Aggregations ("count of comments per task")
- Graph traversal ("all descendants of this project")
- Full-text search ("tasks containing 'authentication'")
- History queries ("what did this node look like last Tuesday?")
- Computed fields ("tasks where `dueDate < now()`")

This exploration designs a **single, composable query API** that handles all of these — with full TypeScript type inference, real-time reactivity, and no custom query language to learn.

## Design Principles

1. **JSON-native**: Queries are plain TypeScript objects. No string-based query language, no template literals, no DSL parser.
2. **Schema-driven types**: Every query is fully typed from the schema. Invalid property names, wrong value types, and impossible joins are caught at compile time.
3. **Composable**: Small primitives combine into complex queries. Each primitive is independently useful.
4. **Reactive by default**: Every query is a live subscription in React. The same query shape works for one-shot reads in non-React contexts.
5. **Local-first aware**: Queries run against the local store. Missing data returns stubs, not errors. The query result improves as sync fills in gaps.
6. **Familiar**: If you know SQL, Prisma, Drizzle, or Convex, you can read xNet queries without documentation.

## Part 1: The Query Landscape

### What Exists Today

```typescript
// List all tasks
const { data: tasks } = useQuery(TaskSchema)

// Get one by ID
const { data: task } = useQuery(TaskSchema, taskId)

// Filter + sort
const { data: urgent } = useQuery(TaskSchema, {
  where: { status: 'urgent' },
  orderBy: { createdAt: 'desc' },
  limit: 10
})
```

### What's Missing

```mermaid
mindmap
  root((Query Capabilities))
    Today
      Equality filter
      Single-field sort
      Limit/offset
      Get by ID
    Missing: Filtering
      Comparison operators
      Logical combinators
      Regex / pattern match
      Null checks
      Array contains
    Missing: Relations
      Forward join
      Reverse join
      Multi-hop traversal
      Recursive / transitive
    Missing: Aggregation
      Count
      Sum / Avg / Min / Max
      Group by
      Having
    Missing: Search
      Full-text search
      Fuzzy matching
      Ranked results
    Missing: History
      Point-in-time queries
      Change log for a node
      Diff between versions
    Missing: Compute
      Expressions in filters
      Derived fields
      Conditional logic
```

## Part 2: API Design Explorations

### Option A: Fluent Builder (Convex-Style)

A chainable API where each method narrows the query:

```typescript
// Simple
const tasks = useQuery(Task).collect()

// Filtered
const urgent = useQuery(Task)
  .where('status', '=', 'urgent')
  .where('dueDate', '<', new Date())
  .orderBy('dueDate', 'asc')
  .take(10)

// With join
const tasksWithComments = useQuery(Task)
  .where('status', '!=', 'done')
  .include({ comments: query(Comment).where('target', '=', ref('id')) })
  .collect()

// Reverse lookup
const commentsOnTask = useQuery(Comment)
  .where('target', '=', taskId)
  .include({ author: query(Person).where('did', '=', ref('createdBy')) })
  .collect()
```

**Pros**: Familiar to Convex/Prisma/Drizzle users. Each step is discoverable via autocomplete. Easy to conditionally add clauses.

**Cons**: Chainable APIs are hard to type correctly in TypeScript (each `.where()` should narrow the return type). Serialization for sync/cache is awkward (methods aren't JSON). Conditional composition requires breaking the chain.

### Option B: Declarative Object (Prisma-Style)

Queries are plain objects describing what you want:

```typescript
// Simple
const tasks = useQuery(Task, {})

// Filtered
const urgent = useQuery(Task, {
  where: {
    status: 'urgent',
    dueDate: { $lt: new Date() }
  },
  orderBy: { dueDate: 'asc' },
  limit: 10
})

// With join
const tasksWithComments = useQuery(Task, {
  where: { status: { $ne: 'done' } },
  include: {
    comments: { schema: Comment, on: 'target', reverse: true },
    parent: { on: 'parent' }
  }
})

// Aggregation
const stats = useQuery(Task, {
  where: { project: projectId },
  groupBy: 'status',
  aggregate: { count: { $count: true } }
})
```

**Pros**: JSON-serializable. Easy to store, compare, and cache. Familiar to MongoDB/Prisma users. Works well with TypeScript generics.

**Cons**: Deeply nested objects become hard to read. The `$` operator prefix feels foreign to some. Less discoverable than fluent chains.

### Option C: Hybrid — Object Query with Composable Helpers (Recommended)

Combine the readability of object queries with composable helper functions that provide autocomplete and type safety:

```typescript
// The core primitive: a query descriptor object
// Helper functions construct type-safe descriptors

// Simple list
const tasks = useQuery(Task)

// Get by ID
const task = useQuery(Task, taskId)

// Filtered
const urgent = useQuery(Task, {
  where: {
    status: eq('urgent'),
    dueDate: lt(new Date()),
    title: contains('auth')
  },
  orderBy: { dueDate: 'asc' },
  limit: 10
})

// With relations
const tasksWithComments = useQuery(Task, {
  where: { status: not(eq('done')) },
  include: {
    comments: from(Comment, 'target'), // reverse: Comments where target = this
    parent: follow('parent'), // forward: follow the parent relation
    assignees: follow('assignee') // forward: follow person relation
  }
})

// Deep inclusion
const project = useQuery(Project, projectId, {
  include: {
    tasks: from(Task, 'parent', {
      include: {
        comments: from(Comment, 'target'),
        subtasks: from(Task, 'parent')
      }
    })
  }
})
```

The key insight: **helper functions** (`eq`, `lt`, `contains`, `from`, `follow`) are where TypeScript type inference lives. The **object shape** is where composability and serializability live. Best of both worlds.

```mermaid
flowchart LR
    subgraph "Developer Writes"
        CODE["useQuery(Task, {
  where: { status: eq('urgent') },
  include: { comments: from(Comment, 'target') }
})"]
    end

    subgraph "TypeScript Checks"
        TS1["'status' is a valid Task property ✓"]
        TS2["'urgent' is a valid select option ✓"]
        TS3["Comment has 'target' relation ✓"]
        TS4["Return type includes .comments[] ✓"]
    end

    subgraph "Runtime Executes"
        RT1[Query local NodeStore]
        RT2[Resolve forward/reverse relations]
        RT3[Subscribe to changes]
    end

    CODE --> TS1
    CODE --> TS2
    CODE --> TS3
    CODE --> TS4
    TS4 --> RT1
    RT1 --> RT2
    RT2 --> RT3
```

## Part 3: The Complete Query API

### 3.1 Filter Operators

Every property type gets operators that make sense for its type:

```typescript
// ─── Equality ─────────────────────────────────────────────
where: { status: eq('urgent') }         // status === 'urgent'
where: { status: not(eq('done')) }       // status !== 'done'
where: { status: oneOf('todo', 'doing') } // status in ['todo', 'doing']

// ─── Comparison (number, date) ────────────────────────────
where: { priority: gt(3) }              // priority > 3
where: { priority: gte(3) }             // priority >= 3
where: { dueDate: lt(new Date()) }      // dueDate < now
where: { dueDate: between(start, end) } // start <= dueDate <= end

// ─── Text ─────────────────────────────────────────────────
where: { title: contains('auth') }      // title includes 'auth'
where: { title: startsWith('Sprint') }  // title starts with 'Sprint'
where: { title: matches(/^v\d+/) }      // regex match
where: { title: search('authentication flow') }  // full-text search

// ─── Null / Existence ─────────────────────────────────────
where: { parent: exists() }             // parent is not null/undefined
where: { deletedAt: isNull() }          // deletedAt is null

// ─── Array (multiSelect, multiple relations) ──────────────
where: { tags: includes('bug') }        // tags array contains 'bug'
where: { tags: includesAll('bug', 'critical') } // all present
where: { tags: includesAny('bug', 'feature') }  // any present

// ─── Logical Combinators ──────────────────────────────────
where: and(
  { status: eq('urgent') },
  or(
    { assignee: eq(aliceDID) },
    { assignee: eq(bobDID) },
  ),
)

// ─── Relation Filters (queries against the target) ────────
where: {
  parent: relatedTo(projectId),          // parent relation = projectId
  parent: relatedWhere({ status: eq('active') }), // parent's status = active
}
```

#### Type Safety for Operators

Each operator is generic and constrained to the property type:

```typescript
// Only text properties accept contains()
function contains(substring: string): TextFilter

// Only number/date properties accept gt()
function gt<T extends number | Date>(value: T): ComparisonFilter<T>

// Only select properties accept oneOf() with valid options
function oneOf<T extends string>(...values: T[]): SelectFilter<T>

// The where clause is typed per-schema
interface TaskWhere {
  title?: TextFilter | EqualityFilter<string>
  status?: SelectFilter<'todo' | 'doing' | 'done'> | EqualityFilter<string>
  priority?: ComparisonFilter<number> | EqualityFilter<number>
  dueDate?: ComparisonFilter<Date> | NullFilter
  parent?: RelationFilter | NullFilter
  assignee?: PersonFilter | NullFilter
}
```

This means `where: { priority: contains('x') }` is a **compile-time error** — `contains` returns `TextFilter`, but `priority` expects `ComparisonFilter<number>`.

### 3.2 Relation Queries (Joins)

Relations are the heart of the query system. Two primitives handle all join patterns:

```typescript
// follow(property) — forward: resolve a relation property to its target node
// from(Schema, property) — reverse: find nodes whose relation property points here

// ─── Forward: resolve a relation ──────────────────────────
const task = useQuery(Task, taskId, {
  include: {
    parent: follow('parent'), // Task.parent → Project node
    assignees: follow('assignee') // Task.assignee → Person DIDs
  }
})
// task.parent → FlatNode<ProjectProperties> | null
// task.assignees → DID[]

// ─── Reverse: find referencing nodes ──────────────────────
const task = useQuery(Task, taskId, {
  include: {
    comments: from(Comment, 'target'), // Comment.target → this task
    subtasks: from(Task, 'parent') // Task.parent → this task
  }
})
// task.comments → FlatNode<CommentProperties>[]
// task.subtasks → FlatNode<TaskProperties>[]

// ─── Nested: follow relations on included nodes ───────────
const project = useQuery(Project, projectId, {
  include: {
    tasks: from(Task, 'parent', {
      where: { status: not(eq('done')) },
      orderBy: { priority: 'desc' },
      limit: 20,
      include: {
        comments: from(Comment, 'target', {
          orderBy: { createdAt: 'desc' },
          limit: 5
        }),
        assignee: follow('assignee')
      }
    })
  }
})
// Fully typed: project.tasks[0].comments[0].content
```

```mermaid
graph TD
    Q["useQuery(Project, id, { include })"] --> P[Project Node]
    P -->|"from(Task, 'parent')"| T1[Task 1]
    P -->|"from(Task, 'parent')"| T2[Task 2]
    P -->|"from(Task, 'parent')"| T3[Task 3]
    T1 -->|"from(Comment, 'target')"| C1[Comment A]
    T1 -->|"from(Comment, 'target')"| C2[Comment B]
    T1 -->|"follow('assignee')"| U1[Alice DID]
    T2 -->|"follow('assignee')"| U2[Bob DID]
    T3 -->|"from(Comment, 'target')"| C3[Comment C]

    style Q fill:#818cf8,stroke:#6366f1
    style P fill:#f472b6,stroke:#ec4899
    style T1 fill:#4ade80,stroke:#16a34a
    style T2 fill:#4ade80,stroke:#16a34a
    style T3 fill:#4ade80,stroke:#16a34a
    style C1 fill:#fbbf24,stroke:#f59e0b
    style C2 fill:#fbbf24,stroke:#f59e0b
    style C3 fill:#fbbf24,stroke:#f59e0b
```

### 3.3 Graph Traversal

For queries that need to walk multiple hops or follow recursive structures:

```typescript
// ─── Multi-hop traversal ──────────────────────────────────
// "Find all users who have commented on tasks in this project"
const collaborators = useQuery(Person, {
  traverse: [
    start(Project, projectId),
    reverse(Task, 'parent'), // project ← tasks
    reverse(Comment, 'target'), // tasks ← comments
    forward('createdBy') // comments → person DID
  ],
  distinct: true
})

// ─── Recursive / transitive closure ───────────────────────
// "Find all descendant tasks (children, grandchildren, ...)"
const allDescendants = useQuery(Task, {
  reachable: {
    from: projectId,
    through: 'parent', // follow Task.parent edges
    direction: 'reverse', // find nodes whose parent = X, then recurse
    maxDepth: 10 // safety limit
  },
  where: { status: not(eq('done')) }
})

// ─── Shortest path ────────────────────────────────────────
// "How is this task connected to that project?"
const path = await store.query(Task, {
  path: {
    from: taskId,
    to: projectId,
    through: ['parent', 'subtasks'], // which relations to traverse
    maxDepth: 5
  }
})
// path → [taskId, intermediateId, ..., projectId]
```

```mermaid
flowchart TD
    subgraph "Multi-Hop Traversal"
        direction TB
        P[Project] ---|"reverse Task.parent"| T1[Task 1]
        P ---|"reverse Task.parent"| T2[Task 2]
        T1 ---|"reverse Comment.target"| C1[Comment A]
        T1 ---|"reverse Comment.target"| C2[Comment B]
        T2 ---|"reverse Comment.target"| C3[Comment C]
        C1 ---|"forward createdBy"| U1[Alice]
        C2 ---|"forward createdBy"| U2[Bob]
        C3 ---|"forward createdBy"| U1_2[Alice]
    end

    subgraph "Recursive Traversal"
        direction TB
        ROOT[Root Task] ---|depth 1| CH1[Child A]
        ROOT ---|depth 1| CH2[Child B]
        CH1 ---|depth 2| GC1[Grandchild 1]
        CH1 ---|depth 2| GC2[Grandchild 2]
        CH2 ---|depth 2| GC3[Grandchild 3]
    end

    style P fill:#f472b6,stroke:#ec4899
    style ROOT fill:#f472b6,stroke:#ec4899
    style U1 fill:#818cf8,stroke:#6366f1
    style U2 fill:#818cf8,stroke:#6366f1
    style U1_2 fill:#818cf8,stroke:#6366f1
```

### 3.4 Aggregation

Aggregations compute summary values over query results:

```typescript
// ─── Simple count ─────────────────────────────────────────
const commentCount = useQuery(Comment, {
  where: { target: relatedTo(taskId) },
  aggregate: count()
})
// commentCount.data → 42

// ─── Multiple aggregates ─────────────────────────────────
const stats = useQuery(Task, {
  where: { project: relatedTo(projectId) },
  aggregate: {
    total: count(),
    avgPriority: avg('priority'),
    maxPriority: max('priority'),
    earliestDue: min('dueDate')
  }
})
// stats.data → { total: 25, avgPriority: 2.4, maxPriority: 5, earliestDue: Date }

// ─── Group by ─────────────────────────────────────────────
const byStatus = useQuery(Task, {
  where: { project: relatedTo(projectId) },
  groupBy: 'status',
  aggregate: {
    count: count(),
    avgPriority: avg('priority')
  }
})
// byStatus.data → [
//   { status: 'todo', count: 10, avgPriority: 2.1 },
//   { status: 'doing', count: 8, avgPriority: 3.0 },
//   { status: 'done', count: 7, avgPriority: 1.8 },
// ]

// ─── Group by with having ─────────────────────────────────
const busyAssignees = useQuery(Task, {
  where: { project: relatedTo(projectId) },
  groupBy: 'assignee',
  aggregate: { taskCount: count() },
  having: { taskCount: gt(5) }
})
```

### 3.5 Full-Text Search

Search is a first-class query operation, not a separate API:

```typescript
// ─── Basic search ─────────────────────────────────────────
const results = useQuery(Task, {
  search: 'authentication flow', // searches all text properties
  limit: 20
})
// results.data → ranked by relevance, with .score on each

// ─── Scoped search ────────────────────────────────────────
const results = useQuery(Task, {
  where: { project: relatedTo(projectId) },
  search: { query: 'auth', fields: ['title', 'description'] },
  limit: 20
})

// ─── Search + filters ─────────────────────────────────────
const results = useQuery(Task, {
  where: {
    status: not(eq('done')),
    title: search('authentication') // search on a specific field
  },
  orderBy: { _score: 'desc' } // explicit relevance sort
})

// ─── Cross-schema search ──────────────────────────────────
const everything = useSearch('authentication flow', {
  schemas: [Task, Comment, Page], // search across types
  limit: 20
})
// everything.data → mixed array with .schema discriminator
```

### 3.6 History Queries

Every node has a complete change history. The query API exposes this:

```typescript
// ─── Point-in-time snapshot ───────────────────────────────
const taskLastWeek = useQuery(Task, taskId, {
  at: new Date('2026-01-27') // node state at this moment
})

// ─── Change history for a node ────────────────────────────
const history = useQuery(Task, taskId, {
  history: {
    limit: 50,
    since: new Date('2026-01-01')
  }
})
// history.data → [
//   { timestamp, author, changes: { status: { from: 'todo', to: 'doing' } } },
//   { timestamp, author, changes: { title: { from: 'Old', to: 'New' } } },
// ]

// ─── Diff between two points ─────────────────────────────
const diff = useQuery(Task, taskId, {
  diff: { from: timestampA, to: timestampB }
})
// diff.data → { title: { before: 'v1', after: 'v2' }, status: { before: 'todo', after: 'done' } }

// ─── "What changed since I last looked?" ─────────────────
const recent = useQuery(Task, {
  where: { project: relatedTo(projectId) },
  changedSince: lastVisitTimestamp,
  orderBy: { updatedAt: 'desc' }
})
```

### 3.7 Computed / Virtual Fields

Fields that are computed at query time without being stored:

```typescript
const tasks = useQuery(Task, {
  where: { project: relatedTo(projectId) },
  compute: {
    isOverdue: expr((t) => t.dueDate < new Date() && t.status !== 'done'),
    daysSinceCreated: expr((t) => Math.floor((Date.now() - t.createdAt) / 86400000)),
    commentCount: count(from(Comment, 'target')),
    assigneeName: lookup(follow('assignee'), 'displayName')
  },
  where: { isOverdue: eq(true) }, // filter on computed field
  orderBy: { commentCount: 'desc' } // sort on computed field
})
// tasks.data[0].isOverdue → true
// tasks.data[0].commentCount → 7
```

## Part 4: The React Integration

### 4.1 `useQuery` — The Universal Hook

All query capabilities are accessible through a single hook with overloaded signatures:

```typescript
// ─── Overloads ────────────────────────────────────────────

// List all nodes of a schema
function useQuery<S>(schema: S): QueryResult<S[]>

// Get single node by ID
function useQuery<S>(schema: S, id: string): QueryResult<S | null>

// Get single node by ID with includes
function useQuery<S, I>(
  schema: S,
  id: string,
  options: QueryOptions<S, I>
): QueryResult<Expanded<S, I> | null>

// Query with filters, includes, aggregation, etc.
function useQuery<S, I>(schema: S, options: QueryOptions<S, I>): QueryResult<Expanded<S, I>[]>

// Aggregate query (returns summary, not nodes)
function useQuery<S, A>(schema: S, options: AggregateOptions<S, A>): QueryResult<A>
```

### 4.2 Reactive Subscriptions

Every `useQuery` call creates a live subscription. The query re-evaluates when:

```mermaid
flowchart TD
    Q[useQuery subscription] --> STORE_SUB[NodeStore.subscribe]
    Q --> INDEX_SUB[RelationIndex.subscribe]

    STORE_SUB --> CHG{Change matches query?}
    CHG -->|Schema matches| FILTER{Passes where clause?}
    CHG -->|Schema doesn't match| SKIP1[Ignore]
    FILTER -->|Yes| UPDATE[Re-compute result]
    FILTER -->|No| CHECK_REMOVE{Was in previous result?}
    CHECK_REMOVE -->|Yes| REMOVE[Remove from result]
    CHECK_REMOVE -->|No| SKIP2[Ignore]

    INDEX_SUB --> REL_CHG{Relation change affects includes?}
    REL_CHG -->|Yes| RE_INCLUDE[Re-resolve includes]
    REL_CHG -->|No| SKIP3[Ignore]

    UPDATE --> NOTIFY[React re-render]
    REMOVE --> NOTIFY
    RE_INCLUDE --> NOTIFY
```

Incremental updates are critical. The subscription should NOT re-run the full query on every change — it should incrementally add/remove/update items in the result set.

### 4.3 Query Composition in Components

```typescript
function ProjectDashboard({ projectId }: { projectId: string }) {
  // Level 1: Project with its tasks
  const { data: project } = useQuery(Project, projectId, {
    include: {
      tasks: from(Task, 'parent', {
        where: { status: not(eq('done')) },
        orderBy: { priority: 'desc' },
        include: {
          assignee: follow('assignee'),
        },
      }),
    },
  })

  // Level 2: Aggregate stats (separate subscription, independent updates)
  const { data: stats } = useQuery(Task, {
    where: { parent: relatedTo(projectId) },
    groupBy: 'status',
    aggregate: { count: count() },
  })

  // Level 3: Recent activity
  const { data: recentComments } = useQuery(Comment, {
    where: { target: relatedTo(projectId) },
    orderBy: { createdAt: 'desc' },
    limit: 10,
    include: {
      author: follow('createdBy'),
      task: follow('target'),
    },
  })

  return (
    <div>
      <h1>{project?.title}</h1>
      <StatusChart data={stats} />
      <TaskList tasks={project?.tasks ?? []} />
      <ActivityFeed comments={recentComments ?? []} />
    </div>
  )
}
```

### 4.4 Conditional and Dynamic Queries

```typescript
// Query only runs when enabled
const { data } = useQuery(Task, {
  where: { assignee: eq(userId) },
  enabled: !!userId // skip if no userId
})

// Dynamic filter composition
function useFilteredTasks(filters: TaskFilters) {
  const where: TaskWhere = {}

  if (filters.status) where.status = eq(filters.status)
  if (filters.assignee) where.assignee = eq(filters.assignee)
  if (filters.search) where.title = search(filters.search)
  if (filters.overdue) where.dueDate = lt(new Date())

  return useQuery(Task, {
    where,
    orderBy: filters.orderBy ?? { createdAt: 'desc' },
    limit: filters.limit ?? 50
  })
}
```

## Part 5: The Store-Level Query Engine

### 5.1 Query Execution Pipeline

Under the React hook, the store processes queries through a pipeline:

```mermaid
flowchart TD
    Q[Query Descriptor] --> PARSE[Parse & Validate]
    PARSE --> PLAN[Query Plan]

    PLAN --> IDX_CHECK{Can use index?}
    IDX_CHECK -->|schemaId index| IDX_SCAN[Index scan by schema]
    IDX_CHECK -->|relation index| REL_SCAN[Index scan by target]
    IDX_CHECK -->|No index| FULL_SCAN[Full scan with filter]

    IDX_SCAN --> FILTER[Apply remaining where clauses]
    REL_SCAN --> FILTER
    FULL_SCAN --> FILTER

    FILTER --> SORT[Sort by orderBy]
    SORT --> LIMIT[Apply limit/offset]
    LIMIT --> INCLUDE{Has includes?}

    INCLUDE -->|Yes| RESOLVE[Resolve includes]
    INCLUDE -->|No| COMPUTE

    RESOLVE --> FWD[Forward: store.get for each relation value]
    RESOLVE --> REV[Reverse: relationIndex.getByTarget]
    FWD --> RECURSE[Recurse for nested includes]
    REV --> RECURSE
    RECURSE --> COMPUTE

    COMPUTE --> CALC{Has compute/aggregate?}
    CALC -->|Yes| AGG[Compute derived fields / aggregations]
    CALC -->|No| RESULT

    AGG --> RESULT[Return typed result]
```

### 5.2 Store API

The store exposes a lower-level query method that the React hook wraps:

```typescript
interface NodeStore {
  // Existing
  get(id: NodeId): Promise<NodeState | null>
  list(options?: ListNodesOptions): Promise<NodeState[]>

  // New: unified query
  query<S extends DefinedSchema, I extends IncludeSpec>(
    schema: S,
    options?: StoreQueryOptions<S, I>
  ): Promise<QueryResultSet<S, I>>

  // New: reactive query (returns unsubscribe function)
  observe<S extends DefinedSchema, I extends IncludeSpec>(
    schema: S,
    options: StoreQueryOptions<S, I>,
    callback: (result: QueryResultSet<S, I>) => void
  ): () => void

  // New: aggregate query
  aggregate<S extends DefinedSchema, A extends AggregateSpec>(
    schema: S,
    options: StoreAggregateOptions<S, A>
  ): Promise<AggregateResult<A>>
}
```

### 5.3 Indexing Strategy

Performance depends on which operations can use indexes vs. full scans:

| Operation                 | Index Used                     | Complexity                    |
| ------------------------- | ------------------------------ | ----------------------------- |
| Filter by `schemaId`      | `bySchema` on nodes store      | O(k) where k = matching nodes |
| Get by ID                 | Primary key on nodes store     | O(1)                          |
| Filter by relation target | `byTarget` on relation_index   | O(k)                          |
| Filter by person          | `byDid` on person_index        | O(k)                          |
| Filter by property value  | None (full scan within schema) | O(n)                          |
| Full-text search          | Search index (future)          | O(k log n)                    |
| Sort by property          | None (in-memory sort)          | O(n log n)                    |
| Sort by `createdAt`       | `byCreatedAt` on nodes store   | O(k)                          |

For v1, property-value filters scan all nodes of a schema. This is acceptable for hundreds to low thousands of nodes (typical local-first scale). For larger datasets, property indexes can be added later:

```typescript
// Future: declare property indexes in schema
const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://xnet.fyi/',
  properties: { ... },
  indexes: [
    { name: 'byStatus', fields: ['status'] },
    { name: 'byAssigneeStatus', fields: ['assignee', 'status'] },
  ],
})
```

## Part 6: Type System Deep Dive

### 6.1 Inferring Query Results

The type system should know the exact shape of what the query returns:

```typescript
// Given schema
const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    title: text({ required: true }),
    status: select({ options: ['todo', 'doing', 'done'] }),
    priority: number({}),
    parent: relation({ target: 'xnet://xnet.fyi/Project' }),
    assignee: person({})
  }
})

// Plain query returns FlatNode<TaskProperties>
const { data } = useQuery(TaskSchema)
// data: Array<{
//   id: string, schemaId: string, createdAt: number, ...
//   title: string, status?: string, priority?: number,
//   parent?: string, assignee?: string
// }>

// Query with includes returns expanded type
const { data } = useQuery(TaskSchema, taskId, {
  include: {
    parent: follow('parent'),
    comments: from(CommentSchema, 'target')
  }
})
// data: {
//   ...FlatNode<TaskProperties>,
//   parent: FlatNode<ProjectProperties> | null,
//   comments: FlatNode<CommentProperties>[],
// } | null

// Aggregate query returns aggregate type
const { data } = useQuery(TaskSchema, {
  aggregate: { total: count(), avgPriority: avg('priority') }
})
// data: { total: number, avgPriority: number }
```

### 6.2 Type-Safe Operators

Operators are constrained by the property type they apply to:

```typescript
// Type definitions (simplified)
type WhereClause<P extends Record<string, PropertyBuilder>> = {
  [K in keyof P]?: P[K] extends PropertyBuilder<string>
    ? StringFilter
    : P[K] extends PropertyBuilder<number>
      ? NumberFilter
      : P[K] extends PropertyBuilder<boolean>
        ? BooleanFilter
        : P[K] extends PropertyBuilder<Date>
          ? DateFilter
          : // ... etc
            Filter
}

type StringFilter =
  | ReturnType<typeof eq<string>>
  | ReturnType<typeof not<StringFilter>>
  | ReturnType<typeof contains>
  | ReturnType<typeof startsWith>
  | ReturnType<typeof matches>
  | ReturnType<typeof search>
  | ReturnType<typeof oneOf<string>>

type NumberFilter =
  | ReturnType<typeof eq<number>>
  | ReturnType<typeof gt<number>>
  | ReturnType<typeof gte<number>>
  | ReturnType<typeof lt<number>>
  | ReturnType<typeof lte<number>>
  | ReturnType<typeof between<number>>
  | ReturnType<typeof not<NumberFilter>>
```

### 6.3 Compile-Time Validation Examples

```typescript
// ERROR: 'color' is not a property of Task
useQuery(TaskSchema, { where: { color: eq('red') } })
//                               ~~~~~ TS Error

// ERROR: contains() not valid for number properties
useQuery(TaskSchema, { where: { priority: contains('high') } })
//                                         ~~~~~~~~ TS Error

// ERROR: 'author' is not a relation property on Task
useQuery(TaskSchema, taskId, { include: { author: follow('author') } })
//                                                        ~~~~~~~~ TS Error

// ERROR: CommentSchema doesn't have a 'parent' relation
useQuery(TaskSchema, taskId, { include: { comments: from(CommentSchema, 'parent') } })
//                                                                       ~~~~~~~~ TS Error

// OK: all types check out
useQuery(TaskSchema, {
  where: { status: eq('todo'), priority: gt(3) },
  include: { comments: from(CommentSchema, 'target') },
  orderBy: { priority: 'desc' }
})
```

## Part 7: Full-Text Search Architecture

### 7.1 Search Index

For local-first, the search index runs in the browser. Options:

| Library        | Size | Features                                      | Fit                            |
| -------------- | ---- | --------------------------------------------- | ------------------------------ |
| **MiniSearch** | 7KB  | Fuzzy, prefix, boost, auto-suggest            | Good for small-medium datasets |
| **FlexSearch** | 6KB  | Fastest JS search, preset profiles            | Good for speed-critical        |
| **Lunr**       | 8KB  | TF-IDF scoring, stemming, pipeline            | Good for relevance quality     |
| **Orama**      | 15KB | Full-featured, facets, typo tolerance, vector | Best feature set, larger       |

Recommendation: **MiniSearch** for v1 (tiny, well-maintained, good enough). Swap to Orama later if faceted search or vector similarity is needed.

### 7.2 Index Maintenance

```mermaid
flowchart TD
    CHANGE[Node Change Event] --> CHECK{Is text property?}
    CHECK -->|Yes| UPDATE[Update search index]
    CHECK -->|No| SKIP[Skip]

    UPDATE --> REMOVE[Remove old document]
    REMOVE --> ADD[Add updated document]

    BOOT[App Boot] --> LOAD[Load all nodes]
    LOAD --> BULK[Bulk index all text properties]

    QUERY[search query] --> SEARCH[MiniSearch.search]
    SEARCH --> IDS[Return ranked node IDs]
    IDS --> RESOLVE[Resolve to NodeState via store.get]
```

The search index is an in-memory structure rebuilt on app boot from the local NodeStore. It does NOT persist to IndexedDB (rebuilding from ~1000 nodes takes <50ms). Changes are applied incrementally as they arrive.

### 7.3 Search + Relation Queries

Search can combine with relation queries seamlessly:

```typescript
// "Find tasks in this project matching 'auth', with their comments"
const results = useQuery(Task, {
  where: {
    parent: relatedTo(projectId),
    title: search('authentication')
  },
  include: {
    comments: from(Comment, 'target', {
      where: { content: search('authentication') } // search in comments too
    })
  },
  orderBy: { _score: 'desc' }
})
```

## Part 8: History and Time-Travel Queries

### 8.1 How History Works

xNet already stores the full change log. Every property mutation is a `Change<NodePayload>` with a Lamport timestamp and wall clock time. To reconstruct state at any point:

```mermaid
sequenceDiagram
    participant Query
    participant ChangeLog
    participant Materializer

    Query->>ChangeLog: getChanges(nodeId)
    ChangeLog-->>Query: [change1, change2, ..., changeN]

    Query->>Materializer: Replay changes up to timestamp T
    Note over Materializer: Apply LWW resolution<br/>stopping at T

    Materializer-->>Query: NodeState as of T
```

### 8.2 API Design

```typescript
// Point-in-time: what was this task's state last Tuesday?
const { data } = useQuery(Task, taskId, {
  at: new Date('2026-01-27T00:00:00Z')
})

// Change log: what changed and who changed it?
const { data: changes } = useHistory(Task, taskId, {
  since: new Date('2026-01-01'),
  until: new Date('2026-02-01'),
  limit: 100
})
// changes → [{
//   timestamp: Date,
//   author: DID,
//   properties: {
//     status: { from: 'todo', to: 'doing' },
//     assignee: { from: null, to: 'did:key:alice...' },
//   },
// }]

// Diff: what's different between two points?
const { data: diff } = useDiff(Task, taskId, {
  from: new Date('2026-01-20'),
  to: new Date('2026-01-27')
})
// diff → {
//   title: { before: 'Draft', after: 'Final Version' },
//   status: { before: 'todo', after: 'done' },
// }
```

### 8.3 History-Aware Includes

```typescript
// "What did this project look like last week, with its tasks at that point?"
const { data } = useQuery(Project, projectId, {
  at: lastWeek,
  include: {
    tasks: from(Task, 'parent', {
      at: lastWeek // tasks' state at the same point in time
    })
  }
})
```

This requires the relation index to also be time-aware — or to reconstruct the index state by replaying changes. For v1, time-travel on includes can be a separate feature.

## Part 9: Datalog Semantics Under the Hood

### 9.1 Why Datalog Matters

The query API looks like TypeScript, but the **evaluation model** can follow Datalog semantics. This matters for:

- **Recursive queries** (transitive closure) — Datalog handles these natively with fixpoint evaluation
- **Join ordering** — Datalog engines optimize join order automatically
- **Incremental maintenance** — Datalog's semi-naive evaluation enables efficient incremental updates

### 9.2 Translation to Datalog-Like Evaluation

```typescript
// This TypeScript query:
useQuery(Task, {
  where: { status: eq('todo'), parent: relatedTo(projectId) },
  include: { comments: from(Comment, 'target') }
})

// Translates internally to Datalog-like rules:
//
// result(TaskId, Title, Status) :-
//   node(TaskId, 'Task', Properties),
//   Properties.status = 'todo',
//   Properties.parent = ProjectId.
//
// result_comments(TaskId, CommentId, Content) :-
//   result(TaskId, _, _),
//   node(CommentId, 'Comment', CProps),
//   CProps.target = TaskId.
```

The query engine doesn't need to literally implement Datalog, but thinking in Datalog helps reason about:

- What can be answered with existing indexes
- What requires multi-pass evaluation
- Where incremental maintenance is possible

### 9.3 Incremental View Maintenance

Rather than re-running the full query on every change, the engine maintains materialized views:

```mermaid
flowchart TD
    Q[Query registered] --> MV[Materialized View created]
    MV --> INITIAL[Initial evaluation → result set]

    CHANGE[New Change arrives] --> DELTA{Affects this view?}
    DELTA -->|Schema mismatch| IGNORE[Skip]
    DELTA -->|Relevant| EVAL[Evaluate delta]

    EVAL --> ADD{New node passes filters?}
    ADD -->|Yes| INSERT[Add to result set, resolve includes]
    ADD -->|No| CHECK{Existing node in result set?}
    CHECK -->|Yes, now fails filter| REMOVE[Remove from result set]
    CHECK -->|Yes, still passes| UPDATE_ITEM[Update item in-place]
    CHECK -->|No| IGNORE2[Skip]

    INSERT --> NOTIFY[Notify subscribers]
    REMOVE --> NOTIFY
    UPDATE_ITEM --> NOTIFY
```

This is **dramatically more efficient** than re-running the full query. For a result set of 100 items and a single change, the incremental path touches 1 item instead of scanning 1000+.

## Part 10: Local-First Considerations

### 10.1 Partial Data and Stubs

In a decentralized system, a query may reference nodes that haven't been synced yet:

```typescript
const { data: task } = useQuery(Task, taskId, {
  include: {
    parent: follow('parent'), // parent node might not be synced
    comments: from(Comment, 'target') // some comments might be on other peers
  }
})

// task.parent might be:
// - Full FlatNode (synced and available)
// - Stub: { id: 'abc', _stub: true, _reason: 'not_synced' }
// - null (no parent relation set)
```

The query result includes a **completeness indicator**:

```typescript
interface QueryResult<T> {
  data: T
  loading: boolean
  error: Error | null

  // NEW: data completeness
  completeness: 'full' | 'partial' // are there stubs in the result?
  stubs: StubInfo[] // which nodes are missing?
  syncing: boolean // are we actively syncing missing data?
}

interface StubInfo {
  nodeId: string
  reason: 'not_synced' | 'no_access' | 'deleted'
  path: string // e.g., 'parent' or 'comments[2].author'
}
```

### 10.2 Optimistic Updates

Mutations immediately update the local query results before sync:

```typescript
const { mutate } = useMutate()
const { data: tasks } = useQuery(Task, { where: { status: eq('todo') } })

// This updates tasks immediately (optimistic), then syncs
await mutate.update(Task, taskId, { status: 'doing' })

// The task disappears from the 'todo' query result instantly
// No waiting for sync round-trip
```

This works because the query engine subscribes to the local NodeStore, which applies the change synchronously before broadcasting to peers.

### 10.3 Conflict-Aware Queries

```typescript
// Query nodes that have unresolved conflicts
const conflicted = useQuery(Task, {
  where: { _hasConflicts: eq(true) }
})

// Query with conflict details
const { data } = useQuery(Task, taskId, {
  includeConflicts: true
})
// data._conflicts → [
//   { property: 'status', localValue: 'doing', remoteValue: 'done',
//     localTimestamp, remoteTimestamp, resolvedTo: 'remote' }
// ]
```

## Part 11: Cross-Schema and Universal Queries

### 11.1 Multi-Schema Queries

Sometimes you need to query across types:

```typescript
// Search everything
const results = useSearch('authentication', {
  schemas: [Task, Comment, Page],
  limit: 20
})
// results.data → Array<
//   | { _schema: 'Task', ...FlatNode<TaskProperties> }
//   | { _schema: 'Comment', ...FlatNode<CommentProperties> }
//   | { _schema: 'Page', ...FlatNode<PageProperties> }
// >

// Recent activity across all schemas
const recent = useQuery(null, {
  // null schema = all schemas
  changedSince: lastVisitTimestamp,
  orderBy: { updatedAt: 'desc' },
  limit: 50
})
```

### 11.2 Schema-Aware Type Narrowing

```typescript
const results = useSearch('auth', { schemas: [Task, Comment] })

results.data.forEach((item) => {
  if (TaskSchema.is(item)) {
    // TypeScript narrows: item is FlatNode<TaskProperties>
    console.log(item.priority) // OK
  } else if (CommentSchema.is(item)) {
    // TypeScript narrows: item is FlatNode<CommentProperties>
    console.log(item.content) // OK
  }
})
```

## Part 12: Query DSL Comparison

How the xNet query API compares to prior art:

### SQL

```sql
SELECT t.*, COUNT(c.id) as comment_count
FROM tasks t
LEFT JOIN comments c ON c.target = t.id
WHERE t.status != 'done'
  AND t.project_id = :projectId
GROUP BY t.id
ORDER BY t.priority DESC
LIMIT 20
```

### xNet

```typescript
useQuery(Task, {
  where: { status: not(eq('done')), parent: relatedTo(projectId) },
  compute: { commentCount: count(from(Comment, 'target')) },
  orderBy: { priority: 'desc' },
  limit: 20
})
```

### Datomic Datalog

```clojure
[:find ?task ?title (count ?comment)
 :in $ ?project
 :where
 [?task :task/status ?s]
 [(not= ?s "done")]
 [?task :task/parent ?project]
 [?task :task/title ?title]
 [?comment :comment/target ?task]]
```

### xNet (equivalent)

```typescript
useQuery(Task, {
  where: { status: not(eq('done')), parent: relatedTo(projectId) },
  compute: { commentCount: count(from(Comment, 'target')) }
})
```

### Prisma

```typescript
prisma.task.findMany({
  where: { status: { not: 'done' }, projectId },
  include: { comments: true },
  orderBy: { priority: 'desc' },
  take: 20
})
```

### xNet (equivalent)

```typescript
useQuery(Task, {
  where: { status: not(eq('done')), parent: relatedTo(projectId) },
  include: { comments: from(Comment, 'target') },
  orderBy: { priority: 'desc' },
  limit: 20
})
```

The xNet API is closest to Prisma in syntax, but adds Datalog-level power (recursive traversals, computed aggregations) and local-first semantics (reactive subscriptions, partial results, conflict awareness).

## Part 13: Implementation Roadmap

### Phase 1: Enhanced Filtering (Foundation)

| Task                                                           | Effort | Builds On                      |
| -------------------------------------------------------------- | ------ | ------------------------------ |
| Filter operator functions (`eq`, `gt`, `lt`, `contains`, etc.) | M      | Nothing — pure functions       |
| `WhereClause<P>` typed per schema                              | M      | Existing schema type inference |
| Update `useQuery` to accept operators (backward-compatible)    | M      | Current `useQuery`             |
| Logical combinators (`and`, `or`, `not`)                       | S      | Filter operators               |

### Phase 2: Relation Queries

| Task                                       | Effort | Builds On                      |
| ------------------------------------------ | ------ | ------------------------------ |
| `follow(property)` for forward joins       | M      | Relation index (0040 Phase 2a) |
| `from(Schema, property)` for reverse joins | M      | Relation index                 |
| Nested includes with sub-queries           | L      | Forward + reverse joins        |
| `relatedTo()` filter operator              | S      | Relation index                 |

### Phase 3: Aggregation + Compute

| Task                                          | Effort | Builds On                           |
| --------------------------------------------- | ------ | ----------------------------------- |
| `count()`, `sum()`, `avg()`, `min()`, `max()` | M      | Query engine                        |
| `groupBy` support                             | M      | Aggregation functions               |
| `compute` for virtual fields                  | L      | Query engine + expression evaluator |
| `having` clause for group filters             | S      | `groupBy`                           |

### Phase 4: Full-Text Search

| Task                                   | Effort | Builds On                     |
| -------------------------------------- | ------ | ----------------------------- |
| Integrate MiniSearch                   | M      | Nothing — standalone          |
| Index maintenance on NodeStore changes | S      | MiniSearch + store subscribe  |
| `search()` filter operator             | S      | MiniSearch integration        |
| `useSearch()` cross-schema hook        | M      | Search + multi-schema results |
| Relevance scoring + `_score` ordering  | S      | MiniSearch                    |

### Phase 5: History + Time Travel

| Task                                  | Effort | Builds On                       |
| ------------------------------------- | ------ | ------------------------------- |
| `useHistory()` hook for change log    | M      | Existing change store           |
| `useDiff()` hook for property diffs   | M      | Change log                      |
| `at` option for point-in-time queries | L      | Change replay + materialization |
| History-aware includes                | L      | Point-in-time + relation index  |

### Phase 6: Graph Traversal

| Task                               | Effort | Builds On                  |
| ---------------------------------- | ------ | -------------------------- |
| `traverse()` multi-hop queries     | L      | Relation index             |
| `reachable` for transitive closure | L      | Traverse + cycle detection |
| `path` for shortest path queries   | L      | BFS over relation index    |
| Incremental view maintenance       | XL     | Full query engine          |

### Phase 7: Property Indexes

| Task                                | Effort | Builds On                  |
| ----------------------------------- | ------ | -------------------------- |
| Schema-declared property indexes    | M      | IndexedDB schema extension |
| Query planner: choose index vs scan | L      | Property indexes           |
| Compound indexes                    | L      | Property indexes           |

## Open Questions

1. **Operator syntax**: Should operators be function calls (`eq('urgent')`) or object literals (`{ $eq: 'urgent' }`)? Functions give better autocomplete and type inference. Objects are more JSON-serializable. Leaning toward functions since queries don't need to cross a wire (local-first).

2. **Include depth limits**: Should nested includes have a maximum depth? Unbounded recursive includes could pull the entire graph into memory. Default max depth of 3 with explicit opt-in for deeper seems reasonable.

3. **Aggregation reactivity**: Should aggregate queries (`count`, `avg`) be reactive? A comment count that updates in real-time is powerful but requires maintaining the aggregation incrementally. For v1, aggregates could be non-reactive (re-compute on explicit reload), with reactive aggregates as a later optimization.

4. **Search index persistence**: Rebuilding the search index from scratch on every app boot is fast for ~1000 nodes but won't scale to 100k+. Should the search index persist to IndexedDB? This adds complexity (index versioning, incremental updates on boot) but improves cold start time.

5. **Query serialization**: If queries need to be stored (saved views, shared filters), function-based operators (`eq()`, `gt()`) need a serialization format. Consider: each operator returns a serializable descriptor `{ op: 'eq', value: 'urgent' }` that also happens to carry TypeScript type info.

6. **Backward compatibility**: The current `useQuery` accepts `{ where: { status: 'urgent' } }` (plain value = equality). Should this continue to work alongside `{ where: { status: eq('urgent') } }`? Yes — plain values desugar to `eq()` internally. This makes the migration path zero-cost.

7. **AI-native queries**: Convex positions itself as "AI-native." Should xNet's query format be designed for LLM generation? The JSON-object approach with function operators is LLM-friendly — models can construct queries from natural language more easily than fluent chains. Consider providing a `queryFromNaturalLanguage(schema, prompt)` helper that uses the schema to generate valid queries.

## Conclusion

The unified query API transforms xNet from "a store with basic CRUD" to "a reactive, graph-aware, local-first database with the query power of Datomic and the ergonomics of Prisma." The key architectural decision is: **queries are TypeScript objects composed from typed helper functions**. This gives:

- **Autocomplete**: Functions like `eq()`, `from()`, `follow()` are discoverable in any IDE
- **Type safety**: Invalid queries are compile-time errors, not runtime surprises
- **Composability**: Queries are values — store them, combine them, pass them around
- **Reactivity**: Every query is a live subscription by default
- **Serializability**: Operator functions return plain descriptors that can be serialized
- **Familiarity**: Looks like Prisma/Drizzle to web developers, acts like Datalog under the hood

The implementation is incremental: Phase 1 (enhanced filtering) can ship independently and is backward-compatible with today's `useQuery`. Each subsequent phase adds capabilities without breaking existing queries.
