import { SensitiveContent } from '@xnetjs/ui'

// The render gate for sensitive content. `visibility` is computed elsewhere
// (from labels + the viewer's dial); this component only renders the veil:
// show | warn | blur (click-to-reveal) | hide.

const photo = (
  <div className="space-y-2">
    <div className="h-32 w-full rounded-md bg-gradient-to-br from-rose-400 via-fuchsia-500 to-indigo-500" />
    <p className="text-sm text-foreground">Beach trip — uploaded by @mara</p>
  </div>
)

// Obscured: blurred with a click-to-reveal veil.
export const Blurred = () => (
  <div className="max-w-xl">
    <SensitiveContent
      visibility="blur"
      labels={['nudity']}
      attribution="via did:key:zAB…labeler"
      reasons={['Detected by a subscribed media labeler', 'Matches your "blur adult content" dial']}
    >
      {photo}
    </SensitiveContent>
  </div>
)

// Revealed: visibility=show passes children through untouched.
export const Revealed = () => (
  <div className="max-w-xl">
    <SensitiveContent visibility="show">{photo}</SensitiveContent>
  </div>
)

// Warn: an inline notice above the content, which stays visible.
export const Warn = () => (
  <div className="max-w-xl">
    <SensitiveContent visibility="warn" labels={['graphic-media']} attribution="via @moderation">
      {photo}
    </SensitiveContent>
  </div>
)
