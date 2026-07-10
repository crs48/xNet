/**
 * PluginConfigDialog — the generic "Configure" form for first-party plugins.
 *
 * Renders a catalog config spec (`plugins/first-party-catalog.ts`): secret
 * fields as password inputs, options as text inputs. Values persist locally via
 * `plugins/plugin-config.ts` — they never leave this device.
 */

import { CheckCircle, KeyRound, Settings2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FirstPartyPlugin } from '../plugins/first-party-catalog'
import {
  isPluginConfigured,
  readPluginConfig,
  writePluginConfig,
  type PluginConfigValues
} from '../plugins/plugin-config'

const QUIET_BUTTON =
  'flex items-center gap-2 rounded-md border border-hairline bg-surface-0 px-3 py-1.5 text-xs text-ink-1 transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50'

export interface PluginConfigDialogProps {
  pluginId: string
  pluginName: string
  record: FirstPartyPlugin
  onClose: () => void
}

export function PluginConfigDialog({
  pluginId,
  pluginName,
  record,
  onClose
}: PluginConfigDialogProps) {
  const fields = record.config ?? []
  const [values, setValues] = useState<PluginConfigValues>(() => readPluginConfig(pluginId))
  const [saved, setSaved] = useState(false)

  const configured = useMemo(() => isPluginConfigured(fields, values), [fields, values])

  const setValue = (key: string, value: string) => {
    setSaved(false)
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    writePluginConfig(pluginId, values)
    setSaved(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-[440px] flex-col overflow-hidden rounded-md border border-hairline bg-surface-0 shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-medium text-ink-1">
              <Settings2 size={16} strokeWidth={1.5} className="text-ink-3" />
              Configure {pluginName}
            </h2>
            <p className="text-xs text-ink-3">
              Saved on this device only — secrets never sync.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-1"
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {record.configNote && <p className="text-xs text-ink-3">{record.configNote}</p>}

          {fields.length === 0 ? (
            <p className="rounded-md border border-dashed border-hairline px-3 py-4 text-center text-xs text-ink-3">
              Nothing to configure — this plugin works as soon as it's installed.
            </p>
          ) : (
            fields.map((field) => (
              <label key={field.key} className="block space-y-1">
                <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
                  {field.kind === 'secret' && (
                    <KeyRound size={11} strokeWidth={1.5} className="text-ink-3" />
                  )}
                  {field.label}
                  {field.required && <span className="text-ink-3">*</span>}
                </span>
                <input
                  type={field.kind === 'secret' ? 'password' : 'text'}
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValue(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  autoComplete="off"
                  className="w-full rounded-md border border-hairline bg-surface-1 px-3 py-1.5 text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
                />
                {field.help && <span className="block text-[11px] text-ink-3">{field.help}</span>}
              </label>
            ))
          )}
        </div>

        {fields.length > 0 && (
          <div className="flex items-center justify-between gap-2 border-t border-hairline px-6 py-4">
            <span className="text-[11px] text-ink-3">
              {saved ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle size={12} strokeWidth={1.5} />
                  Saved
                </span>
              ) : configured ? (
                'All required fields set'
              ) : (
                'Required fields are marked *'
              )}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={QUIET_BUTTON}>
                Close
              </button>
              <button type="button" onClick={handleSave} className={QUIET_BUTTON}>
                <CheckCircle size={14} strokeWidth={1.5} />
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
