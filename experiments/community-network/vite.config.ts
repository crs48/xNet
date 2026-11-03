import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({
  root: 'apps/desktop/ui',
  plugins: [react(), tailwind()],
  build: { outDir: '../../../dist', emptyOutDir: true },
  clearScreen: false
})
