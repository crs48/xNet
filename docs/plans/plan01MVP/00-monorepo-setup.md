# 00: Monorepo Setup

> Initialize the monorepo structure and tooling

## Directory Structure

Create this structure:

```
xnet/
├── package.json              # Root package.json (workspace)
├── pnpm-workspace.yaml       # pnpm workspace config
├── tsconfig.json             # Base TypeScript config
├── tsconfig.build.json       # Build-specific config
├── vitest.config.ts          # Vitest configuration
├── .eslintrc.js              # ESLint config
├── .prettierrc               # Prettier config
├── .github/
│   └── workflows/
│       ├── ci.yml            # CI pipeline
│       └── release.yml       # Release pipeline
├── packages/
│   ├── core/                 # @xnet/core
│   ├── crypto/               # @xnet/crypto
│   ├── identity/             # @xnet/identity
│   ├── storage/              # @xnet/storage
│   ├── data/                 # @xnet/data
│   ├── network/              # @xnet/network
│   ├── query/                # @xnet/query
│   ├── vectors/              # @xnet/vectors
│   ├── react/                # @xnet/react
│   └── sdk/                  # @xnet/sdk
├── apps/
│   ├── electron/             # Electron macOS
│   ├── expo/                 # Expo iOS
│   └── web/                  # TanStack PWA
└── docs/
    └── planStep01MVP/        # This documentation
```

## Implementation Steps

### Step 1: Root package.json

```json
{
  "name": "xnet",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "build": "turbo run build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint packages apps --ext .ts,.tsx",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "eslint": "^8.57.0",
    "prettier": "^3.2.0",
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@vitest/coverage-v8": "^1.6.0"
  },
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### Step 2: pnpm-workspace.yaml

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

### Step 3: turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "inputs": ["src/**", "test/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

### Step 4: tsconfig.json (base)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "exclude": ["node_modules", "dist"]
}
```

### Step 5: vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts']
    }
  }
})
```

### Step 6: Package Template

Each package follows this structure:

```
packages/crypto/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Public exports
│   ├── hashing.ts        # Implementation
│   └── hashing.test.ts   # Tests (colocated)
└── README.md
```

Package package.json template:

```json
{
  "name": "@xnet/crypto",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.4.0"
  }
}
```

Package tsconfig.json:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

### Step 7: GitHub CI (.github/workflows/ci.yml)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test:coverage
      - uses: codecov/codecov-action@v4
        with:
          files: ./coverage/coverage-final.json
```

### Step 8: Create All Package Directories

```bash
# Create package directories
mkdir -p packages/{core,crypto,identity,storage,data,network,query,vectors,react,sdk}/src

# Create app directories
mkdir -p apps/{electron,expo,web}
```

## Validation Checklist

- [ ] `pnpm install` completes without errors
- [ ] `pnpm build` builds all packages
- [ ] `pnpm test` runs (even with no tests yet)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] Each package can import from its dependencies

## Next Step

Proceed to [01-phase0-foundations.md](./01-phase0-foundations.md)
