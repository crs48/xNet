# 11: Versioning Strategy

> Designing for evolution: No migrations, no breaking changes

[← Back to Plan Overview](./README.md) | [Previous: Scaling Architecture](./10-scaling-architecture.md)

---

## Overview

**Core Principle**: In a decentralized system, you cannot force upgrades. Old peers must interoperate with new peers. Every data structure, protocol, and API must be designed for evolution from day 1.

**Goal**: Zero-migration architecture where new features are additive and old data remains valid indefinitely.

---

## The Migration Problem in P2P

Unlike centralized systems where you control all clients:

| Centralized | Decentralized (xNet) |
|-------------|---------------------|
| Force app update | Can't force updates |
| Run migration script | No central database |
| Downtime for upgrade | Network never stops |
| One schema version | N versions coexist |
| Rollback possible | CRDTs can't rollback |

**The only solution**: Design every structure to be forward-compatible from the start.

---

## Versioning Requirements by System

### Priority Matrix

| System | Phase 1 Risk | Phase 2+ Risk | Effort Now | Must Do Now? |
|--------|--------------|---------------|------------|--------------|
| **CRDT Block Schema** | CRITICAL | CRITICAL | 2 weeks | **YES** |
| **Sync Protocol** | CRITICAL | HIGH | 1 week | **YES** |
| **MCP Tool Signatures** | MEDIUM | HIGH | 1 week | **YES** |
| **Property Types** | LOW | HIGH | 2 weeks | **YES** |
| **Schema Registry** | LOW | CRITICAL | 3 weeks | Design only |
| **Export Formats** | MEDIUM | MEDIUM | 1 week | **YES** |
| **Canvas Model** | LOW | MEDIUM | 1 week | Later OK |

---

## 1. CRDT Document Versioning

Every Yjs document MUST include metadata for evolution.

### Document Metadata Structure

```typescript
// REQUIRED in every Y.Doc from day 1
interface DocumentMetadata {
  // Schema version (increment on breaking changes)
  schemaVersion: number;

  // Format version (semver for the overall structure)
  formatVersion: string;

  // Track applied migrations
  migrations: Array<{
    from: number;
    to: number;
    appliedAt: string;
    appliedBy: string;  // DID
  }>;

  // Feature flags for progressive rollout
  features: Set<string>;

  // Minimum client version to open this doc
  minClientVersion?: string;
}

// Initialize in every new document
function initializeDocument(ydoc: Y.Doc): void {
  const meta = ydoc.getMap('__meta');
  meta.set('schemaVersion', 1);
  meta.set('formatVersion', '1.0.0');
  meta.set('migrations', []);
  meta.set('features', []);
  meta.set('createdAt', new Date().toISOString());
}
```

### Block Schema with Reserved Fields

```typescript
const BlockSchemaV1 = z.object({
  // Identity (never changes)
  '@id': z.string().uuid(),
  '@type': z.string(),

  // Core fields
  parentId: z.string().uuid().nullable(),
  childIds: z.array(z.string().uuid()),
  content: z.any(),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string(),  // DID

  // Permissions (extensible from day 1)
  permissions: PermissionSchemaV1,

  // ============================================
  // RESERVED FOR FUTURE USE - DO NOT REMOVE
  // ============================================
  __schemaVersion: z.number().default(1),
  __extensions: z.record(z.unknown()).optional(),
  __deprecated: z.record(z.unknown()).optional(),
});
```

### Permission Schema (Extensible)

```typescript
// WRONG: Flat list that can't evolve
permissions: {
  read: ['did:key:abc', 'did:key:xyz'],
  write: ['did:key:abc'],
  admin: ['did:key:abc'],
}

// RIGHT: Structured entries with room for conditions
const PermissionSchemaV1 = z.object({
  version: z.number().default(1),

  entries: z.array(z.object({
    principalId: z.string(),
    principalType: z.enum(['user', 'role', 'group', 'anyone']),
    capabilities: z.array(z.enum(['read', 'write', 'admin', 'share'])),

    // Reserved for future conditions
    conditions: z.object({
      expiresAt: z.string().datetime().optional(),
      // Add more conditions later without migration
    }).passthrough().optional(),

    metadata: z.record(z.unknown()).optional(),
  })),

  // Legacy format support
  __legacyFormat: z.object({
    read: z.array(z.string()),
    write: z.array(z.string()),
    admin: z.array(z.string()),
  }).optional(),
});
```

---

## 2. Property Type System (Extensible)

### Property Type Registry

Instead of a fixed enum of types, use a registry pattern:

```typescript
// Core types are registered, not hardcoded
interface PropertyTypeDefinition {
  // Identity
  id: string;              // 'text', 'number', 'com.acme/currency'
  namespace: string;       // 'xnet.core', 'com.acme'
  version: string;         // '1.0.0'

  // Classification
  category: 'scalar' | 'collection' | 'relation' | 'computed';

  // Schema for values of this type
  valueSchema: z.ZodType;

  // Schema for type configuration
  configSchema: z.ZodType;

  // Default value
  defaultValue?: unknown;

  // Storage hints
  storage: {
    format: 'inline' | 'blob' | 'reference';
    indexed: boolean;
    searchable: boolean;
  };

  // Evolution
  supersedes?: string;     // Type this replaces
  deprecatedBy?: string;   // Type that replaces this

  // Migrations from previous versions
  migrations?: Array<{
    fromVersion: string;
    transform: (value: unknown, config: unknown) => unknown;
  }>;
}

class PropertyTypeRegistry {
  private types = new Map<string, PropertyTypeDefinition>();

  // Register core types at startup
  registerCoreTypes(): void {
    this.register(TextPropertyType);
    this.register(NumberPropertyType);
    this.register(SelectPropertyType);
    // ... all 17 core types
  }

  // Allow custom types
  register(def: PropertyTypeDefinition): void {
    const key = `${def.namespace}/${def.id}@${def.version}`;
    this.types.set(key, def);
  }

  // Resolve with fallback
  resolve(typeId: string, version?: string): PropertyTypeDefinition {
    // Try exact version
    if (version) {
      const exact = this.types.get(`${typeId}@${version}`);
      if (exact) return exact;
    }

    // Fall back to latest
    const latest = this.findLatest(typeId);
    if (latest) return latest;

    // Unknown type - return generic handler
    return this.getUnknownTypeHandler(typeId);
  }

  private getUnknownTypeHandler(typeId: string): PropertyTypeDefinition {
    return {
      id: typeId,
      namespace: 'unknown',
      version: '0.0.0',
      category: 'scalar',
      valueSchema: z.unknown(),
      configSchema: z.object({}).passthrough(),
      storage: { format: 'inline', indexed: false, searchable: false },
    };
  }
}
```

### Database Property Definition

```typescript
interface PropertyDefinitionV1 {
  id: string;
  name: string;

  // Type with version
  type: {
    id: string;            // 'text', 'select', 'com.acme/currency'
    version: string;       // '1.0.0'
  };

  // Type-specific configuration
  config: Record<string, unknown>;

  // Metadata
  required: boolean;
  description?: string;

  // Evolution tracking
  __propertyVersion: number;
  __addedInSchemaVersion?: number;
  __deprecatedInSchemaVersion?: number;
  __replacedBy?: string;
}
```

---

## 3. MCP Tool Versioning

### Tool Definition with Versions

```typescript
interface MCPToolDefinition {
  // Identity
  id: string;              // 'xnet.pages.list'
  version: string;         // '1.0.0'

  // Stability
  stability: 'experimental' | 'beta' | 'stable' | 'deprecated';

  // Input/Output schemas by version
  signatures: {
    [version: string]: {
      parameters: z.ZodType;
      returns: z.ZodType;

      // Parameter changes
      addedParams?: string[];
      deprecatedParams?: string[];
      removedParams?: string[];

      // Transforms for compatibility
      transformInput?: (input: unknown) => unknown;
      transformOutput?: (output: unknown) => unknown;
    };
  };

  // Evolution
  replaces?: string;       // Tool this replaces
  replacedBy?: string;     // Tool that replaces this
}

// Example: list_pages with versions
const LIST_PAGES: MCPToolDefinition = {
  id: 'xnet.pages.list',
  version: '1.0.0',
  stability: 'stable',
  signatures: {
    '1.0.0': {
      parameters: z.object({
        parent_id: z.string().optional(),
        tag: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }),
      returns: z.object({
        pages: z.array(PageSummarySchema),
        total: z.number(),
      }),
    },
    '2.0.0': {
      parameters: z.object({
        // All v1 params plus new ones
        parent_id: z.string().optional(),
        tag: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
        // New in v2
        include_children: z.boolean().default(false),
        sort_by: z.enum(['title', 'updated', 'created']).default('updated'),
      }),
      returns: z.object({
        pages: z.array(PageSummarySchemaV2),
        total: z.number(),
        // New in v2
        has_more: z.boolean(),
      }),
      addedParams: ['include_children', 'sort_by'],
      // Transform v1 calls to v2 format
      transformInput: (v1) => ({
        ...v1,
        include_children: false,
        sort_by: 'updated',
      }),
      // Transform v2 response to v1 format
      transformOutput: (v2) => ({
        pages: v2.pages.map(p => ({ /* v1 fields only */ })),
        total: v2.total,
      }),
    },
  },
};
```

### Filter Operators (Extensible)

```typescript
// Define operators by version
const FILTER_OPERATORS = {
  v1: new Set([
    'equals', 'not_equals', 'contains', 'not_contains',
    'starts_with', 'ends_with', 'is_empty', 'is_not_empty',
    'gt', 'gte', 'lt', 'lte',
    'before', 'after', 'on_or_before', 'on_or_after',
  ]),
  v2: new Set([
    // All v1 operators
    ...FILTER_OPERATORS.v1,
    // New in v2
    'in', 'not_in', 'regex', 'fuzzy_match',
  ]),
};

interface FilterCondition {
  property: string;
  operator: string;
  value: unknown;

  // Optional version hint
  operatorVersion?: number;
}

function validateOperator(op: string, version: number = 1): boolean {
  const operators = FILTER_OPERATORS[`v${version}`];
  return operators?.has(op) ?? false;
}
```

---

## 4. Sync Protocol Versioning

### Message Envelope

```typescript
interface SyncMessage {
  // Protocol version (required in every message)
  protocol: {
    version: string;       // '1.0.0'
    features: string[];    // ['state-vectors', 'awareness', 'encryption']
  };

  // Message type with version
  type: string;            // 'sync-step-1', 'update', 'awareness'
  typeVersion: number;     // 1, 2, ...

  // Payload (structure depends on type + version)
  payload: unknown;

  // For debugging
  timestamp: number;
  senderId: string;
}
```

### Protocol Negotiation

```typescript
class SyncProtocol {
  private supportedVersions = ['1.0.0', '1.1.0', '2.0.0'];

  async negotiate(peer: PeerId): Promise<string> {
    // Exchange supported versions
    const peerVersions = await this.getPeerVersions(peer);

    // Find highest common version
    const common = this.supportedVersions
      .filter(v => peerVersions.includes(v))
      .sort(semverCompare)
      .pop();

    if (!common) {
      throw new Error('No compatible protocol version');
    }

    return common;
  }

  handleMessage(msg: SyncMessage): void {
    // Dispatch to version-specific handler
    const handler = this.getHandler(msg.type, msg.typeVersion);
    if (!handler) {
      // Unknown message type - log and ignore
      console.warn(`Unknown message: ${msg.type}@${msg.typeVersion}`);
      return;
    }
    handler(msg.payload);
  }
}
```

---

## 5. Global Schema Registry Namespace

### Namespace Governance

```typescript
// Reserved namespaces (cannot be claimed)
const RESERVED_NAMESPACES = [
  'xnet.core',        // Core types
  'xnet.canvas',      // Canvas types
  'xnet.mcp',         // MCP types
  'xnet.internal',    // Internal use
  'xnet.reserved',    // Future use
];

// Namespace policy
interface NamespacePolicy {
  // Identity
  namespace: string;

  // Ownership
  owner: {
    did: string;
    contact: string;
  };

  // Versioning rules
  versioning: {
    // Major version = breaking changes allowed?
    allowBreaking: boolean;

    // Deprecation policy
    deprecationPeriod: string;  // e.g., '180d'

    // Backwards compatibility guarantee
    backwardsCompatVersions: number;  // e.g., 2 = support current-2
  };

  // Extension policy
  extensions: {
    allowThirdParty: boolean;
    approvalRequired: boolean;
    extensionPrefix: string;  // e.g., 'ext.'
  };
}
```

### Schema Definition with Evolution

```typescript
interface SchemaDefinition {
  // Identity
  id: string;              // 'xnet.core/Page'
  version: string;         // '1.2.0'

  // Schema content
  properties: Record<string, PropertySchema>;

  // Inheritance
  extends?: string;        // 'xnet.core/Block'

  // Evolution metadata
  evolution: {
    // Version history
    history: Array<{
      version: string;
      publishedAt: string;
      breaking: boolean;
      changes: string[];
    }>;

    // Deprecation
    deprecated?: {
      since: string;
      reason: string;
      replacedBy?: string;
      removeAfter?: string;
    };

    // Migration paths
    migrations: Array<{
      from: string;
      to: string;
      transform: string;   // URL to migration function
      automatic: boolean;  // Can be applied without user action
    }>;
  };

  // Metadata
  author: string;
  license: string;
  signature: string;
}

// Property schema with evolution
interface PropertySchema {
  type: string;
  required: boolean;

  // When was this property added/changed?
  addedIn: string;         // e.g., '1.1.0'
  changedIn?: string[];    // e.g., ['1.2.0']
  deprecatedIn?: string;
  removedIn?: string;

  // If deprecated, what replaces it?
  replacedBy?: string;

  // Description for documentation
  description?: string;
}
```

---

## 6. Export Format Versioning

### Export Manifest

Every export MUST include a manifest:

```typescript
interface ExportManifest {
  // Format version
  formatVersion: string;   // '1.0.0'

  // Exporter info
  exporter: {
    name: string;          // 'xNet'
    version: string;       // '1.2.3'
  };

  // Export metadata
  exportedAt: string;
  exportedBy: string;      // DID

  // Contents
  contents: {
    pages: { count: number; format: string; formatVersion: string };
    databases: { count: number; format: string; formatVersion: string };
    attachments: { count: number; totalSize: number };
  };

  // Compatibility
  compatibility: {
    minImporterVersion: string;
    schemaVersions: Record<string, number>;
  };

  // Integrity
  checksums: {
    algorithm: 'sha256' | 'blake3';
    manifest: string;
    contents: string;
  };
}
```

### Page Export Format

```yaml
# Page frontmatter with version
---
__formatVersion: "1.0.0"
id: 550e8400-e29b-41d4-a716-446655440000
title: Project Alpha
created: 2026-01-15T10:30:00Z
updated: 2026-01-20T14:22:00Z
tags:
  - project
  - active
aliases:
  - Alpha Project

# Reserved for future fields
__extensions: {}
---

# Project Alpha

Content here...
```

---

## 7. Implementation Checklist

### Phase 1: Foundation (Do Now)

```
□ Add __meta map to all Y.Doc with schemaVersion
□ Add __schemaVersion to BlockSchema
□ Add __extensions to BlockSchema
□ Implement PermissionSchemaV1 with entries array
□ Create PropertyTypeRegistry (empty, but structure ready)
□ Add version field to all MCP tool definitions
□ Add protocol version to sync messages
□ Create ExportManifest structure
□ Document namespace reservation policy
```

### Phase 1: Testing

```
□ Test that old documents open in new client
□ Test that new documents open in old client (graceful degradation)
□ Test MCP tool version negotiation
□ Test sync protocol version negotiation
□ Test export/import with version mismatches
```

### Phase 2: Evolution

```
□ First real schema migration (test the system)
□ Property type registry with custom types
□ MCP tool v2.0 with new parameters
□ Schema registry prototype
□ Export format v2.0
```

---

## Design Principles

### 1. Additive Only

```typescript
// WRONG: Removing or renaming fields
interface BlockV2 {
  // Removed: parentId (was in V1)
  parent: string;  // Renamed from parentId
}

// RIGHT: Add new fields, deprecate old ones
interface BlockV2 {
  parentId: string;           // Keep for compatibility
  parent: string;             // New preferred field
  __deprecated: {
    parentId: 'Use parent instead',
  };
}
```

### 2. Unknown Fields Pass Through

```typescript
// WRONG: Strict schema that rejects unknown fields
const BlockSchema = z.object({
  id: z.string(),
  type: z.string(),
}).strict();  // Fails on unknown fields!

// RIGHT: Allow unknown fields to pass through
const BlockSchema = z.object({
  id: z.string(),
  type: z.string(),
}).passthrough();  // Unknown fields preserved
```

### 3. Version in the Wire Format

```typescript
// WRONG: Implicit version
{ type: 'sync-update', data: [...] }

// RIGHT: Explicit version
{
  protocol: '1.0.0',
  type: 'sync-update',
  typeVersion: 1,
  data: [...]
}
```

### 4. Graceful Degradation

```typescript
function renderBlock(block: Block): ReactNode {
  const renderer = blockRenderers.get(block.type);

  if (!renderer) {
    // Unknown block type - show placeholder, don't crash
    return <UnknownBlockPlaceholder block={block} />;
  }

  return renderer(block);
}
```

### 5. Feature Flags Over Versions

```typescript
// For gradual rollout, use feature flags
interface DocumentMetadata {
  features: Set<string>;  // 'rich-embeds', 'formula-v2', 'canvas'
}

function supportsFeature(doc: Y.Doc, feature: string): boolean {
  const meta = doc.getMap('__meta');
  const features = meta.get('features') as Set<string>;
  return features?.has(feature) ?? false;
}
```

---

## Next Steps

- [Back to Plan Overview](./README.md)
- [Phase 1: Wiki & Tasks](./03-phase-1-wiki-tasks.md) - Apply versioning to schemas
- [AI & MCP Interface](./09-ai-mcp-interface.md) - MCP tool versioning

---

[← Previous: Scaling Architecture](./10-scaling-architecture.md) | [Back to Plan Overview →](./README.md)
