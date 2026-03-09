import type { Preview } from '@storybook/react-vite'
import { withThemeByClassName } from '@storybook/addon-themes'
import React from 'react'
import { ThemeProvider, type Theme } from '../packages/ui/src/theme/ThemeProvider'
import '../packages/ui/src/theme/tokens.css'
import '../packages/ui/src/theme/motion.css'
import '../packages/ui/src/theme/accessibility.css'
import '../packages/ui/src/theme/responsive.css'
import '../packages/ui/src/theme/base-ui-animations.css'

const toStoryTheme = (value: unknown): Theme => {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value
  }

  return 'system'
}

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    controls: {
      expanded: true
    },
    a11y: {
      test: 'todo'
    }
  },
  decorators: [
    withThemeByClassName({
      defaultTheme: 'system',
      themes: {
        system: '',
        light: 'light',
        dark: 'dark'
      }
    }),
    (Story, context) => {
      const theme = toStoryTheme(context.globals.theme)

      return (
        <ThemeProvider
          key={theme}
          defaultTheme={theme}
          enableSystem={theme === 'system'}
          storageKey={`xnet-storybook-theme:${theme}`}
        >
          <div className="min-h-screen bg-background p-6 text-foreground">
            <Story />
          </div>
        </ThemeProvider>
      )
    }
  ]
}

export default preview
