/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic color aliases using CSS variables defined in editor.css.
        // These use Tailwind palette RGB values and adapt to dark mode automatically.
        // Host apps can override by setting the --editor-* variables.
        background: 'rgb(var(--editor-background) / <alpha-value>)',
        foreground: 'rgb(var(--editor-foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--editor-primary) / <alpha-value>)',
          foreground: 'rgb(var(--editor-primary-foreground) / <alpha-value>)'
        },
        secondary: {
          DEFAULT: 'rgb(var(--editor-secondary) / <alpha-value>)',
          foreground: 'rgb(var(--editor-secondary-foreground) / <alpha-value>)'
        },
        muted: {
          DEFAULT: 'rgb(var(--editor-muted) / <alpha-value>)',
          foreground: 'rgb(var(--editor-muted-foreground) / <alpha-value>)'
        },
        accent: {
          DEFAULT: 'rgb(var(--editor-accent) / <alpha-value>)',
          foreground: 'rgb(var(--editor-accent-foreground) / <alpha-value>)'
        },
        border: 'rgb(var(--editor-border) / <alpha-value>)',
        success: 'rgb(var(--editor-success) / <alpha-value>)',
        warning: 'rgb(var(--editor-warning) / <alpha-value>)',
        destructive: {
          DEFAULT: 'rgb(var(--editor-destructive) / <alpha-value>)',
          foreground: 'rgb(var(--editor-destructive-foreground) / <alpha-value>)'
        }
      },

      // Editor-specific animations.
      //
      // The editor is a standalone, separately-themed package (--editor-*), so
      // it keeps a small local motion set rather than depending on @xnetjs/ui's
      // internals. Values intentionally mirror the canonical vocabulary (see
      // docs/MOTION.md): enter = 150ms (normal) ease-out, exit = 100ms (fast)
      // ease-in. The slash/mention/link floating menus are custom-positioned
      // (not Base UI popups), so they can't reuse `.menu-popup` directly.
      keyframes: {
        'syntax-fade-in': {
          from: { opacity: '0' },
          to: { opacity: '0.5' }
        },
        'menu-appear': {
          from: { opacity: '0', transform: 'translateY(-4px) scale(0.95)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' }
        },
        'menu-disappear': {
          from: { opacity: '1', transform: 'translateY(0) scale(1)' },
          to: { opacity: '0', transform: 'translateY(-4px) scale(0.95)' }
        }
      },

      animation: {
        'syntax-fade-in': 'syntax-fade-in 150ms ease-out forwards',
        // enter: slower + decelerate (ease-out)
        'menu-appear': 'menu-appear 150ms ease-out forwards',
        // exit: faster + accelerate away (ease-in) — the two laws
        'menu-disappear': 'menu-disappear 100ms ease-in forwards'
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
}
