/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic colors using CSS variables for theming
        bg: {
          DEFAULT: 'var(--color-bg, #ffffff)',
          secondary: 'var(--color-bg-secondary, #f8f9fa)',
          tertiary: 'var(--color-bg-tertiary, #f1f3f5)'
        },
        text: {
          DEFAULT: 'var(--color-text, #1a1a1a)',
          secondary: 'var(--color-text-secondary, #6c757d)'
        },
        border: 'var(--color-border, #e5e5e5)',
        primary: {
          DEFAULT: 'var(--color-primary, #0066cc)',
          hover: 'var(--color-primary-hover, #0052a3)'
        },
        success: 'var(--color-success, #28a745)',
        warning: 'var(--color-warning, #ffc107)',
        danger: 'var(--color-danger, #dc3545)'
      }
    }
  },
  plugins: []
}
