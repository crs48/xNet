import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  server: {
    port: parseInt(process.env.HARNESS_PORT || '15200', 10),
    strictPort: true
  },
  optimizeDeps: {
    exclude: ['elkjs']
  }
})
