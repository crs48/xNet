/**
 * DemoDataExpiredScreen - Full-screen message when demo data is evicted
 *
 * Shown when the user's demo data has been cleaned up after inactivity.
 * Provides options to start fresh or download the desktop app.
 */

/**
 * DemoDataExpiredScreen component
 *
 * @example
 * ```tsx
 * if (dataExpired) {
 *   return <DemoDataExpiredScreen />
 * }
 * ```
 */
export function DemoDataExpiredScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-background">
      <div className="text-6xl mb-6">&#128336;</div>
      <h1 className="text-2xl font-bold mb-3 text-foreground">Your demo data has expired</h1>
      <p className="text-muted-foreground max-w-md mb-6">
        Demo data is automatically removed after 24 hours of inactivity to keep the demo hub clean.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Start Fresh
        </button>
        <a
          href="https://xnet.fyi/download"
          className="px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors text-foreground no-underline"
        >
          Download Desktop App
        </a>
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        The desktop app stores data permanently on your device.
      </p>
    </div>
  )
}
