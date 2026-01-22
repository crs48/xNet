import { useState, useRef } from 'react'
import { cn } from '../utils'
import { Input } from '../primitives/Input'
import { useClickOutside } from '../hooks/useClickOutside'

export interface DatePickerProps {
  value?: Date | null
  onChange: (date: Date | null) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  min?: Date
  max?: Date
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  className,
  disabled = false,
  min,
  max
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewDate, setViewDate] = useState(value ?? new Date())
  const containerRef = useRef<HTMLDivElement>(null)

  useClickOutside(containerRef, () => setIsOpen(false))

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getDaysInMonth = (year: number, month: number): number => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (year: number, month: number): number => {
    return new Date(year, month, 1).getDay()
  }

  const isDateDisabled = (date: Date): boolean => {
    if (min && date < min) return true
    if (max && date > max) return true
    return false
  }

  const handleDateSelect = (day: number) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day)
    if (!isDateDisabled(newDate)) {
      onChange(newDate)
      setIsOpen(false)
    }
  }

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
  }

  const renderCalendar = () => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const daysInMonth = getDaysInMonth(year, month)
    const firstDay = getFirstDayOfMonth(year, month)
    const days: (number | null)[] = []

    for (let i = 0; i < firstDay; i++) {
      days.push(null)
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }

    return (
      <div className="grid grid-cols-7 gap-1">
        {DAYS.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
            {day}
          </div>
        ))}
        {days.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} />
          }

          const date = new Date(year, month, day)
          const isSelected = value && date.toDateString() === value.toDateString()
          const isToday = date.toDateString() === new Date().toDateString()
          const isDisabled = isDateDisabled(date)

          return (
            <button
              key={day}
              type="button"
              onClick={() => handleDateSelect(day)}
              disabled={isDisabled}
              className={cn(
                'p-1 text-sm rounded-md',
                isSelected && 'bg-primary text-primary-foreground',
                !isSelected && isToday && 'border border-primary',
                !isSelected && !isToday && 'hover:bg-accent',
                isDisabled && 'text-muted-foreground/50 cursor-not-allowed'
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Input
        value={value ? formatDate(value) : ''}
        placeholder={placeholder}
        readOnly
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className="cursor-pointer"
      />
      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={handlePrevMonth} className="p-1 hover:bg-accent rounded">
              &lt;
            </button>
            <span className="font-medium text-foreground">
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
            <button type="button" onClick={handleNextMonth} className="p-1 hover:bg-accent rounded">
              &gt;
            </button>
          </div>
          {renderCalendar()}
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setIsOpen(false)
              }}
              className="mt-2 w-full text-sm text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
