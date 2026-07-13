import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Deployed under xnet.fyi/demos/ on GitHub Pages (deploy-site.yml sets
// VITE_BASE_PATH='/demos/'); defaults to '/' for local dev and previews.
const basePath = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base: basePath,
  plugins: [react()],
  build: {
    target: ['es2022', 'safari16.4', 'chrome102', 'firefox111']
  }
})
