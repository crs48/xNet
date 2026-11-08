import { fileURLToPath } from 'node:url'
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({
  root: 'apps/desktop/ui',
  resolve: { alias: { '@': fileURLToPath(new URL('./apps/desktop/ui', import.meta.url)) } },
  plugins: [react(), tailwind()],
  build: { outDir: '../../../dist', emptyOutDir: true },
  clearScreen: false
})
