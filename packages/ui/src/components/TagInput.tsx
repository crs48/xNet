import { useState, useRef, type KeyboardEvent } from 'react'
import { cn } from '../utils'
import { Badge } from '../primitives/Badge'

export interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  className?: string
  maxTags?: number
  allowDuplicates?: boolean
}

export function TagInput({
  value,
  onChange,
  placeholder = 'Add tag...',
  className,
  maxTags,
  allowDuplicates = false
}: TagInputProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag()
    } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
      removeTag(value.length - 1)
    }
  }

  const addTag = () => {
    const tag = input.trim()
    if (!tag) return
    if (maxTags && value.length >= maxTags) return
    if (!allowDuplicates && value.includes(tag)) return

    onChange([...value, tag])
    setInput('')
  }

  const removeTag = (index: number) => {
    const newTags = [...value]
    newTags.splice(index, 1)
    onChange(newTags)
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 min-h-[38px] p-1.5 border border-gray-300 rounded-md bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500',
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag, index) => (
        <Badge
          key={`${tag}-${index}`}
          variant="primary"
          size="sm"
          removable
          onRemove={() => removeTag(index)}
        >
          {tag}
        </Badge>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[100px] outline-none text-sm bg-transparent"
      />
    </div>
  )
}
