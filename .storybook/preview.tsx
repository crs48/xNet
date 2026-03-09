import type { Preview } from '@storybook/react-vite'
import { ThemeProvider } from '../packages/ui/src/theme/ThemeProvider'
import '../packages/ui/src/theme/tokens.css'
import '../packages/ui/src/theme/motion.css'
import '../packages/ui/src/theme/accessibility.css'
import '../packages/ui/src/theme/responsive.css'
import '../packages/ui/src/theme/base-ui-animations.css'

const preview: Preview = {
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
    (Story) => (
      <ThemeProvider defaultTheme="system" storageKey="xnet-storybook-theme">
        <div className="min-h-screen bg-background p-6 text-foreground">
          <Story />
        </div>
      </ThemeProvider>
    )
  ]
}

export default preview
