/**
 * WidgetConfigPanel - Auto-generated config editor driven by the widget's
 * configFields, plus the runtime bindings every widget shares (refresh
 * policy and the time-range field).
 *
 * 'property-select' fields offer the properties of the schema the widget's
 * query targets, resolved from the runtime schema registry.
 */

import type { WidgetConfigField } from '../types'
import type { DashboardWidgetInstance, DashboardWidgetRefresh } from '@xnetjs/data'
import { useMemo } from 'react'
import { widgetRegistry, type WidgetRegistry } from '../registry'
import { useDashboardRuntime } from '../runtime/context'

const SYSTEM_FIELDS = ['createdAt', 'updatedAt']

function propertyIdFromIri(propertyIri: string): string {
  const hash = propertyIri.lastIndexOf('#')
  return hash >= 0 ? propertyIri.slice(hash + 1) : propertyIri
}

/** Property keys of the schema the widget's primary query targets. */
export function usePropertyOptions(widget: DashboardWidgetInstance): string[] {
  const { schemas } = useDashboardRuntime()

  return useMemo(() => {
    const query = widget.query?.query
    const schemaId =
      query?.kind === 'node'
        ? query.schemaId
        : query
          ? Object.values(query.queries)[0]?.schemaId
          : undefined
    if (!schemaId) return SYSTEM_FIELDS

    const schema = schemas.find(
      (candidate) => candidate._schemaId === schemaId || candidate.schema['@id'] === schemaId
    )
    if (!schema) return SYSTEM_FIELDS

    return [
      ...schema.schema.properties.map((property) => propertyIdFromIri(property['@id'])),
      ...SYSTEM_FIELDS
    ]
  }, [schemas, widget.query])
}

interface FieldInputProps {
  field: WidgetConfigField
  value: unknown
  propertyOptions: string[]
  onChange: (value: unknown) => void
}

const INPUT_CLASS =
  'w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground'

function CheckboxField({ field, value, onChange }: FieldInputProps): JSX.Element {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 accent-primary"
      checked={Boolean(value ?? field.defaultValue)}
      onChange={(event) => onChange(event.target.checked)}
    />
  )
}

function NumberField({ value, onChange }: FieldInputProps): JSX.Element {
  return (
    <input
      type="number"
      className={INPUT_CLASS}
      value={value === undefined || value === null ? '' : Number(value)}
      onChange={(event) =>
        onChange(event.target.value === '' ? undefined : Number(event.target.value))
      }
    />
  )
}

function SelectField({ field, value, onChange }: FieldInputProps): JSX.Element {
  return (
    <select
      className={INPUT_CLASS}
      value={String(value ?? field.defaultValue ?? '')}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">—</option>
      {(field.options ?? []).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function PropertySelectField({ value, propertyOptions, onChange }: FieldInputProps): JSX.Element {
  return (
    <select
      className={INPUT_CLASS}
      value={String(value ?? '')}
      onChange={(event) => onChange(event.target.value || undefined)}
    >
      <option value="">—</option>
      {propertyOptions.map((property) => (
        <option key={property} value={property}>
          {property}
        </option>
      ))}
    </select>
  )
}

function ColorField({ field, value, onChange }: FieldInputProps): JSX.Element {
  return (
    <input
      type="color"
      className="h-8 w-12 cursor-pointer rounded border border-border"
      value={String(value ?? field.defaultValue ?? '#4f46e5')}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function TextField({ value, onChange }: FieldInputProps): JSX.Element {
  return (
    <input
      type="text"
      className={INPUT_CLASS}
      value={String(value ?? '')}
      onChange={(event) => onChange(event.target.value || undefined)}
    />
  )
}

const FIELD_INPUTS: Record<string, (props: FieldInputProps) => JSX.Element> = {
  checkbox: CheckboxField,
  number: NumberField,
  select: SelectField,
  'property-select': PropertySelectField,
  color: ColorField,
  text: TextField
}

function FieldInput(props: FieldInputProps): JSX.Element {
  const Input = FIELD_INPUTS[props.field.type] ?? TextField
  return <Input {...props} />
}

function parseRefresh(value: string): DashboardWidgetRefresh {
  if (value === 'live' || value === 'on-open') return value
  return { intervalMs: Number(value) }
}

function refreshValue(refresh: DashboardWidgetRefresh | undefined): string {
  if (!refresh || refresh === 'live') return 'live'
  if (refresh === 'on-open') return 'on-open'
  return String(refresh.intervalMs)
}

export interface WidgetConfigPanelProps {
  widget: DashboardWidgetInstance
  registry?: WidgetRegistry
  onChange: (next: Partial<DashboardWidgetInstance>) => void
  onClose: () => void
}

export function WidgetConfigPanel({
  widget,
  registry,
  onChange,
  onClose
}: WidgetConfigPanelProps): JSX.Element {
  const definition = (registry ?? widgetRegistry).get(widget.widgetType)
  const propertyOptions = usePropertyOptions(widget)

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {definition?.name ?? widget.widgetType}
        </h2>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          onClick={onClose}
        >
          Done
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Title
        <FieldInput
          field={{ key: 'title', label: 'Title', type: 'text' }}
          value={widget.config.title}
          propertyOptions={propertyOptions}
          onChange={(value) => onChange({ config: { ...widget.config, title: value } })}
        />
      </label>

      {(definition?.configFields ?? []).map((field) => (
        <label key={field.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
          {field.label}
          <FieldInput
            field={field}
            value={widget.config[field.key]}
            propertyOptions={propertyOptions}
            onChange={(value) => onChange({ config: { ...widget.config, [field.key]: value } })}
          />
          {field.description ? <span className="text-[10px]">{field.description}</span> : null}
        </label>
      ))}

      <hr className="border-border/60" />

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Refresh
        <select
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
          value={refreshValue(widget.refresh)}
          onChange={(event) => onChange({ refresh: parseRefresh(event.target.value) })}
        >
          <option value="live">Live</option>
          <option value="on-open">On open</option>
          <option value="30000">Every 30s</option>
          <option value="300000">Every 5m</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Time range field
        <FieldInput
          field={{ key: 'timeField', label: 'Time range field', type: 'property-select' }}
          value={widget.timeField}
          propertyOptions={propertyOptions}
          onChange={(value) =>
            onChange({ timeField: typeof value === 'string' ? value : undefined })
          }
        />
        <span className="text-[10px]">Bind the dashboard time range to this field</span>
      </label>
    </aside>
  )
}
