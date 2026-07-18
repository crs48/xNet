/**
 * Geo property handler (exploration 0339, Map sub-decision B) — a single
 * `{ lat, lng }` location cell. The editor is a lat/lng input pair; a
 * point commits only when both coordinates are valid (a half-filled
 * point clears rather than storing garbage).
 */

import type { PropertyHandler, PropertyEditorProps } from '../types'
import type { CellGeoPoint } from '@xnetjs/data'
import { isCellGeoPoint } from '@xnetjs/data'
import React, { useEffect, useRef, useState } from 'react'

function parseCoordinate(text: string, max: number): number | null {
  if (text.trim() === '') return null
  const n = Number(text)
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null
}

/**
 * Geo editor component — two number inputs (lat, lng). Local text state
 * so partial typing ("-12.") doesn't round-trip through the numeric
 * draft; the draft updates whenever the pair parses.
 */
function GeoEditor({
  value,
  onChange,
  onBlur,
  autoFocus,
  disabled
}: PropertyEditorProps<CellGeoPoint>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const latRef = useRef<HTMLInputElement>(null)
  const [lat, setLat] = useState(value ? String(value.lat) : '')
  const [lng, setLng] = useState(value ? String(value.lng) : '')

  useEffect(() => {
    if (autoFocus && latRef.current) {
      latRef.current.focus()
      latRef.current.select()
    }
  }, [autoFocus])

  const update = (nextLat: string, nextLng: string) => {
    setLat(nextLat)
    setLng(nextLng)
    const latNum = parseCoordinate(nextLat, 90)
    const lngNum = parseCoordinate(nextLng, 180)
    onChange(latNum !== null && lngNum !== null ? { lat: latNum, lng: lngNum } : null)
  }

  const inputClass =
    'min-w-[70px] flex-1 border-none bg-transparent px-1 py-0.5 text-sm text-gray-900 outline-none dark:text-gray-100'

  return (
    <div
      ref={rootRef}
      className="flex w-full items-center gap-1"
      onBlur={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && rootRef.current?.contains(next)) return
        onBlur?.()
      }}
    >
      <input
        ref={latRef}
        type="text"
        inputMode="decimal"
        placeholder="Lat"
        aria-label="Latitude"
        value={lat}
        onChange={(event) => update(event.target.value, lng)}
        disabled={disabled}
        className={inputClass}
      />
      <span className="text-gray-400">,</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="Lng"
        aria-label="Longitude"
        value={lng}
        onChange={(event) => update(lat, event.target.value)}
        disabled={disabled}
        className={inputClass}
      />
      {!disabled && (lat || lng) && (
        <button
          type="button"
          className="px-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => update('', '')}
          aria-label="Clear location"
        >
          ×
        </button>
      )}
    </div>
  )
}

/** Format a geo point for display ("12.3456, -98.7654"). */
function formatGeoPoint(value: CellGeoPoint | null | undefined): string {
  if (!isCellGeoPoint(value)) return ''
  return `${value.lat}, ${value.lng}`
}

/**
 * Geo property handler
 */
export const geoHandler: PropertyHandler<CellGeoPoint> = {
  type: 'geo',

  render(value) {
    const formatted = formatGeoPoint(value)
    if (!formatted) {
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }
    return <span className="text-gray-900 dark:text-gray-100 tabular-nums">{formatted}</span>
  },

  // North-to-south, then west-to-east — arbitrary but stable
  compare(a, b) {
    const aValid = isCellGeoPoint(a)
    const bValid = isCellGeoPoint(b)
    if (!aValid || !bValid) return Number(bValid) - Number(aValid)
    return b.lat - a.lat || a.lng - b.lng
  },

  filterOperators: ['isEmpty', 'isNotEmpty'],

  applyFilter(value, operator) {
    const isEmpty = !isCellGeoPoint(value)

    switch (operator) {
      case 'isEmpty':
        return isEmpty
      case 'isNotEmpty':
        return !isEmpty
      default:
        return true
    }
  },

  Editor: GeoEditor
}
