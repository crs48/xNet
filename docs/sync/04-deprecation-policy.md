# Deprecation Policy

How xNet handles deprecation of features, protocol versions, and APIs.

## Principles

1. **No surprise breakage** - Deprecated features work for at least 6 months
2. **Clear communication** - Deprecation warnings in logs and DevTools
3. **Migration path** - Every deprecation includes upgrade instructions
4. **Gradual sunset** - Features are warned → discouraged → removed

## Deprecation Lifecycle

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Active    │───>│  Deprecated │───>│  Discouraged│───>│   Removed   │
│             │    │  (warning)  │    │   (error)   │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                   │                  │                  │
                   v1.x.0             v2.0.0             v3.0.0
                   │                  │                  │
                   └── 6+ months ─────┴── 6+ months ────>│
```

### Stages

| Stage           | Behavior                         | Timeline     |
| --------------- | -------------------------------- | ------------ |
| **Active**      | Feature works normally           | Indefinite   |
| **Deprecated**  | Works, warning logged on use     | Min 6 months |
| **Discouraged** | Works, error logged (not thrown) | Min 3 months |
| **Removed**     | Feature does not exist           | Permanent    |

## Version Support Windows

### Protocol Versions

| Protocol    | Released    | Deprecated | Removed |
| ----------- | ----------- | ---------- | ------- |
| v0 (legacy) | Pre-release | v1.0.0     | v2.0.0  |
| v1          | v1.0.0      | TBD        | TBD     |

### Package Versions

We support the current major version and one prior:

| Package Version | Support Status | End of Support       |
| --------------- | -------------- | -------------------- |
| 2.x.x           | Active         | -                    |
| 1.x.x           | Maintenance    | 6 months after 3.0.0 |
| 0.x.x           | Unsupported    | -                    |

**Maintenance mode** means:

- Security fixes only
- No new features
- No bug fixes (unless critical)

## Deprecation Warnings

### Console Output

```
[xnet:deprecation] Feature 'change_v1' is deprecated.
  Deprecated in: v1.1.0
  Will be removed in: v2.0.0
  Deadline: 2025-06-01
  Migration: Use 'change_v2' format instead.
  Docs: https://xnet.fyi/docs/sync/migrations#change-v2
```

### DevTools Panel

The Version DevTools panel shows:

- Active deprecation warnings
- Days until removal deadline
- Link to migration documentation

### Programmatic Access

```typescript
import { checkDeprecations, type DeprecationWarning } from '@xnetjs/sync'

const warnings: DeprecationWarning[] = checkDeprecations({
  protocolVersion: 0,
  features: ['change_v1', 'unsigned_changes']
})

warnings.forEach((warning) => {
  console.warn(`${warning.feature}: ${warning.message}`)
  console.warn(`  Deadline: ${warning.deadline}`)
  console.warn(`  Use instead: ${warning.replacement}`)
})
```

## Current Deprecations

### Protocol Features

| Feature            | Status      | Deadline   | Replacement    |
| ------------------ | ----------- | ---------- | -------------- |
| `change_v1`        | Deprecated  | 2025-06-01 | `change_v2`    |
| `unsigned_changes` | Deprecated  | 2025-06-01 | Signed changes |
| `protocol_v0`      | Discouraged | 2025-03-01 | Protocol v1    |

### APIs

| API                             | Status     | Deadline   | Replacement         |
| ------------------------------- | ---------- | ---------- | ------------------- |
| `store.get()` without version   | Active     | -          | -                   |
| `SyncProvider` without features | Deprecated | 2025-06-01 | Pass features array |

## Announcing Deprecations

### Changelog

Deprecations are announced in the CHANGELOG.md:

```markdown
## [1.1.0] - 2024-12-01

### Deprecated

- `change_v1` format - Use `change_v2` instead. Will be removed in v2.0.0.
- Unsigned changes - All changes should now be signed. Will be removed in v2.0.0.
```

### Migration Guides

Every deprecation includes:

1. **What's changing** - Clear description
2. **Why it's changing** - Rationale
3. **How to migrate** - Step-by-step instructions
4. **Timeline** - When action is needed

### GitHub Issues

Major deprecations get a tracking issue with:

- Label: `deprecation`
- Milestone: Target removal version
- Description: Migration guide link

## Handling Deprecation Errors

### During Development

```typescript
import { setDeprecationHandler } from '@xnetjs/sync'

// Throw on deprecation (catch issues early)
setDeprecationHandler('throw')

// Or: Log and continue (default)
setDeprecationHandler('warn')

// Or: Silence (not recommended)
setDeprecationHandler('silent')
```

### In Production

```typescript
import { checkDeprecations } from '@xnetjs/sync'

// Check on app startup
const warnings = checkDeprecations(currentConfig)

if (warnings.length > 0) {
  // Report to monitoring
  analytics.track('deprecation_warnings', {
    warnings: warnings.map((w) => w.feature)
  })

  // Check for urgent deadlines
  const urgent = warnings.filter(
    (w) => new Date(w.deadline) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  )

  if (urgent.length > 0) {
    notifyDevelopers(urgent)
  }
}
```

## Exception Policy

### Emergency Deprecations

In rare cases (security vulnerabilities, critical bugs), we may:

- Shorten the deprecation window
- Skip the "discouraged" stage
- Remove features immediately

Emergency deprecations will:

- Be announced on all channels (GitHub, GitHub Discussions, Twitter)
- Include clear security advisory
- Provide immediate mitigation steps

### Extension Requests

If you need more time to migrate:

1. Open a GitHub issue with label `deprecation-extension`
2. Explain your use case and timeline
3. We'll work with you on a transition plan

We're committed to not breaking production systems without notice.

## CI Integration

### Fail on Deprecation

```yaml
# .github/workflows/deprecation-check.yml
name: Deprecation Check

on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm xnet doctor --fail-on-deprecation
```

### Pre-commit Hook

```bash
# In package.json scripts
"pre-commit": "xnet doctor --fail-on-deprecation"
```

## Communicating with Users

### In-App Notification

For end-user-facing deprecations:

```typescript
import { useDeprecationNotice } from '@xnetjs/react'

function App() {
  const notice = useDeprecationNotice()

  if (notice) {
    return (
      <Banner type="warning">
        {notice.message}
        <Link to={notice.docsUrl}>Learn more</Link>
      </Banner>
    )
  }

  return <MainApp />
}
```

### Email Notifications

For hosted Hub users:

- 90 days before deadline: Informational email
- 30 days before deadline: Warning email
- 7 days before deadline: Urgent action required

## See Also

- [Migration Guide](./01-migration-guide.md) - How to migrate
- [Version Compatibility](./02-version-compatibility.md) - What works with what
- [Recovery Procedures](./05-recovery-procedures.md) - When things go wrong
