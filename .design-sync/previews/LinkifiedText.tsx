import { LinkifiedText } from '@xnetjs/ui'

// Renders plain user text with URLs and email addresses auto-detected as
// links at render time (the stored value is never rewritten). Phone detection
// is opt-in via `detectPhones` (lazy-loads metadata).

export const Default = () => (
  <div className="max-w-xl rounded-lg border border-border bg-background-subtle p-3 text-sm text-foreground">
    <LinkifiedText value="Ship notes are up at https://xnet.app/changelog — ping chris@xnet.app if the preview build looks off, and the spec lives at https://docs.xnet.app/protocol/v2." />
  </div>
)

export const WithPhones = () => (
  <div className="max-w-xl rounded-lg border border-border bg-background-subtle p-3 text-sm text-foreground">
    <LinkifiedText
      detectPhones
      value="On-call rotation: reach the SRE desk at +1 (415) 555-0142 or page ops@xnet.app. Runbook: https://docs.xnet.app/oncall."
    />
  </div>
)
