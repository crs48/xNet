import baseConfig from '../../packages/ui/tailwind.config.js'

/** @type {import('tailwindcss').Config} */
export default {
  ...baseConfig,
  content: ['./src/renderer/**/*.{html,tsx,ts}', '../../packages/*/src/**/*.{ts,tsx}'],
  safelist: [
    // DevTools panel uses zinc colors in dynamically constructed class strings
    { pattern: /^bg-zinc-(800|900|950)$/ },
    { pattern: /^text-zinc-(200|400|500)$/ },
    { pattern: /^border-zinc-(700|800)$/ },
    // Hover states for text colors
    'hover:text-zinc-200',
    'hover:text-white',
    'border-blue-400',
    'text-blue-400',
    // TableView dark mode inside devtools
    'dark:bg-gray-900',
    'dark:border-gray-800',
    'dark:hover:bg-gray-800/50',
    'dark:text-blue-400',
    'dark:hover:bg-blue-900/20'
  ]
}
