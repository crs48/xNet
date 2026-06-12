import baseConfig from '../../packages/ui/tailwind.config.js'

/** @type {import('tailwindcss').Config} */
export default {
  ...baseConfig,
  content: ['./src/renderer/**/*.{html,tsx,ts}', '../../packages/*/src/**/*.{ts,tsx}'],
  safelist: [
    // DevTools panel uses workspace tokens in dynamically constructed class strings
    { pattern: /^bg-(surface-1|surface-2|background-emphasis|accent)$/ },
    { pattern: /^text-ink-(1|2|3)$/ },
    { pattern: /^border-(hairline|accent-ink)$/ },
    // Hover states
    'hover:text-ink-1',
    'hover:bg-accent',
    // TableView dark mode inside devtools
    'dark:bg-gray-900',
    'dark:border-gray-800',
    'dark:hover:bg-gray-800/50',
    'dark:text-blue-400',
    'dark:hover:bg-blue-900/20'
  ]
}
