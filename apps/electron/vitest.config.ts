import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 10000,
    server: {
      deps: {
        // better-sqlite3 is a native module that needs to be externalized
        external: ['better-sqlite3', 'electron']
      }
    }
  },
  resolve: {
    alias: {
      '@testing-library/react': resolve(
        __dirname,
        '../../packages/editor/node_modules/@testing-library/react'
      ),
      '@xnetjs/canvas': resolve(__dirname, '../../packages/canvas/src/index.ts'),
      '@xnetjs/data': resolve(__dirname, '../../packages/data/src/index.ts'),
      '@xnetjs/devtools': resolve(__dirname, '../../packages/devtools/src/index.ts'),
      '@xnetjs/identity': resolve(__dirname, '../../packages/identity/src/index.ts'),
      '@xnetjs/react': resolve(__dirname, '../../packages/react/src/index.ts'),
      '@xnetjs/ui': resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@xnetjs/views': resolve(__dirname, '../../packages/views/src/index.ts')
    }
  }
})
