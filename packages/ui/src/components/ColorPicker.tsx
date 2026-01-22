import { useState, useRef } from 'react'
import { cn } from '../utils'
import { useClickOutside } from '../hooks/useClickOutside'

export interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  colors?: string[]
  className?: string
}

const DEFAULT_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#64748b', // slate
  '#6b7280', // gray
  '#000000' // black
]

export function ColorPicker({
  value,
  onChange,
  colors = DEFAULT_COLORS,
  className
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useClickOutside(containerRef, () => setIsOpen(false))

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 border border-input rounded-md hover:bg-accent"
      >
        <span
          className="w-4 h-4 rounded-full border border-border"
          style={{ backgroundColor: value }}
        />
        <span className="text-sm text-foreground">{value}</span>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1 p-2 rounded-md border bg-popover shadow-lg">
          <div className="grid grid-cols-5 gap-1">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  onChange(color)
                  setIsOpen(false)
                }}
                className={cn(
                  'w-6 h-6 rounded-md border-2',
                  value === color ? 'border-primary' : 'border-transparent'
                )}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
