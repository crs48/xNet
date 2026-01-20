# @xnet/react

React hooks for xNet.

## Installation

```bash
pnpm add @xnet/react
```

## Usage

```tsx
import { XNetProvider, useDocument, useQuery, useSync } from '@xnet/react'
import { IndexedDBAdapter } from '@xnet/storage'

// Wrap app
function App() {
  return (
    <XNetProvider config={{ storage: new IndexedDBAdapter() }}>
      <MyApp />
    </XNetProvider>
  )
}

// Use hooks
function MyComponent() {
  const { data, loading, update } = useDocument(docId)
  const { data: docs } = useQuery({ type: 'page' })
  const { status, peerCount } = useSync()
}
```

## Hooks

- `useDocument` - Load and edit documents
- `useQuery` - Query documents with pagination
- `useSync` - Sync status
- `usePresence` - Collaborative presence
- `useIdentity` - Current identity
