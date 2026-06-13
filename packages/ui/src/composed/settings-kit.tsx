/**
 * Settings control kit (exploration 0179).
 *
 * The workbench-idiom building blocks for settings panels: flat surfaces,
 * hairline separators, a tight 13px type scale, uppercase micro-labels, and
 * the design-system `<Switch>` for booleans. Replaces the older web-app-y
 * `SettingsView` scaffold (rounded cards, text-2xl headings, icon chips).
 *
 * Compose them as:
 *
 *   <SettingsPanel title="Appearance" description="Customize how xNet looks">
 *     <SettingsGroup>
 *       <SettingRow label="Theme" description="…"><ThemeButtons /></SettingRow>
 *       <SettingToggle label="Reduce motion" checked={…} onChange={…} />
 *     </SettingsGroup>
 *   </SettingsPanel>
 */
import type { ReactNode } from 'react'
import { Switch } from '../primitives/Switch'
import { cn } from '../utils'

// ─── Panel ───────────────────────────────────────────────────────────────────

/** A settings panel: a quiet title/description header over its content. */
export function SettingsPanel({
  title,
  description,
  children,
  className
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('max-w-xl space-y-6', className)}>
      <div>
        <h2 className="text-base font-medium text-ink-1">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
      </div>
      {children}
    </div>
  )
}

// ─── Group ───────────────────────────────────────────────────────────────────

/**
 * A labelled cluster of rows. The optional label uses the workbench's
 * uppercase micro-label (matching the Explorer's section headers).
 */
export function SettingsGroup({
  label,
  description,
  children,
  className
}: {
  label?: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-2', className)}>
      {label && (
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-ink-3">{label}</h3>
      )}
      {description && <p className="text-xs text-ink-3">{description}</p>}
      <div>{children}</div>
    </section>
  )
}

// ─── Row ─────────────────────────────────────────────────────────────────────

/**
 * A label/description on the left, a control on the right, separated from the
 * next row by a hairline (no card chrome). The last row drops its border.
 */
export function SettingRow({
  label,
  description,
  children,
  className
}: {
  label: ReactNode
  description?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-b border-hairline py-3 last:border-0',
        className
      )}
    >
      <div className="min-w-0">
        <div className="text-sm text-ink-1">{label}</div>
        {description && <div className="text-xs text-ink-3">{description}</div>}
      </div>
      {children !== undefined && <div className="flex-shrink-0">{children}</div>}
    </div>
  )
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

/** A boolean row backed by the design-system `<Switch>` (no raw checkbox). */
export function SettingToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
  className
}: {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  className?: string
}) {
  return (
    <SettingRow label={label} description={description} className={className}>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </SettingRow>
  )
}
