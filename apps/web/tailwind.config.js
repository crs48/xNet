import baseConfig from '../../packages/ui/tailwind.config.js'

/** @type {import('tailwindcss').Config} */
export default {
  ...baseConfig,
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/views/src/**/*.{ts,tsx}',
    '../../packages/editor/src/**/*.{ts,tsx}',
    '../../packages/react/src/**/*.{ts,tsx}'
  ]
}
