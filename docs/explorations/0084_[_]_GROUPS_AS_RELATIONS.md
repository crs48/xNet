# Groups as Relations: Eliminating the Group Primitive

> Re-examining whether we need an explicit `group()` schema type, or if groups naturally emerge from `relation()` + `person({ multiple: true })` patterns.

**Date**: February 2026  
**Status**: Exploration  
**Related**: [0083_UNIFIED_AUTHORIZATION_ARCHITECTURE.md](./0083_[_]_UNIFIED_AUTHORIZATION_ARCHITECTURE.md)

---

## The Core Question

In 0083, I proposed:

```typescript
const TaskSchema = defineSchema({
  properties: {
    team: group({ required: true }) // Special primitive?
  }
})
```

But we already have:

- `relation()` - reference to another node
- `person()` - reference to a DID (identity)
- `person({ multiple: true })` - array of DIDs

**Do we need a special `group()` type, or can groups just be nodes with `person({ multiple: true })` properties?**

---

## The Simpler Model: Groups as Nodes with Members

### Any Node Can Be a "Group"

```typescript
// A team is just a node with members
const TeamSchema = defineSchema({
  name: 'Team',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    name: text({ required: true }),
    // Members are just people!
    members: person({ multiple: true }),
    admins: person({ multiple: true }),
    description: text()
  }
})

// A project with members
const ProjectSchema = defineSchema({
  name: 'Project',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    name: text({ required: true }),
    // Project members
    collaborators: person({ multiple: true }),
    lead: person() // Single person
  }
})

// A document with reviewers
const DocumentSchema = defineSchema({
  name: 'Document',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    title: text(),
    // Reviewers
    reviewers: person({ multiple: true }),
    approvers: person({ multiple: true })
  }
})
```

All three are "groups" in the sense that they have members - but they're just regular nodes!

### Referencing "Groups" with Relations

```typescript
const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    title: text(),
    // Reference the team (which has members)
    team: relation({
      target: 'xnet://xnet.fyi/Team'
    }),
    // Could also reference a project
    project: relation({
      target: 'xnet://xnet.fyi/Project'
    })
  },

  permissions: {
    // Check if user is in the team's members
    read: 'relation:team:members | relation:project:collaborators | owner',
    write: 'relation:team:admins | owner'
  }
})
```

---

## Permission Expressions with Relations

### New Permission Expression Syntax

Instead of `group:team:member`, we use the actual relation path:

```typescript
// OLD (with group primitive)
permissions: {
  read: 'group:team:member | owner'
}

// NEW (with relations)
permissions: {
  // Check if user is in team.members
  read: 'relation.team.members | owner',

  // Check if user is in team.admins
  write: 'relation.team.admins | owner',

  // Check multiple relations
  read: 'relation.team.members | relation.project.collaborators | owner',

  // Check if user is the project lead
  assign: 'relation.project.lead | owner'
}
```

### The Dot Notation

```
relation.<property-name>.<person-property>

Examples:
- relation.team.members     → task.team.members includes user
- relation.project.lead     → task.project.lead === user
- relation.parent.admins    → task.parent.admins includes user
```

---

## Implementation: PermissionEvaluator with Relations

### Resolving Relation Paths

```typescript
class RelationAwarePermissionEvaluator {
  async can(request: PermissionRequest): Promise<boolean> {
    const { subject, action, resource } = request

    // Get node
    const node = await this.store.getNode(resource)
    const schema = this.schemaRegistry.get(node.schemaId)

    // Get permission expression
    const permissionExpr = schema.permissions[action]

    // Evaluate expression
    return this.evaluateExpression(permissionExpr, subject, node, schema)
  }

  private async evaluateExpression(
    expr: string,
    subject: DID,
    node: Node,
    schema: Schema
  ): Promise<boolean> {
    // Handle OR
    if (expr.includes(' | ')) {
      const parts = expr.split(' | ')
      for (const part of parts) {
        if (await this.evaluateExpression(part.trim(), subject, node, schema)) {
          return true
        }
      }
      return false
    }

    // Handle AND
    if (expr.includes(' & ')) {
      const parts = expr.split(' & ')
      for (const part of parts) {
        if (!(await this.evaluateExpression(part.trim(), subject, node, schema))) {
          return false
        }
      }
      return true
    }

    // Handle relation paths
    if (expr.startsWith('relation.')) {
      return this.checkRelationPath(expr, subject, node)
    }

    // Handle owner
    if (expr === 'owner') {
      return node.createdBy === subject
    }

    // Handle public
    if (expr === 'public') {
      return true
    }

    return false
  }

  private async checkRelationPath(
    path: string, // e.g., "relation.team.members"
    subject: DID,
    node: Node
  ): Promise<boolean> {
    // Parse path: relation.<prop>.<person-prop>
    const parts = path.split('.')
    if (parts.length !== 3) return false

    const [, relationProp, personProp] = parts

    // Get related node ID
    const relatedNodeId = node.properties[relationProp]
    if (!relatedNodeId) return false

    // Fetch related node
    const relatedNode = await this.store.getNode(relatedNodeId)
    if (!relatedNode) return false

    // Get the person property
    const personValue = relatedNode.properties[personProp]

    if (Array.isArray(personValue)) {
      // Multiple people
      return personValue.includes(subject)
    } else {
      // Single person
      return personValue === subject
    }
  }
}
```

---

## Comparing Approaches

### With Explicit `group()` Type

```typescript
// Schema definition
const TaskSchema = defineSchema({
  properties: {
    team: group({ required: true }) // Special type
  },
  permissions: {
    read: 'group:team:member | owner' // Special syntax
  }
})

// Creating
const task = await store.create(TaskSchema, {
  title: 'My Task',
  team: 'xnet://did:alice/node/eng-team' // Reference to Group node
})

// What's a Group?
// - Special node type
// - Must have members property
// - Group schema enforced by system
```

**Pros:**

- Clear intent - "this is a group"
- System can enforce group structure
- Easy to find all groups

**Cons:**

- New primitive to learn
- Less flexible (what if I want a group with extra fields?)
- Special case in permission syntax

### With `relation()` + `person()`

```typescript
// Schema definition
const TaskSchema = defineSchema({
  properties: {
    team: relation({ target: 'xnet://xnet.fyi/Team' }) // Just a relation
  },
  permissions: {
    read: 'relation.team.members | owner' // Path syntax
  }
})

const TeamSchema = defineSchema({
  properties: {
    name: text(),
    members: person({ multiple: true }), // Just people!
    admins: person({ multiple: true }),
    // Can add ANY other properties
    department: text(),
    budget: number()
  }
})

// Creating
const task = await store.create(TaskSchema, {
  title: 'My Task',
  team: 'xnet://did:alice/node/eng-team' // Reference to Team node
})
```

**Pros:**

- No new primitives
- Composable - any node can be a "group"
- Flexible - add any properties to "group" nodes
- Uses existing relation resolution
- Permission paths are intuitive

**Cons:**

- "Group-ness" is implicit
- Need convention for member properties
- Slightly more verbose permissions

---

## The Verdict: Relations Are Sufficient

### Why We Don't Need `group()`

1. **Any node can have members**
   - Team has members
   - Project has collaborators
   - Document has reviewers
   - Event has attendees

2. **Permission paths are clearer**
   - `relation.team.members` vs `group:team:member`
   - Shows the actual data path

3. **More flexible**
   - Can have multiple member lists (members, admins, guests)
   - Can add custom fields to "groups"

4. **Simpler mental model**
   - Everything is a node
   - Relations connect nodes
   - Person properties contain DIDs

### When is Something a "Group"?

A node is a "group" if it has a `person()` property and is referenced by other nodes for permission purposes. That's it!

```typescript
// This is a group
const TeamSchema = defineSchema({
  properties: {
    members: person({ multiple: true })
  }
})

// This is ALSO a group
const ProjectSchema = defineSchema({
  properties: {
    collaborators: person({ multiple: true })
  }
})

// This is NOT a group (no members)
const CommentSchema = defineSchema({
  properties: {
    author: person(), // Single person, not a group
    content: text()
  }
})
```

---

## Updated Schema Examples

### Task with Multiple "Groups"

```typescript
const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    title: text({ required: true }),

    // Primary team (has members)
    team: relation({ target: 'xnet://xnet.fyi/Team' }),

    // Secondary stakeholders (also has members)
    stakeholders: relation({
      target: 'xnet://xnet.fyi/StakeholderGroup',
      multiple: true
    }),

    // Direct assignee (single person)
    assignee: person()
  },

  permissions: {
    // Anyone in team or stakeholders can read
    read: 'relation.team.members | relation.stakeholders.members | assignee | owner',

    // Only team members can write
    write: 'relation.team.members | owner',

    // Only team admins can delete
    delete: 'relation.team.admins | owner',

    // Assignee or team admins can change status
    assign: 'assignee | relation.team.admins | owner'
  }
})
```

### Project with Nested Groups

```typescript
const ProjectSchema = defineSchema({
  name: 'Project',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    name: text(),

    // Project has its own members
    collaborators: person({ multiple: true }),
    leads: person({ multiple: true }),

    // References parent organization
    organization: relation({ target: 'xnet://xnet.fyi/Organization' })
  },

  permissions: {
    // Project members or org members
    read: 'collaborators | relation.organization.members | owner',

    // Project leads or org admins
    write: 'leads | relation.organization.admins | owner'
  }
})
```

### Document with Reviewers

```typescript
const DocumentSchema = defineSchema({
  name: 'Document',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    title: text(),
    content: text(),

    // Review workflow
    reviewers: person({ multiple: true }),
    approvers: person({ multiple: true }),

    // Reference to governing team
    owningTeam: relation({ target: 'xnet://xnet.fyi/Team' })
  },

  permissions: {
    // Wide read access
    read: 'reviewers | approvers | relation.owningTeam.members | owner',

    // Only reviewers can edit draft
    write: 'reviewers | owner',

    // Only approvers can finalize
    approve: 'approvers | owner'
  }
})
```

---

## Permission Expression Syntax (Revised)

### Supported Patterns

```typescript
// Direct person property on current node
createdBy // node.createdBy === user
properties.assignee // node.properties.assignee === user
properties.watchers // node.properties.watchers includes user

// Relation path (follow relation, check person property)
relation.team.members // node.team.members includes user
relation.project.leads // node.project.leads includes user
relation.parent.admins // node.parent.admins includes user

// Multiple relations
relation.team.members | relation.project.collaborators

// Combined with owner
relation.team.admins | owner

// Public access
public // always true

// Negation (not yet implemented)
!relation.team.banned // user NOT in banned list
```

---

## Migration from 0083

### Before (with group primitive)

```typescript
const TaskSchema = defineSchema({
  properties: {
    team: group({ required: true })
  },
  permissions: {
    read: 'group:team:member | owner'
  }
})
```

### After (with relations)

```typescript
const TeamSchema = defineSchema({
  properties: {
    name: text(),
    members: person({ multiple: true }),
    admins: person({ multiple: true })
  }
})

const TaskSchema = defineSchema({
  properties: {
    team: relation({ target: 'xnet://xnet.fyi/Team' })
  },
  permissions: {
    read: 'relation.team.members | owner'
  }
})
```

---

## Conclusion

**We don't need a `group()` primitive.**

Groups naturally emerge from the combination of:

1. **Nodes** (to represent the group entity)
2. **`person({ multiple: true })`** (to represent membership)
3. **`relation()`** (to reference groups from other nodes)
4. **Permission paths** (to traverse relations and check membership)

This is more flexible, more explicit, and requires no new primitives. Any node can be a "group" if it has member properties.

### Updated Recommendation

- ❌ Remove `group()` from schema DSL
- ✅ Use `relation()` to reference "group" nodes
- ✅ Use `person({ multiple: true })` for member lists
- ✅ Use `relation.<prop>.<person-prop>` in permission expressions
- ✅ Any node can serve as a permission group

### Benefits

1. **Simpler**: No new types to learn
2. **Flexible**: Any node can be a group
3. **Composible**: Multiple member lists per node
4. **Explicit**: Permission paths show actual data relationships
5. **Consistent**: Uses existing schema primitives

---

## References

- [0083_UNIFIED_AUTHORIZATION_ARCHITECTURE.md](./0083_[_]_UNIFIED_AUTHORIZATION_ARCHITECTURE.md)
- [Exploration 0079: Authorization Schema DSL Variations](./0079_[_]_AUTH_SCHEMA_DSL_VARIATIONS.md)
