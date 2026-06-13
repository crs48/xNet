import { describe, expect, it } from 'vitest'
import { findPhoneTokens, localeDefaultCountry } from './phone-links'

describe('localeDefaultCountry', () => {
  it('derives the region from a BCP 47 locale', () => {
    expect(localeDefaultCountry('en-US')).toBe('US')
    expect(localeDefaultCountry('de-DE')).toBe('DE')
  })

  it('returns undefined when the locale has no two-letter region', () => {
    expect(localeDefaultCountry('fr')).toBeUndefined()
    expect(localeDefaultCountry('zh-Hans-CN')).toBeUndefined()
  })
})

describe('findPhoneTokens', () => {
  it('finds international numbers without a default country', () => {
    const text = 'call +1 415 555 2671 today'
    const tokens = findPhoneTokens(text)
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toMatchObject({ type: 'phone', href: 'tel:+14155552671' })
    expect(text.slice(tokens[0].start, tokens[0].end)).toBe('+1 415 555 2671')
  })

  it('finds national-format numbers with an explicit default country', () => {
    const tokens = findPhoneTokens('call (415) 555-2671 today', 'US')
    expect(tokens).toHaveLength(1)
    expect(tokens[0].href).toBe('tel:+14155552671')
  })

  it('does not match year ranges', () => {
    expect(findPhoneTokens('shipped in 2024-2025 as planned', 'US')).toEqual([])
  })

  it('does not match prices', () => {
    expect(findPhoneTokens('raised $1,415,555 in funding', 'US')).toEqual([])
  })

  it('does not match plain digit ids', () => {
    expect(findPhoneTokens('order 12345 confirmed', 'US')).toEqual([])
  })
})
