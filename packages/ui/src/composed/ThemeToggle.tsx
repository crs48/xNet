import { Button } from '../primitives/Button'
import { useTheme } from '../theme/ThemeProvider'
import { cn } from '../utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className={cn('h-9 w-9', className)}
      title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {/* Sun icon - shown in dark mode */}
      <svg
        className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="4" strokeWidth="2" />
        <path
          strokeWidth="2"
          d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
        />
      </svg>
      {/* Moon icon - shown in light mode */}
      <svg
        className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeWidth="2" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
      </svg>
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
