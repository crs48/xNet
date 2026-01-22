# 01 - Package Setup

> Create `@xnet/devtools` with tree-shaking, dev-only imports, and proper dependency graph

## Overview

The devtools package must satisfy two opposing requirements:

1. **In development**: Full-featured debugging UI with all panels
2. **In production**: Zero bytes added to the bundle

We achieve this with conditional exports, `sideEffects: false`, and a provider that no-ops in production.

## Package Configuration

### package.json

```json
{
  "name": "@xnet/devtools",
  "version": "0.1.0",
  "description": "Protocol-level devtools for xNet applications",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "development": "./src/index.dev.ts",
      "default": "./src/index.ts"
    },
    "./styles": "./src/styles.css"
  },
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0",
    "yjs": ">=13.0.0",
    "@xnet/data": "workspace:*",
    "@xnet/sync": "workspace:*",
    "@xnet/react": "workspace:*"
  },
  "dependencies": {
    "@xnet/views": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "vite": "^5.0.0"
  }
}
```

### Why Two Entry Points

```
src/index.ts      → Production: exports no-op DevToolsProvider + useDevTools stub
src/index.dev.ts  → Development: exports full DevToolsProvider with all panels
```

The bundler (Vite/webpack) uses the `"development"` condition in `exports` to select the right entry. In production builds, the no-op provider is a pass-through that renders only `children`.

## Production Entry (src/index.ts)

```typescript
// src/index.ts - Production: zero-cost provider
import type { ReactNode } from 'react'

export interface DevToolsProviderProps {
  children: ReactNode
  defaultOpen?: boolean
  position?: 'bottom' | 'right' | 'floating'
  height?: number
  maxEvents?: number
}

/**
 * No-op in production. Renders children unchanged.
 * In development builds, this is replaced by the full implementation.
 */
export function DevToolsProvider({ children }: DevToolsProviderProps) {
  return children
}

export function useDevTools() {
  return {
    isOpen: false,
    toggle: () => {},
    eventBus: null
  }
}

// Re-export types for consumers who type-check against devtools
export type { DevToolsEvent, DevToolsEventType } from './core/types'
```

## Development Entry (src/index.dev.ts)

```typescript
// src/index.dev.ts - Development: full implementation
export { DevToolsProvider } from './provider/DevToolsProvider'
export { useDevTools } from './provider/useDevTools'
export type { DevToolsProviderProps } from './provider/DevToolsProvider'
export type { DevToolsEvent, DevToolsEventType } from './core/types'
```

## Directory Structure

```
packages/devtools/
├── src/
│   ├── index.ts                  # Production no-op
│   ├── index.dev.ts              # Development full
│   │
│   ├── core/
│   │   ├── event-bus.ts          # Ring buffer event bus
│   │   ├── types.ts              # All event type definitions
│   │   └── constants.ts          # Defaults
│   │
│   ├── instrumentation/
│   │   ├── store.ts              # NodeStore listener
│   │   ├── sync.ts               # SyncProvider listener
│   │   ├── yjs.ts                # Y.Doc observer
│   │   ├── query.ts              # Hook tracker
│   │   └── telemetry.ts          # Telemetry node watcher
│   │
│   ├── provider/
│   │   ├── DevToolsProvider.tsx  # Full provider with instrumentation
│   │   ├── DevToolsContext.ts    # Context definition
│   │   └── useDevTools.ts        # Consumer hook
│   │
│   ├── panels/
│   │   ├── Shell.tsx             # Tab layout container
│   │   ├── NodeExplorer/
│   │   │   ├── NodeExplorer.tsx
│   │   │   └── useNodeExplorer.ts
│   │   ├── ChangeTimeline/
│   │   │   ├── ChangeTimeline.tsx
│   │   │   ├── TimelineEntry.tsx
│   │   │   └── useChangeTimeline.ts
│   │   ├── SyncMonitor/
│   │   │   ├── SyncMonitor.tsx
│   │   │   ├── PeerList.tsx
│   │   │   └── useSyncMonitor.ts
│   │   ├── YjsInspector/
│   │   │   ├── YjsInspector.tsx
│   │   │   ├── DocTree.tsx
│   │   │   └── useYjsInspector.ts
│   │   ├── QueryDebugger/
│   │   │   ├── QueryDebugger.tsx
│   │   │   └── useQueryDebugger.ts
│   │   ├── TelemetryPanel/
│   │   │   ├── TelemetryPanel.tsx
│   │   │   ├── SecurityEvents.tsx
│   │   │   ├── PeerScores.tsx
│   │   │   └── useTelemetryPanel.ts
│   │   └── SchemaRegistry/
│   │       ├── SchemaRegistry.tsx
│   │       └── useSchemaRegistry.ts
│   │
│   └── utils/
│       ├── formatters.ts         # DID/CID truncation, relative time
│       ├── performance.ts        # now(), measure()
│       └── platform.ts           # isElectron, isExpo, isWeb
│
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## TypeScript Configuration

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../data" },
    { "path": "../sync" },
    { "path": "../react" },
    { "path": "../views" }
  ]
}
```

## Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'index.dev': resolve(__dirname, 'src/index.dev.ts')
      },
      formats: ['es']
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'yjs',
        '@xnet/data',
        '@xnet/sync',
        '@xnet/react',
        '@xnet/views'
      ]
    }
  }
})
```

## Consumer Integration

### Basic Usage (auto tree-shakes in production)

```typescript
// App.tsx
import { DevToolsProvider } from '@xnet/devtools'

function App() {
  return (
    <NodeStoreProvider store={store}>
      <DevToolsProvider>
        <Router />
      </DevToolsProvider>
    </NodeStoreProvider>
  )
}
```

### Conditional Import (explicit control)

```typescript
// App.tsx
const DevTools = lazy(() =>
  process.env.NODE_ENV === 'development'
    ? import('@xnet/devtools').then((m) => ({ default: m.DevToolsProvider }))
    : Promise.resolve({ default: ({ children }) => children })
)
```

### Vite Configuration in Consumer

```typescript
// vite.config.ts (in apps/web or apps/electron)
export default defineConfig({
  resolve: {
    conditions:
      process.env.NODE_ENV === 'development'
        ? ['development', 'import', 'module']
        : ['import', 'module']
  }
})
```

## Tests

```typescript
// src/index.test.ts
import { describe, it, expect } from 'vitest'
import { DevToolsProvider, useDevTools } from './index'

describe('Production exports', () => {
  it('DevToolsProvider passes through children', () => {
    const result = DevToolsProvider({ children: 'hello' })
    expect(result).toBe('hello')
  })

  it('useDevTools returns no-op', () => {
    const dt = useDevTools()
    expect(dt.isOpen).toBe(false)
    expect(dt.toggle).toBeInstanceOf(Function)
  })
})
```

## Checklist

- [ ] Create package directory structure
- [ ] Write package.json with conditional exports
- [ ] Write tsconfig.json with project references
- [ ] Write production index.ts (no-op provider)
- [ ] Write development index.dev.ts (re-exports)
- [ ] Write vite.config.ts for library build
- [ ] Write basic tests for production exports
- [ ] Add to workspace pnpm-workspace.yaml
- [ ] Verify `pnpm build` succeeds
- [ ] Verify production bundle excludes devtools code

---

[Next: Event Bus](./02-event-bus.md)
