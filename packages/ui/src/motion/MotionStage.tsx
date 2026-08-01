/**
 * <MotionStage> — the only sanctioned entry point to Motion in xNet.
 *
 * The CSS vocabulary in theme/motion.css covers ~95% of animation here. The
 * remainder — drag-coupled motion and FLIP layout animation — is what this
 * boundary exists for (exploration 0422; style guide in docs/MOTION.md).
 *
 *   <MotionStage>
 *     {tabs.map((t) => <m.div key={t.id} layout><Tab {...t} /></m.div>)}
 *   </MotionStage>
 *
 * Why a boundary at all: the full `motion/react` barrel is ~34KB, and `layout`
 * specifically needs the `domMax` feature bundle (+25KB) — `domAnimation`
 * (+15KB) does NOT include it. Loading that eagerly would put ~30KB on the
 * default path of every surface that imports @xnetjs/ui, to animate two
 * interactions. So the features are fetched via a dynamic import() and land in
 * their own chunk; consumers statically import only `m` from 'motion/react-m',
 * the ~4.6KB shell, which renders plain DOM until a provider shows up.
 *
 * scripts/check-motion-vocab.mjs fails CI on a static `motion/react` import
 * anywhere in packages/ or apps/, which is what keeps that promise true. The
 * import() expression below is deliberately not matched by it.
 */
import * as React from 'react'

/**
 * Loads LazyMotion + the domMax feature bundle. Split into its own lazy
 * component so everything it pulls in lands in a separate chunk — importing
 * `LazyMotion` at module scope here would defeat the entire boundary.
 */
const MotionFeatures = React.lazy(async () => {
  // domMax is what carries `layout` / `layoutId` (FLIP). Anything less and the
  // two call sites this exists for silently stop animating.
  const { LazyMotion, domMax } = await import('motion/react')
  return {
    default: ({
      children,
      reducedMotion
    }: {
      children: React.ReactNode
      reducedMotion: 'user' | 'never'
    }) => (
      // `strict` throws if a full `motion.*` component is rendered inside,
      // which is the runtime half of the CI guard: it catches a bypass that
      // reached the tree some other way.
      <LazyMotion features={domMax} strict reducedMotion={reducedMotion}>
        {children}
      </LazyMotion>
    )
  }
})

export interface MotionStageProps {
  /** The subtree containing `m.*` components. */
  children: React.ReactNode
  /**
   * Honour `prefers-reduced-motion` (default) or opt out. Motion applies this
   * to its own inline transforms, which the global CSS collapse in motion.css
   * cannot reach — so `'user'` is the accessible default and should stay.
   */
  reducedMotion?: 'user' | 'never'
}

/**
 * Wraps a subtree that needs drag-coupled or FLIP motion.
 *
 * Until the feature chunk resolves, children render **unanimated rather than
 * blank** — hence `fallback={children}` rather than a spinner. This is a
 * deliberate exception to the repo rule against indistinguishable fallbacks
 * (AGENTS.md): the degraded state here is precisely the behaviour that shipped
 * before this component existed — an instant snap — and the alternative is
 * flashing empty space where a tab bar should be. The chunk is requested on
 * first interaction and stays warm for the session, so only the very first
 * drag can land early enough to see it.
 */
export function MotionStage({
  children,
  reducedMotion = 'user'
}: MotionStageProps): React.ReactElement {
  return (
    <React.Suspense fallback={<>{children}</>}>
      <MotionFeatures reducedMotion={reducedMotion}>{children}</MotionFeatures>
    </React.Suspense>
  )
}
