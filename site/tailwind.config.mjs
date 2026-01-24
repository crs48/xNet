/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace']
      },
      colors: {
        surface: '#12121a',
        border: '#1e1e2e'
      }
    }
  },
  plugins: []
}
