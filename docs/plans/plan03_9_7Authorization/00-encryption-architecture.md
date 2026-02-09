# 00: Encryption Architecture

> Define the cryptographic foundation that makes authorization meaningful: encrypted content, metadata envelopes, key distribution, and revocation handling.

**Duration:** 5 days  
**Dependencies:** None (foundational)  
**Packages:** `packages/crypto`, `packages/data`, `packages/hub`

## Why This Step Exists

Authorization without encryption is theater. In a decentralized system where data flows through untrusted hubs and syncs across devices, **the only meaningful authorization is the ability to decrypt**.

This step defines:

- How content is encrypted before leaving the client
- How hubs can filter/query without decrypting
- How access grants distribute decryption keys
- How revocation actually works (hint: requires key rotation)

## Core Principles

1. **Client-side encryption**: Content is encrypted before transmission, hub only sees ciphertext
2. **Metadata visibility**: Public metadata enables hub filtering without exposing content
3. **Key per node**: Each node has its own content key (fine-grained revocation)
4. **Grant = key distribution**: Access grants deliver encrypted content keys to recipients
5. **Revocation = key rotation**: True revocation requires re-encrypting with new keys

## Encrypted Node Envelope

Every node is wrapped in an envelope with two parts: **public metadata** (unencrypted, for querying) and **encrypted content** (private, only visible to authorized parties).

```typescript
interface EncryptedNodeEnvelope {
  // ─── Public Metadata (unencrypted, signed) ─────────────────────────

  /** Schema type - enables schema-based queries */
  schema: SchemaIRI

  /** Node ID - unique identifier */
  id: string

  /** Who created this node - enables owner-based queries */
  createdBy: DID

  /** Unix timestamp - enables time-based queries */
  createdAt: number

  /** Lamport timestamp for causal ordering */
  lamport: number

  /**
   * Recipients - DIDs who can decrypt this node.
   * The hub uses this for authorization filtering.
   */
  recipients: DID[]

  /**
   * Public properties - optional unencrypted metadata for filtering.
   * Example: a document's title might be public for search,
   * while the document body is encrypted.
   */
  publicProps?: Record<string, unknown>

  /**
   * Encrypted content key, wrapped for each recipient.
   * Map from recipient DID to their encrypted copy of the content key.
   */
  encryptedKeys: Map<DID, EncryptedKey>

  // ─── Encrypted Content ─────────────────────────────────────────────

  encryptedContent: {
    /** XChaCha20-Poly1305 ciphertext */
    ciphertext: Uint8Array
    /** Nonce for encryption */
    nonce: Uint8Array
    /** Authentication tag */
    tag: Uint8Array
  }

  // ─── Integrity ─────────────────────────────────────────────────────

  /** Author's signature over the entire envelope (metadata + encrypted content) */
  signature: Uint8Array
}

type EncryptedKey = {
  /** Key type identifier */
  algorithm: 'X25519-XChaCha20'
  /** Encrypted content key (256 bits) */
  wrappedKey: Uint8Array
  /** Nonce used for key wrapping */
  nonce: Uint8Array
}
```

### Content Key Generation

Each node gets a random 256-bit content key:

```typescript
import { generateKey } from '@xnet/crypto'

const contentKey = generateKey() // 32 random bytes
```

### Content Encryption

```typescript
import { encryptWithNonce } from '@xnet/crypto'

// Serialize node properties (excluding the envelope fields)
const plaintext = encodeNodeProperties(properties)

// Encrypt with content key
const { ciphertext, nonce, tag } = encryptWithNonce(plaintext, contentKey)
```

### Key Wrapping for Recipients

```typescript
import { deriveSharedSecret, encryptWithNonce } from '@xnet/crypto'

async function wrapKeyForRecipient(
  contentKey: Uint8Array,
  recipientDID: DID,
  recipientPublicKey: Uint8Array
): Promise<EncryptedKey> {
  // Derive shared secret using X25519
  const ephemeralKeyPair = generateKeyPair()
  const sharedSecret = deriveSharedSecret(ephemeralKeyPair.privateKey, recipientPublicKey)

  // Encrypt content key with shared secret
  const { ciphertext: wrappedKey, nonce } = encryptWithNonce(contentKey, sharedSecret)

  return {
    algorithm: 'X25519-XChaCha20',
    wrappedKey,
    nonce
    // Note: ephemeral public key is stored separately or derived from context
  }
}
```

## Metadata vs Content Separation

### What Goes in Public Metadata

These fields are **unencrypted** so the hub can index and filter:

| Field         | Purpose          | Example Query              |
| ------------- | ---------------- | -------------------------- |
| `schema`      | Filter by type   | "all Task nodes"           |
| `id`          | Unique lookup    | "node with ID xyz"         |
| `createdBy`   | Owner filter     | "all my documents"         |
| `createdAt`   | Time range       | "created last week"        |
| `recipients`  | Authorization    | "nodes I can access"       |
| `publicProps` | Custom filtering | "public status = 'active'" |

### What Goes in Encrypted Content

Everything else is **encrypted** and only visible to authorized parties:

- All node properties (unless explicitly marked public)
- Relation targets (if relations are private)
- Document content
- Internal metadata

### Public Properties Schema

Schema authors can mark specific properties as public:

```typescript
const TaskSchema = defineSchema({
  name: 'Task',
  properties: {
    title: stringProperty({ public: true }), // Visible to hub
    description: stringProperty({ public: false }), // Encrypted
    status: selectProperty(['todo', 'done'], { public: true }),
    secretNotes: stringProperty({ public: false })
  }
})
```

Trade-off: Public properties enable hub filtering but are visible to the hub operator.

## Hub Storage with Metadata Index

### What the Hub Stores

The hub stores the **full envelope** but can only read the **metadata section**:

```typescript
// Hub storage layer
interface StoredNode {
  /** Full envelope (metadata is plaintext, content is ciphertext) */
  envelope: EncryptedNodeEnvelope

  /**
   * Metadata index for querying.
   * Extracted from envelope for efficient filtering.
   */
  meta: {
    schema: SchemaIRI
    id: string
    createdBy: DID
    createdAt: number
    recipients: DID[]
    publicProps: Record<string, unknown>
    lamport: number
  }
}
```

### Hub Query Processing

```typescript
async function executeQuery(did: DID, query: Query): Promise<EncryptedNodeEnvelope[]> {
  // 1. Query metadata index (fast, no decryption needed)
  const candidates = await metaIndex.query({
    schema: query.schema,
    createdBy: query.owner,
    ...query.filters
  })

  // 2. Filter by authorization (recipient check)
  const authorized = candidates.filter((node) => {
    // Direct recipient?
    if (node.meta.recipients.includes(did)) return true

    // Has valid grant?
    return hasActiveGrant(node.id, did)
  })

  // 3. Return full envelopes (client decrypts)
  return authorized.map((n) => n.envelope)
}
```

### Security Properties

- **Hub cannot read content**: Only sees metadata and ciphertext
- **Hub cannot forge**: All envelopes are signed by author
- **Hub can censor**: Hub could drop nodes, but clients detect via sync
- **Hub learns metadata**: Hub sees schema types, timestamps, recipients

## Access Grants as Key Distribution

### Grant Structure

Access grants are **also encrypted nodes** that distribute decryption keys:

```typescript
interface AccessGrant {
  // Envelope metadata (standard for all nodes)
  schema: 'xnet://xnet.fyi/Grant@1.0.0'
  id: string
  createdBy: DID // The granter
  recipients: DID[] // The grantee(s)

  // Grant-specific encrypted content
  encryptedContent: {
    resource: NodeId // Which node this grant is for
    grantee: DID // Who gets access
    encryptedContentKey: EncryptedKey // The actual decryption key
    capabilities: string[] // What they can do ['read', 'write']
    expires?: number // Optional expiration

    // Revocation
    revokedAt?: number
    revokedBy?: DID
  }
}
```

### Grant Lifecycle

```typescript
// Alice grants Bob access to a node
async function createGrant(
  granter: DID,
  grantee: DID,
  nodeId: string,
  capabilities: string[]
): Promise<AccessGrant> {
  // 1. Get the node's content key (granter must have it)
  const contentKey = await getContentKey(nodeId)

  // 2. Wrap key for grantee
  const encryptedKey = await wrapKeyForRecipient(
    contentKey,
    grantee,
    await resolvePublicKey(grantee)
  )

  // 3. Create grant node
  const grant: AccessGrant = {
    schema: 'xnet://xnet.fyi/Grant@1.0.0',
    id: createNodeId(),
    createdBy: granter,
    recipients: [grantee],
    encryptedContent: {
      resource: nodeId,
      grantee,
      encryptedContentKey: encryptedKey,
      capabilities
    }
  }

  // 4. Sync grant to hub (grantee will receive it)
  return await storeAndSync(grant)
}
```

### Receiving a Grant

When Bob receives a grant:

```typescript
async function processGrant(grant: AccessGrant) {
  // 1. Decrypt the grant content (Bob is a recipient)
  const grantContent = await decryptNode(grant)

  // 2. Decrypt the content key using Bob's private key
  const contentKey = await unwrapKey(grantContent.encryptedContentKey, myPrivateKey)

  // 3. Cache the key for future use
  await cacheContentKey(grantContent.resource, contentKey)

  // 4. Now Bob can read the node
  console.log('Access granted to', grantContent.resource)
}
```

## Revocation with Key Rotation

### The Problem

If Alice grants Bob access, then revokes it:

- Bob might have cached the content key
- Simply deleting the grant doesn't prevent Bob from using cached keys
- **Solution**: Rotate the content key and re-encrypt

### Revocation Flow

```typescript
async function revokeAccess(nodeId: string, grantee: DID, revoker: DID): Promise<void> {
  // 1. Mark grant as revoked
  await revokeGrant(nodeId, grantee)

  // 2. Generate NEW content key
  const newContentKey = generateKey()

  // 3. Get current authorized users (excluding revoked)
  const authorizedUsers = await getAuthorizedUsers(nodeId).filter((u) => u !== grantee)

  // 4. Re-encrypt content with new key
  const plaintext = await decryptWithOldKey(nodeId) // Current holder decrypts
  const encrypted = encryptWithNonce(plaintext, newContentKey)

  // 5. Wrap new key for each authorized user
  const encryptedKeys = new Map()
  for (const user of authorizedUsers) {
    const wrapped = await wrapKeyForRecipient(newContentKey, user, await resolvePublicKey(user))
    encryptedKeys.set(user, wrapped)
  }

  // 6. Update node envelope
  await updateNodeEncryption(nodeId, encrypted, encryptedKeys)

  // 7. Sync updated node to all replicas
  await syncNode(nodeId)
}
```

### Revocation Complexity

Key rotation is **expensive**:

- Must decrypt and re-encrypt entire node
- Must re-wrap key for all remaining users
- Must sync new envelope to all replicas
- Large nodes with many recipients = slow

**Mitigations**:

- Batch revocations (don't rotate immediately, batch hourly)
- Use coarse-grained keys for high-churn scenarios
- Lazy rotation (only rotate when revoked user comes online)

## Trade-offs and Design Decisions

### Per-Node vs Per-Schema Keys

| Approach            | Security                          | Revocation Cost        | Use Case                      |
| ------------------- | --------------------------------- | ---------------------- | ----------------------------- |
| **Per-node keys**   | High - revoke one node only       | O(n) re-wraps per node | Sensitive docs, small sets    |
| **Per-schema keys** | Medium - revoke all nodes of type | O(n) re-wraps once     | Large datasets, common access |
| **Hybrid**          | Configurable                      | Varies                 | Default: per-node             |

**Decision**: Default to per-node keys with optional schema-level key sharing for performance.

### Eager vs Lazy Key Rotation

| Approach           | Security             | Performance              | Use Case                |
| ------------------ | -------------------- | ------------------------ | ----------------------- |
| **Eager rotation** | Immediate revocation | High latency on revoke   | High-security scenarios |
| **Lazy rotation**  | Delayed revocation   | Low latency, batch later | General use             |

**Decision**: Default to eager rotation with lazy batching as optimization.

### Public Metadata Scope

| Metadata      | Trade-off                                     |
| ------------- | --------------------------------------------- |
| `schema`      | Hub knows node types (leaks structure)        |
| `createdBy`   | Hub knows ownership (leaks social graph)      |
| `recipients`  | Hub knows access patterns (leaks permissions) |
| `publicProps` | Application-defined (opt-in per property)     |

**Decision**: All core metadata is public. Applications minimize `publicProps` for privacy.

## Implementation Sequence

### Phase 1: Core Encryption (Days 1-2)

1. Implement `EncryptedNodeEnvelope` structure
2. Add content key generation and wrapping
3. Create envelope serialization/deserialization
4. Add envelope signing/verification

### Phase 2: Client-Side Encryption (Days 3-4)

1. Encrypt nodes before `NodeStore.create/update`
2. Decrypt nodes after `NodeStore.get/query`
3. Handle key caching in memory
4. Transparent encryption layer (devs don't manually encrypt)

### Phase 3: Hub Metadata Index (Day 5)

1. Extract metadata from envelopes on hub ingest
2. Build metadata index tables
3. Implement query filtering on metadata
4. Authorization filter using recipient lists

## Integration with Authorization Plan

This encryption architecture **enables** the authorization plan:

- **Step 01-02**: Authorization schema defines who gets added to `recipients`
- **Step 04**: Auth evaluator checks if DID is in `recipients` or has valid grant
- **Step 06**: Grants distribute encrypted keys via `encryptedKeys` map
- **Step 07**: Hub filters using metadata index + recipient check

**Without this foundation, the authorization evaluator would have nothing to evaluate.**

## Security Considerations

### Threat Model

| Threat                      | Mitigation                 |
| --------------------------- | -------------------------- |
| Hub operator reads data     | Client-side encryption     |
| Hub operator modifies data  | Envelope signatures        |
| Network eavesdropping       | TLS + encrypted envelopes  |
| Unauthorized access         | Recipient lists + grants   |
| Revoked user retains access | Key rotation on revocation |
| Metadata analysis           | Minimize publicProps       |

### Attack Scenarios

1. **Compromised hub**: Attacker gets ciphertext + metadata. Cannot decrypt without keys.
2. **Compromised grant**: Attacker gets encrypted key. Cannot decrypt without recipient's private key.
3. **Stale key cache**: Revoked user tries old key. Fails decryption, triggers re-sync with new key.

## Checklist

- [ ] `EncryptedNodeEnvelope` structure defined and serialized.
- [ ] Content key generation and XChaCha20 encryption implemented.
- [ ] Key wrapping with X25519 shared secrets implemented.
- [ ] Envelope signing with Ed25519 implemented.
- [ ] Public metadata extraction for hub indexing.
- [ ] Client-side transparent encryption layer in NodeStore.
- [ ] Hub metadata index tables created.
- [ ] Hub query filtering using recipient lists implemented.
- [ ] Access grant structure with encrypted keys defined.
- [ ] Key rotation on revocation implemented.
- [ ] Security review of threat model completed.

---

**Next**: After completing this step, proceed to [01-alignment-and-adrs.md](./01-alignment-and-adrs.md) which defines the authorization policy language that populates the `recipients` list and grants.
