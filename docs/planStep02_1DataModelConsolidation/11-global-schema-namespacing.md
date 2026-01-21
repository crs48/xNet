# 11: Global Schema Namespacing

> How schemas coexist in a global namespace across users, organizations, and consortiums

**Status:** Design exploration

## The Vision

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Global Schema Namespace                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  xnet://schema.org/         W3C/Schema.org standard types               │
│  ├── Person                 (interop with the whole web)                │
│  ├── Organization                                                        │
│  ├── Event                                                               │
│  └── ...                                                                 │
│                                                                          │
│  xnet://xnet.dev/           xNet built-in types                         │
│  ├── Page                   (ships with every xNet instance)            │
│  ├── Database                                                            │
│  ├── Item                                                                │
│  ├── Canvas                                                              │
│  └── Task                                                                │
│                                                                          │
│  xnet://consortium.org/     Industry consortium types                   │
│  ├── Invoice                (e.g., accounting standards body)           │
│  ├── LineItem                                                            │
│  └── TaxCode                                                             │
│                                                                          │
│  xnet://acme-corp.com/      Organization types                          │
│  ├── Project                (your company's internal types)             │
│  ├── Sprint                                                              │
│  └── Customer                                                            │
│                                                                          │
│  xnet://did:key:z6Mk.../    Personal types                              │
│  ├── Recipe                 (your personal types)                       │
│  ├── BookNote                                                            │
│  └── HabitTracker                                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

Every schema has a globally unique IRI. No collisions. Full interoperability.

## How It Works

### Schema IRI Structure

```
xnet://<authority>/<path>

Where authority is one of:
- Domain name (schema.org, xnet.dev, acme-corp.com)
- DID (did:key:z6Mk...)
```

Examples:

```
xnet://xnet.dev/Page                    # Built-in Page type
xnet://schema.org/Person                # Schema.org Person
xnet://acme-corp.com/Project            # Acme Corp's Project type
xnet://did:key:z6MkUser.../Recipe       # User's personal Recipe type
```

### Schema Definition with Namespace

```typescript
// Built-in xNet schema
const PAGE_SCHEMA: Schema = {
  // Globally unique identifier
  '@id': 'xnet://xnet.dev/Page',

  // JSON-LD type (same as @id for schemas we define)
  '@type': 'xnet://xnet.dev/Schema',

  // Human-readable name
  name: 'Page',

  // Namespace this schema belongs to
  namespace: 'xnet://xnet.dev/',

  // Properties with namespaced IDs
  properties: [
    {
      '@id': 'xnet://xnet.dev/Page#title',
      name: 'Title',
      type: 'text',
      required: true,
      // Maps to Schema.org for interop
      sameAs: 'https://schema.org/name'
    },
    {
      '@id': 'xnet://xnet.dev/Page#icon',
      name: 'Icon',
      type: 'text'
    }
  ],

  document: 'yjs' // Has rich content
}

// User-defined schema
const RECIPE_SCHEMA: Schema = {
  '@id': 'xnet://did:key:z6MkUser.../Recipe',
  '@type': 'xnet://xnet.dev/Schema',

  name: 'Recipe',
  namespace: 'xnet://did:key:z6MkUser.../',

  properties: [
    {
      '@id': 'xnet://did:key:z6MkUser.../Recipe#title',
      name: 'Title',
      type: 'text',
      required: true,
      sameAs: 'https://schema.org/name'
    },
    {
      '@id': 'xnet://did:key:z6MkUser.../Recipe#ingredients',
      name: 'Ingredients',
      type: 'text'
    },
    {
      '@id': 'xnet://did:key:z6MkUser.../Recipe#cookTime',
      name: 'Cook Time',
      type: 'number',
      sameAs: 'https://schema.org/cookTime'
    }
  ],

  hasContent: true
}
```

### Namespace Authorities

| Authority Type      | Example                  | Trust Model     | Use Case         |
| ------------------- | ------------------------ | --------------- | ---------------- |
| **Standard bodies** | `schema.org`             | Universal       | Web-wide interop |
| **xNet core**       | `xnet.dev`               | Ships with xNet | Built-in types   |
| **Consortiums**     | `hl7.org`, `invoice.org` | Industry trust  | Domain standards |
| **Organizations**   | `acme-corp.com`          | Org-controlled  | Company types    |
| **Individuals**     | `did:key:z6Mk...`        | Self-sovereign  | Personal types   |

### JSON-LD Context

Each namespace provides a context that maps short names to full IRIs:

```typescript
// xnet.dev context
const XNET_CONTEXT = {
  '@context': {
    '@vocab': 'xnet://xnet.dev/',
    schema: 'https://schema.org/',

    // Types
    Page: 'xnet://xnet.dev/Page',
    Database: 'xnet://xnet.dev/Database',
    Item: 'xnet://xnet.dev/Item',

    // Properties map to Schema.org where applicable
    title: 'schema:name',
    created: 'schema:dateCreated',
    creator: 'schema:creator'
  }
}

// User's personal context (extends xnet)
const USER_CONTEXT = {
  '@context': [
    XNET_CONTEXT['@context'], // Import xnet context
    {
      '@vocab': 'xnet://did:key:z6MkUser.../',

      // User's types
      Recipe: 'xnet://did:key:z6MkUser.../Recipe',

      // User's properties (with Schema.org mappings)
      ingredients: 'schema:recipeIngredient',
      cookTime: 'schema:cookTime'
    }
  ]
}
```

## Resolution & Loading

### How Schemas Are Found

```typescript
// Schema resolution order
async function resolveSchema(schemaId: string): Promise<Schema> {
  // 1. Check local cache
  const cached = schemaCache.get(schemaId)
  if (cached) return cached

  // 2. Check if it's a built-in
  if (schemaId.startsWith('xnet://xnet.dev/')) {
    return BUILTIN_SCHEMAS[schemaId]
  }

  // 3. Check local workspace schemas
  const local = await queryNodes({
    schemaId: 'xnet://xnet.dev/Schema',
    filter: { '@id': schemaId }
  })
  if (local.length > 0) return local[0] as Schema

  // 4. Check federated sources (if enabled)
  if (schemaId.startsWith('xnet://') && federation.enabled) {
    return await federation.fetchSchema(schemaId)
  }

  // 5. Check well-known locations
  // xnet://acme-corp.com/Project → https://acme-corp.com/.well-known/xnet/schemas/Project.json
  const wellKnownUrl = schemaIdToWellKnown(schemaId)
  const fetched = await fetch(wellKnownUrl)
  if (fetched.ok) {
    const schema = await fetched.json()
    schemaCache.set(schemaId, schema)
    return schema
  }

  throw new Error(`Schema not found: ${schemaId}`)
}
```

### Well-Known Schema Locations

Organizations can host their schemas at well-known URLs:

```
xnet://acme-corp.com/Project
  ↓ resolves to
https://acme-corp.com/.well-known/xnet/schemas/Project.json
```

```json
// https://acme-corp.com/.well-known/xnet/schemas/Project.json
{
  "@context": "xnet://xnet.dev/context",
  "@id": "xnet://acme-corp.com/Project",
  "@type": "xnet://xnet.dev/Schema",
  "name": "Project",
  "namespace": "xnet://acme-corp.com/",
  "properties": [
    { "@id": "xnet://acme-corp.com/Project#name", "name": "Name", "type": "text" },
    { "@id": "xnet://acme-corp.com/Project#status", "name": "Status", "type": "select" },
    { "@id": "xnet://acme-corp.com/Project#owner", "name": "Owner", "type": "person" }
  ]
}
```

## Using Schemas Across Namespaces

### Importing a Schema

```typescript
// In your workspace, import a schema from another namespace
const importedSchema = await importSchema('xnet://consortium.org/Invoice')

// Now you can create nodes of that type
const invoice = createNode({
  schemaId: 'xnet://consortium.org/Invoice',
  properties: {
    'xnet://consortium.org/Invoice#number': 'INV-001',
    'xnet://consortium.org/Invoice#amount': 1500.0,
    'xnet://consortium.org/Invoice#currency': 'USD'
  }
})
```

### Property Shorthand with Context

With the right context, you don't need full IRIs:

```typescript
// With consortium context loaded
const invoice = createNode({
  '@context': 'xnet://consortium.org/context',
  schemaId: 'Invoice', // Resolves to xnet://consortium.org/Invoice
  properties: {
    number: 'INV-001', // Resolves to xnet://consortium.org/Invoice#number
    amount: 1500.0,
    currency: 'USD'
  }
})
```

### Extending Schemas Across Namespaces

Your company can extend a consortium schema:

```typescript
const ACME_INVOICE_SCHEMA: Schema = {
  '@id': 'xnet://acme-corp.com/AcmeInvoice',
  '@type': 'xnet://xnet.dev/Schema',

  name: 'Acme Invoice',
  namespace: 'xnet://acme-corp.com/',

  // Extends the consortium Invoice
  extends: 'xnet://consortium.org/Invoice',

  // Add company-specific properties
  properties: [
    {
      '@id': 'xnet://acme-corp.com/AcmeInvoice#department',
      name: 'Department',
      type: 'select',
      config: {
        options: ['Engineering', 'Sales', 'Marketing']
      }
    },
    {
      '@id': 'xnet://acme-corp.com/AcmeInvoice#approver',
      name: 'Approver',
      type: 'person'
    }
  ]
}
```

## Interoperability Examples

### Scenario 1: Personal → Schema.org

Your recipe syncs to the web:

```typescript
// Your recipe node
const recipe: Node = {
  '@id': 'xnet://did:key:z6MkYou.../node-123',
  schemaId: 'xnet://did:key:z6MkYou.../Recipe',
  properties: {
    title: "Grandma's Pancakes",
    ingredients: ['2 cups flour', '2 eggs', '1 cup milk'],
    cookTime: 15
  }
}

// Export as Schema.org Recipe (for Google, Pinterest, etc.)
const schemaOrgRecipe = exportAsSchemaOrg(recipe)
// {
//   "@context": "https://schema.org",
//   "@type": "Recipe",
//   "name": "Grandma's Pancakes",
//   "recipeIngredient": ["2 cups flour", "2 eggs", "1 cup milk"],
//   "cookTime": "PT15M"
// }
```

### Scenario 2: Company → Consortium → Partner

Invoice flows between systems:

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Acme Corp     │      │   Consortium    │      │   Partner Inc   │
│                 │      │   Standard      │      │                 │
│  AcmeInvoice    │─────▶│    Invoice      │─────▶│  PartnerInvoice │
│  (extends)      │      │   (base type)   │      │  (extends)      │
│                 │      │                 │      │                 │
│  + department   │      │  number         │      │  + costCenter   │
│  + approver     │      │  amount         │      │  + poNumber     │
│                 │      │  currency       │      │                 │
└─────────────────┘      │  lineItems      │      └─────────────────┘
                         │  vendor         │
                         │  customer       │
                         └─────────────────┘
```

Both companies understand the core Invoice fields. Each adds their own extensions.

### Scenario 3: Multiple Personal Schemas

You and a friend share recipes:

```
┌─────────────────────────────────────────────────────────────────┐
│  Your Workspace                                                  │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ Your Recipe         │    │ Friend's Recipe     │            │
│  │ xnet://did:you/     │    │ xnet://did:friend/  │            │
│  │                     │    │                     │            │
│  │ - title             │    │ - name (mapped)     │            │
│  │ - ingredients       │    │ - ingredients       │            │
│  │ - cookTime          │    │ - prepTime          │            │
│  │                     │    │ - cookTime          │            │
│  └─────────────────────┘    │ - difficulty        │            │
│                              └─────────────────────┘            │
│                                                                  │
│  Both work! Schema registry knows both types.                   │
│  Query: "all recipes" finds both via sameAs mappings.           │
└─────────────────────────────────────────────────────────────────┘
```

## Conflict Resolution

### Property Name Collisions

Different schemas might use the same short name differently:

```typescript
// Schema A: "status" is a select (todo/done)
// Schema B: "status" is a number (HTTP status code)

// Solution: Always use full IRI internally
node.properties['xnet://acme.com/Task#status'] // Select
node.properties['xnet://api.com/Request#status'] // Number

// Short names only work within a single context
```

### Schema Version Evolution

Schemas can evolve with versioning:

```typescript
const INVOICE_V1: Schema = {
  '@id': 'xnet://consortium.org/Invoice',
  version: '1.0.0'
  // ...
}

const INVOICE_V2: Schema = {
  '@id': 'xnet://consortium.org/Invoice',
  version: '2.0.0',
  replaces: 'xnet://consortium.org/Invoice@1.0.0'
  // New properties, migrations defined
}
```

## Implementation Considerations

### Storage

Internally, we always store full IRIs:

```typescript
// Stored in database
{
  id: 'node-123',
  schemaId: 'xnet://did:key:z6MkUser.../Recipe',  // Full IRI
  properties: {
    'xnet://did:key:z6MkUser.../Recipe#title': 'Pancakes',
    'xnet://did:key:z6MkUser.../Recipe#cookTime': 15
  }
}
```

### Display

UI shows short names via context:

```typescript
// UI helper
function getPropertyDisplayName(propId: string, schema: Schema): string {
  const prop = schema.properties.find((p) => p['@id'] === propId)
  return prop?.name ?? propId.split('#').pop() ?? propId
}

// Shows "Cook Time" not "xnet://did:key:z6MkUser.../Recipe#cookTime"
```

### Querying

Queries can use short names with context:

```typescript
// With context
const results = await query({
  '@context': 'xnet://acme-corp.com/context',
  schemaId: 'Project', // Expands to xnet://acme-corp.com/Project
  filter: {
    status: 'active' // Expands to xnet://acme-corp.com/Project#status
  }
})

// Or explicit IRIs
const results = await query({
  schemaId: 'xnet://acme-corp.com/Project',
  filter: {
    'xnet://acme-corp.com/Project#status': 'active'
  }
})
```

## Trust & Verification

### Who Can Define Schemas?

| Namespace         | Who Controls   | Verification           |
| ----------------- | -------------- | ---------------------- |
| `xnet.dev`        | xNet core team | Shipped in code        |
| `schema.org`      | W3C            | DNS + well-known       |
| `acme-corp.com`   | Domain owner   | DNS + well-known       |
| `did:key:z6Mk...` | Key holder     | Signature verification |

### Schema Signing

Schemas can be signed by their authority:

```typescript
const signedSchema = {
  '@id': 'xnet://acme-corp.com/Project',
  // ... schema content

  // Signature by domain controller
  proof: {
    type: 'Ed25519Signature2020',
    created: '2026-01-21T00:00:00Z',
    verificationMethod: 'did:web:acme-corp.com#key-1',
    proofPurpose: 'assertionMethod',
    proofValue: 'z...'
  }
}
```

## Summary

| Aspect                | Approach                                                        |
| --------------------- | --------------------------------------------------------------- |
| **Identifier format** | `xnet://<authority>/<path>`                                     |
| **Authority types**   | Domains, DIDs, well-known bodies                                |
| **Resolution**        | Local cache → built-in → local DB → federation → well-known URL |
| **Interop**           | Schema.org mappings via `sameAs`                                |
| **Conflict handling** | Full IRIs internally, short names via context                   |
| **Trust**             | DNS for domains, signatures for DIDs                            |

This gives us a truly global namespace where:

- Your schemas don't collide with mine
- Industry standards coexist with personal types
- Everything maps to the semantic web
- Types can be shared, extended, and federated

---

[← Back to TypeScript Safety](./10-schema-first-with-typescript.md) | [Back to README](./README.md)
