/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--color-bg, #1a1a1a)',
          primary: 'var(--color-bg, #1a1a1a)',
          secondary: 'var(--color-bg-secondary, #242424)',
          tertiary: 'var(--color-bg-tertiary, #2a2a2a)'
        },
        text: {
          DEFAULT: 'var(--color-text, #ffffff)',
          secondary: 'var(--color-text-secondary, #a0a0a0)'
        },
        border: 'var(--color-border, #3a3a3a)',
        primary: {
          DEFAULT: 'var(--color-primary, #646cff)',
          hover: 'var(--color-primary-hover, #535bf2)'
        },
        success: 'var(--color-success, #28a745)',
        warning: 'var(--color-warning, #ffc107)',
        danger: 'var(--color-danger, #dc3545)'
      }
    }
  },
  plugins: []
}
