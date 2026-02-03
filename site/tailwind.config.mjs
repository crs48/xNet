/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace']
      },
      colors: {
        surface: 'var(--lp-surface)',
        border: 'var(--lp-border)',
        'code-bg': 'var(--lp-code-bg)'
      },
      borderColor: {
        DEFAULT: 'var(--lp-border)',
        border: 'var(--lp-border)'
      }
    }
  },
  plugins: []
}
