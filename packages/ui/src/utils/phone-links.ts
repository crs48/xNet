/**
 * Phone number detection for plain user text (0170, phase 2).
 *
 * Kept in its own module so libphonenumber's metadata (~80 kB even in the
 * min build) only loads when a surface opts into phone detection — import
 * this module dynamically, never statically from the entry path.
 */
import type { LinkToken } from './linkify'
import { findPhoneNumbersInText, type CountryCode } from 'libphonenumber-js/min'

/**
 * Derive a default country for national-format numbers from the browser
 * locale region ("en-US" → "US"). International (+…) numbers don't need it.
 */
export function localeDefaultCountry(locale?: string): CountryCode | undefined {
  const language = locale ?? (typeof navigator !== 'undefined' ? navigator.language : undefined)
  const region = language?.split('-')[1]
  if (region && /^[A-Za-z]{2}$/.test(region)) {
    return region.toUpperCase() as CountryCode
  }
  return undefined
}

/** Find phone tokens in plain text; hrefs are E.164 tel: URIs. */
export function findPhoneTokens(text: string, defaultCountry?: CountryCode): LinkToken[] {
  const country = defaultCountry ?? localeDefaultCountry()
  return findPhoneNumbersInText(text, country ? { defaultCountry: country } : undefined).map(
    (match) => ({
      type: 'phone' as const,
      text: text.slice(match.startsAt, match.endsAt),
      href: `tel:${match.number.number}`,
      start: match.startsAt,
      end: match.endsAt
    })
  )
}
