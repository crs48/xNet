import colors from 'tailwindcss/colors'
import typography from '@tailwindcss/typography'

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
        gray: colors.stone,
        indigo: {
          50: '#f0f4e8',
          100: '#e5edda',
          200: '#cbdcb6',
          300: '#b5ce9b',
          400: '#9fbd82',
          500: '#668251',
          600: '#466039',
          700: '#354f35',
          800: '#2b3b29',
          900: '#202c20',
          950: '#151e15'
        },
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
  plugins: [typography]
}
