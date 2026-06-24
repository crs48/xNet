import { AccessibleTextarea } from '@xnetjs/ui'

// A11y-enhanced textarea: a REQUIRED `label` is wired to the field, with
// optional `hint`, `error`, and `required` affordances.

export const Default = () => (
  <div className="max-w-xl space-y-4">
    <AccessibleTextarea
      label="Release notes"
      hint="Visible in the changelog drawer."
      defaultValue="Embedded Storybook is now available from Electron and Web. Performance panel runs in canvas mode."
      rows={4}
    />
  </div>
)

export const Required = () => (
  <div className="max-w-xl space-y-4">
    <AccessibleTextarea
      label="Pull request summary"
      required
      hint="Markdown is supported."
      placeholder="Describe what changed and why..."
      rows={4}
    />
  </div>
)

export const Error = () => (
  <div className="max-w-xl space-y-4">
    <AccessibleTextarea
      label="Incident postmortem"
      required
      defaultValue="tbd"
      error="A postmortem must be at least 50 characters."
      rows={4}
    />
  </div>
)
