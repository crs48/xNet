import { resolve } from 'node:path'
import { defineConfig } from 'vite'
export default defineConfig({
  root: resolve(__dirname, 'src/spatial'),
  build: { outDir: resolve(__dirname, 'out/spatial'), emptyOutDir: true, target: 'es2022' },
  server: { host: '127.0.0.1', port: 5189, strictPort: true }
})
