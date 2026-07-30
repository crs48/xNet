import { describe, expect, it } from 'vitest'
import { geo, isGeoPoint } from './geo'

describe('geo() property (0339, Map sub-decision B)', () => {
  describe('isGeoPoint', () => {
    it('accepts in-range coordinates', () => {
      expect(isGeoPoint({ lat: 52.52, lng: 13.405 })).toBe(true)
      expect(isGeoPoint({ lat: -90, lng: 180 })).toBe(true)
      expect(isGeoPoint({ lat: 0, lng: 0 })).toBe(true)
    })

    it('rejects out-of-range, non-finite, and malformed values', () => {
      expect(isGeoPoint({ lat: 90.1, lng: 0 })).toBe(false)
      expect(isGeoPoint({ lat: 0, lng: -180.5 })).toBe(false)
      expect(isGeoPoint({ lat: NaN, lng: 0 })).toBe(false)
      expect(isGeoPoint({ lat: '52', lng: 13 })).toBe(false)
      expect(isGeoPoint({ lat: 52 })).toBe(false)
      expect(isGeoPoint(null)).toBe(false)
      expect(isGeoPoint('52, 13')).toBe(false)
    })
  })

  describe('validate', () => {
    it('validates points and honors required', () => {
      const optional = geo()
      expect(optional.validate({ lat: 1, lng: 2 })).toBe(true)
      expect(optional.validate(null)).toBe(true)
      expect(optional.validate({ lat: 91, lng: 0 })).toBe(false)

      const required = geo({ required: true })
      expect(required.validate(null)).toBe(false)
      expect(required.definition.required).toBe(true)
    })
  })

  describe('coerce', () => {
    it('passes valid points through and strips extra keys', () => {
      expect(geo().coerce({ lat: 1.5, lng: -2.5, junk: true })).toEqual({ lat: 1.5, lng: -2.5 })
    })

    it('coerces alternate spellings', () => {
      expect(geo().coerce({ latitude: 10, longitude: 20 })).toEqual({ lat: 10, lng: 20 })
      expect(geo().coerce({ lat: 10, lon: 20 })).toEqual({ lat: 10, lng: 20 })
    })

    it('parses "lat, lng" text', () => {
      expect(geo().coerce('52.52, 13.405')).toEqual({ lat: 52.52, lng: 13.405 })
      expect(geo().coerce('not a point')).toBeNull()
      expect(geo().coerce('99, 0')).toBeNull()
    })

    it('returns null for invalid input', () => {
      expect(geo().coerce(null)).toBeNull()
      expect(geo().coerce(42)).toBeNull()
      expect(geo().coerce({ lat: 200, lng: 0 })).toBeNull()
    })
  })
})
