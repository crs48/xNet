import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Deployed under xnet.fyi/play/ on GitHub Pages (deploy-site.yml sets
// VITE_BASE_PATH='/play/'; the site's /demos page frames it). Defaults to
// '/' for local dev.
const basePath = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base: basePath,
  plugins: [react()],
  build: {
    target: ['es2022', 'safari16.4', 'chrome102', 'firefox111']
  },
  // The devtools pull in workers (canvas layout) that use dynamic imports —
  // multi-chunk workers require the ES format (same as apps/web).
  worker: {
    format: 'es'
  }
})
