/**
 * DemoSeed - populates a fresh profile with the landing demo workspace
 *
 * Runs once when the store is ready, and only when boot captured the
 * /app?demo=1 signal from the landing-page "Try the app" CTA AND the profile
 * has no user content yet (exploration 0384). See boot/demo-seed.ts for the
 * guard; a returning user's workspace is never touched.
 */
import { useXNet } from '@xnetjs/react'
import { useEffect, useRef } from 'react'
import { demoSeedPending, maybeRunDemoSeed } from '../boot/demo-seed'

export function DemoSeed() {
  const { nodeStore, nodeStoreReady } = useXNet()
  const ranRef = useRef(false)

  useEffect(() => {
    if (!nodeStore || !nodeStoreReady || ranRef.current) return
    ranRef.current = true
    if (!demoSeedPending()) return

    maybeRunDemoSeed(nodeStore)
      .then((outcome) => {
        if (outcome === 'seeded') {
          console.info('[demo-seed] populated the landing demo workspace')
        } else if (outcome === 'skipped-existing-data') {
          console.info('[demo-seed] skipped: profile already has user content')
        }
      })
      .catch((err) => {
        // The demo is garnish — a failed seed must never break boot.
        console.warn('[demo-seed] failed:', err)
      })
  }, [nodeStore, nodeStoreReady])

  // This component doesn't render anything
  return null
}
